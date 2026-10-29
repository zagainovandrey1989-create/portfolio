"""Tool registry with JSON-schema generation from type hints and pydantic validation."""

from __future__ import annotations

import inspect
import json
import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import Annotated, Any, Literal, get_type_hints

from pydantic import BaseModel, ConfigDict, Field, ValidationError, create_model

from .retrieval import KnowledgeBase
from .stores import OrderStore, TicketStore

logger = logging.getLogger(__name__)

ToolFunc = Callable[..., Any]


class ToolError(Exception):
    """An expected, user-facing failure (e.g. 'order not found'). Its message is shown
    to the model verbatim so it can recover."""


class ToolRegistrationError(ValueError):
    pass


class _StrictArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")


@dataclass(frozen=True)
class ToolResult:
    ok: bool
    data: Any = None
    error_type: str | None = None
    error_message: str | None = None

    def to_payload(self) -> dict[str, Any]:
        if self.ok:
            return {"ok": True, "result": self.data}
        return {"ok": False, "error": {"type": self.error_type, "message": self.error_message}}

    @classmethod
    def failure(cls, error_type: str, message: str) -> ToolResult:
        return cls(ok=False, error_type=error_type, error_message=message)


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    params_model: type[BaseModel]
    func: ToolFunc
    takes_model: bool = False
    side_effect: bool = False
    untrusted_output: bool = False

    def schema(self) -> dict[str, Any]:
        """OpenAI-compatible function-calling schema."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": _clean_schema(self.params_model.model_json_schema()),
            },
        }

    def invoke(self, args: BaseModel) -> Any:
        if self.takes_model:
            return self.func(args)
        return self.func(**{name: getattr(args, name) for name in type(args).model_fields})


def _clean_schema(node: Any) -> Any:
    """Drop pydantic's auto-generated ``title`` keywords (noise for the model) while
    keeping property *names* that happen to be called 'title'."""
    if isinstance(node, dict):
        cleaned = {}
        for key, value in node.items():
            if key == "title":
                continue
            if key in ("properties", "$defs"):
                cleaned[key] = {name: _clean_schema(sub) for name, sub in value.items()}
            else:
                cleaned[key] = _clean_schema(value)
        return cleaned
    if isinstance(node, list):
        return [_clean_schema(item) for item in node]
    return node


def _model_from_signature(func: ToolFunc, name: str) -> tuple[type[BaseModel], bool]:
    try:
        hints = get_type_hints(func, include_extras=True)
    except NameError as exc:
        raise ToolRegistrationError(
            f"Tool {name!r}: could not resolve type hints ({exc}); "
            "define argument types at module level"
        ) from exc
    params = list(inspect.signature(func).parameters.values())
    if len(params) == 1:
        annotation = hints.get(params[0].name)
        if inspect.isclass(annotation) and issubclass(annotation, BaseModel):
            return annotation, True
    fields: dict[str, Any] = {}
    for param in params:
        if param.kind in (param.VAR_POSITIONAL, param.VAR_KEYWORD):
            raise ToolRegistrationError(f"Tool {name!r}: *args/**kwargs are not supported")
        if param.name not in hints:
            raise ToolRegistrationError(
                f"Tool {name!r}: parameter {param.name!r} needs a type hint"
            )
        default = ... if param.default is inspect.Parameter.empty else param.default
        fields[param.name] = (hints[param.name], default)
    model_name = "".join(part.capitalize() for part in name.split("_")) + "Args"
    return create_model(model_name, __base__=_StrictArgs, **fields), False


def _first_paragraph(doc: str | None) -> str:
    if not doc:
        return ""
    return inspect.cleandoc(doc).split("\n\n", 1)[0].replace("\n", " ").strip()


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def register(
        self,
        func: ToolFunc | None = None,
        *,
        name: str | None = None,
        description: str | None = None,
        side_effect: bool = False,
        untrusted_output: bool = False,
    ) -> Any:
        """Register a function as a tool. Usable as ``@registry.register`` or
        ``@registry.register(side_effect=True)``."""

        def decorator(fn: ToolFunc) -> ToolFunc:
            tool_name = name or fn.__name__
            if tool_name in self._tools:
                raise ToolRegistrationError(f"Tool {tool_name!r} is already registered")
            desc = description or _first_paragraph(fn.__doc__)
            if not desc:
                raise ToolRegistrationError(f"Tool {tool_name!r} needs a description or docstring")
            model, takes_model = _model_from_signature(fn, tool_name)
            self._tools[tool_name] = Tool(
                name=tool_name,
                description=desc,
                params_model=model,
                func=fn,
                takes_model=takes_model,
                side_effect=side_effect,
                untrusted_output=untrusted_output,
            )
            return fn

        return decorator(func) if func is not None else decorator

    def __contains__(self, name: object) -> bool:
        return name in self._tools

    def __len__(self) -> int:
        return len(self._tools)

    def get(self, name: str) -> Tool | None:
        return self._tools.get(name)

    def names(self) -> list[str]:
        return list(self._tools)

    def schemas(self) -> list[dict[str, Any]]:
        return [tool.schema() for tool in self._tools.values()]

    def execute(self, name: str, arguments: str | dict[str, Any]) -> ToolResult:
        """Validate and run a tool. Never raises: every failure becomes a ToolResult
        that can be shown to the model."""
        tool = self._tools.get(name)
        if tool is None:
            return ToolResult.failure(
                "unknown_tool", f"Unknown tool {name!r}. Available tools: {', '.join(self._tools)}"
            )
        if isinstance(arguments, str):
            try:
                arguments = json.loads(arguments or "{}")
            except json.JSONDecodeError as exc:
                return ToolResult.failure(
                    "invalid_arguments", f"Arguments are not valid JSON: {exc}"
                )
        if not isinstance(arguments, dict):
            return ToolResult.failure("invalid_arguments", "Arguments must be a JSON object")
        try:
            args = tool.params_model.model_validate(arguments)
        except ValidationError as exc:
            problems = "; ".join(
                f"{'.'.join(str(p) for p in err['loc']) or '<root>'}: {err['msg']}"
                for err in exc.errors()
            )
            return ToolResult.failure("invalid_arguments", problems)
        try:
            data = tool.invoke(args)
        except ToolError as exc:
            return ToolResult.failure("tool_error", str(exc))
        except Exception as exc:
            logger.exception("Tool %s crashed", name)
            return ToolResult.failure(
                "internal_error", f"{type(exc).__name__}: tool failed unexpectedly"
            )
        if isinstance(data, BaseModel):
            data = data.model_dump(mode="json")
        return ToolResult(ok=True, data=data)


# ---------------------------------------------------------------------------
# Example tools
# ---------------------------------------------------------------------------


class CreateTicketArgs(_StrictArgs):
    customer_email: str = Field(
        pattern=r"^[\w.+-]+@[\w-]+\.[\w.-]+$", description="Customer email for follow-up."
    )
    subject: str = Field(min_length=5, max_length=120, description="Short summary of the issue.")
    description: str = Field(min_length=10, max_length=2000, description="Full issue details.")
    priority: Literal["low", "normal", "high"] = "normal"


def build_default_registry(
    kb: KnowledgeBase, orders: OrderStore, tickets: TicketStore
) -> ToolRegistry:
    registry = ToolRegistry()

    @registry.register(untrusted_output=True)
    def search_knowledge_base(
        query: Annotated[str, Field(min_length=2, max_length=500, description="Search query.")],
        top_k: Annotated[int, Field(ge=1, le=10, description="Number of passages.")] = 3,
    ) -> dict[str, Any]:
        """Search the support knowledge base and return the most relevant passages with
        their source ids and relevance scores."""
        hits = kb.search(query, top_k=top_k)
        return {
            "results": [
                {
                    "source_id": hit.chunk.source_id,
                    "title": hit.chunk.title,
                    "section": hit.chunk.heading,
                    "score": round(hit.score, 4),
                    "text": hit.chunk.text,
                }
                for hit in hits
            ]
        }

    @registry.register
    def get_order_status(
        order_id: Annotated[
            str, Field(pattern=r"^[A-Z]\d{4}$", description="Order id, e.g. A1001.")
        ],
    ) -> dict[str, Any]:
        """Look up the current status, carrier and tracking number of an order."""
        order = orders.get(order_id)
        if order is None:
            raise ToolError(f"Order {order_id} was not found.")
        return order.model_dump(mode="json")

    @registry.register(side_effect=True)
    def create_ticket(args: CreateTicketArgs) -> dict[str, Any]:
        """Open a support ticket for a human agent to follow up on."""
        ticket = tickets.create(
            customer_email=args.customer_email,
            subject=args.subject,
            description=args.description,
            priority=args.priority,
        )
        return ticket.model_dump(mode="json")

    return registry
