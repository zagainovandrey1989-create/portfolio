"""LLM provider interface and implementations.

Messages use the OpenAI-compatible chat format (``{"role": ..., "content": ...}``),
which is the lowest common denominator supported by most hosted and self-hosted
inference servers.
"""

from __future__ import annotations

import json
import os
import re
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable

import httpx

Message = dict[str, Any]
ToolSchema = dict[str, Any]


class LLMError(RuntimeError):
    """The model provider failed or returned something unusable."""


class ConfigError(ValueError):
    """Required provider configuration is missing or invalid."""


@dataclass(frozen=True)
class ToolCall:
    """A function call requested by the model. ``arguments`` is the raw JSON string."""

    id: str
    name: str
    arguments: str


@dataclass(frozen=True)
class LLMResponse:
    content: str | None = None
    tool_calls: tuple[ToolCall, ...] = ()

    @property
    def wants_tools(self) -> bool:
        return bool(self.tool_calls)


@runtime_checkable
class LLMClient(Protocol):
    def complete(self, messages: Sequence[Message], tools: Sequence[ToolSchema]) -> LLMResponse:
        """Return the next assistant turn for the conversation."""
        ...


# ---------------------------------------------------------------------------
# OpenAI-compatible HTTP client
# ---------------------------------------------------------------------------

ENV_BASE_URL = "SUPPORT_AGENT_BASE_URL"
ENV_MODEL = "SUPPORT_AGENT_MODEL"
ENV_API_KEY = "SUPPORT_AGENT_API_KEY"


class OpenAICompatibleClient:
    """Minimal client for any server exposing an OpenAI-compatible API
    (``POST {base_url}/chat/completions`` with ``tools`` / function calling)."""

    def __init__(
        self,
        base_url: str,
        model: str,
        api_key: str | None = None,
        *,
        timeout: float = 30.0,
        temperature: float = 0.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        if not base_url:
            raise ConfigError("base_url must not be empty")
        if not model:
            raise ConfigError("model must not be empty")
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        self.model = model
        self.temperature = temperature
        self._http = httpx.Client(
            base_url=base_url.rstrip("/"),
            headers=headers,
            timeout=timeout,
            transport=transport,
        )

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None, **kwargs: Any) -> OpenAICompatibleClient:
        env = dict(os.environ) if env is None else env
        base_url = env.get(ENV_BASE_URL, "").strip()
        model = env.get(ENV_MODEL, "").strip()
        missing = [
            name for name, value in ((ENV_BASE_URL, base_url), (ENV_MODEL, model)) if not value
        ]
        if missing:
            raise ConfigError(
                "Missing environment variable(s): "
                + ", ".join(missing)
                + f". Set them (and optionally {ENV_API_KEY}) or use --demo."
            )
        return cls(base_url, model, env.get(ENV_API_KEY) or None, **kwargs)

    def close(self) -> None:
        self._http.close()

    def complete(self, messages: Sequence[Message], tools: Sequence[ToolSchema]) -> LLMResponse:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": list(messages),
            "temperature": self.temperature,
        }
        if tools:
            payload["tools"] = list(tools)
            payload["tool_choice"] = "auto"
        try:
            response = self._http.post("/chat/completions", json=payload)
            response.raise_for_status()
            body = response.json()
        except httpx.HTTPStatusError as exc:
            raise LLMError(
                f"Provider returned HTTP {exc.response.status_code}: {exc.response.text[:300]}"
            ) from exc
        except httpx.HTTPError as exc:
            raise LLMError(f"Provider request failed: {exc}") from exc
        except ValueError as exc:
            raise LLMError("Provider returned a non-JSON response") from exc
        return self._parse(body)

    @staticmethod
    def _parse(body: Any) -> LLMResponse:
        try:
            message = body["choices"][0]["message"]
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMError("Provider response has no choices[0].message") from exc
        calls = []
        for index, raw in enumerate(message.get("tool_calls") or []):
            function = raw.get("function") or {}
            name = function.get("name")
            if not name:
                raise LLMError("Provider returned a tool call without a function name")
            arguments = function.get("arguments") or "{}"
            if not isinstance(arguments, str):
                arguments = json.dumps(arguments)
            calls.append(
                ToolCall(id=raw.get("id") or f"call_{index}", name=name, arguments=arguments)
            )
        return LLMResponse(content=message.get("content"), tool_calls=tuple(calls))


# ---------------------------------------------------------------------------
# Deterministic fakes
# ---------------------------------------------------------------------------

ScriptStep = LLMResponse | Callable[[Sequence[Message]], LLMResponse]


@dataclass
class ScriptedLLM:
    """Replays a fixed list of responses. Steps may be callables that inspect the
    conversation so far. Every call's messages are recorded for assertions."""

    script: Iterable[ScriptStep]
    calls: list[list[Message]] = field(default_factory=list)

    def __post_init__(self) -> None:
        self._steps = iter(list(self.script))

    def complete(self, messages: Sequence[Message], tools: Sequence[ToolSchema]) -> LLMResponse:
        self.calls.append(json.loads(json.dumps(list(messages))))
        try:
            step = next(self._steps)
        except StopIteration:
            raise LLMError("ScriptedLLM script exhausted") from None
        return step(messages) if callable(step) else step


def tool_call(name: str, call_id: str = "call_1", **arguments: Any) -> ToolCall:
    """Convenience constructor used by scripts and tests."""
    return ToolCall(id=call_id, name=name, arguments=json.dumps(arguments))


ORDER_ID_RE = re.compile(r"\b[A-Z]\d{4}\b")
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_REDACTION_RE = re.compile(r"\[removed:[^\]]*\]\s*")


class DemoLLM:
    """A rule-based, deterministic stand-in for a real model, used by ``--demo``.

    Turn 1: request tools (knowledge-base search, order lookup if an order id is
    present, ticket creation if asked and an email is given).
    Turn 2: compose an answer from the tool results with source citations.
    It never reads instructions out of tool results; it only extracts fields.
    """

    def complete(self, messages: Sequence[Message], tools: Sequence[ToolSchema]) -> LLMResponse:
        last_user = max(i for i, m in enumerate(messages) if m["role"] == "user")
        question = str(messages[last_user]["content"])
        tool_messages = [m for m in messages[last_user + 1 :] if m["role"] == "tool"]
        if not tool_messages:
            return LLMResponse(tool_calls=tuple(self._plan(question)))
        return LLMResponse(content=self._answer(tool_messages))

    @staticmethod
    def _plan(question: str) -> list[ToolCall]:
        calls = [tool_call("search_knowledge_base", "call_search", query=question, top_k=3)]
        order = ORDER_ID_RE.search(question)
        if order:
            calls.append(tool_call("get_order_status", "call_order", order_id=order.group()))
        email = EMAIL_RE.search(question)
        if email and "ticket" in question.lower():
            calls.append(
                tool_call(
                    "create_ticket",
                    "call_ticket",
                    customer_email=email.group(),
                    subject=question[:80],
                    description=question,
                )
            )
        return calls

    @staticmethod
    def _answer(tool_messages: Sequence[Message]) -> str:
        parts: list[str] = []
        for message in tool_messages:
            payload = json.loads(message["content"])
            if not payload.get("ok"):
                parts.append(f"I could not complete one step: {payload['error']['message']}")
                continue
            result = payload["result"]
            if "results" in result:
                parts.extend(DemoLLM._summarize_hits(result["results"]))
            elif "order_id" in result:
                parts.append(DemoLLM._summarize_order(result))
            elif "ticket_id" in result:
                parts.append(f"I created support ticket {result['ticket_id']} for you.")
        if not parts:
            return "I could not find an answer in the knowledge base. I can open a ticket for you."
        return "\n".join(parts)

    @staticmethod
    def _summarize_hits(hits: list[dict[str, Any]]) -> list[str]:
        if not hits:
            return ["I could not find this topic in the knowledge base."]
        best = hits[0]["score"]
        lines = []
        for hit in hits[:2]:
            if hit["score"] < 0.6 * best:
                break
            text = _REDACTION_RE.sub("", hit["text"]).strip()
            sentences = re.split(r"(?<=[.!?])\s+", " ".join(text.split()))
            snippet = " ".join(sentences[:2]).strip()
            if snippet:
                lines.append(f"{snippet} [source: {hit['source_id']}]")
        return lines

    @staticmethod
    def _summarize_order(order: dict[str, Any]) -> str:
        line = f"Order {order['order_id']} is {order['status']}."
        if order.get("carrier") and order.get("tracking_number"):
            line += f" Carrier: {order['carrier']}, tracking number {order['tracking_number']}."
        if order.get("estimated_delivery"):
            line += f" Estimated delivery: {order['estimated_delivery']}."
        return line
