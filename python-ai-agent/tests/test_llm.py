from __future__ import annotations

import json

import httpx
import pytest

from support_agent.llm import (
    ConfigError,
    DemoLLM,
    LLMClient,
    LLMError,
    LLMResponse,
    OpenAICompatibleClient,
    ScriptedLLM,
    tool_call,
)

TOOLS = [{"type": "function", "function": {"name": "noop", "description": "x", "parameters": {}}}]


def client_with(handler) -> OpenAICompatibleClient:
    return OpenAICompatibleClient(
        "https://llm.example.test/v1/",
        "test-model",
        "test-key",
        transport=httpx.MockTransport(handler),
    )


def test_openai_compatible_request_and_tool_call_parsing() -> None:
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("authorization")
        seen["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": None,
                            "tool_calls": [
                                {
                                    "id": "c1",
                                    "type": "function",
                                    "function": {"name": "noop", "arguments": '{"x": 1}'},
                                }
                            ],
                        }
                    }
                ]
            },
        )

    response = client_with(handler).complete([{"role": "user", "content": "hi"}], TOOLS)
    assert seen["url"] == "https://llm.example.test/v1/chat/completions"
    assert seen["auth"] == "Bearer test-key"
    assert seen["body"]["model"] == "test-model"
    assert seen["body"]["tools"] == TOOLS
    assert seen["body"]["tool_choice"] == "auto"
    assert response.tool_calls[0].name == "noop"
    assert json.loads(response.tool_calls[0].arguments) == {"x": 1}


def test_openai_compatible_text_reply_without_tools() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert "tools" not in json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": "Hello"}}]})

    response = client_with(handler).complete([{"role": "user", "content": "hi"}], [])
    assert response == LLMResponse(content="Hello")


def test_dict_arguments_are_normalized_to_json_string() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "tool_calls": [{"function": {"name": "noop", "arguments": {"x": 2}}}]
                        }
                    }
                ]
            },
        )

    call = client_with(handler).complete([], TOOLS).tool_calls[0]
    assert call.id == "call_0"
    assert json.loads(call.arguments) == {"x": 2}


@pytest.mark.parametrize(
    ("response", "message"),
    [
        (httpx.Response(429, text="rate limited"), "HTTP 429"),
        (httpx.Response(200, text="<html>"), "non-JSON"),
        (httpx.Response(200, json={"choices": []}), "no choices"),
    ],
)
def test_provider_failures_raise_llm_error(response: httpx.Response, message: str) -> None:
    with pytest.raises(LLMError, match=message):
        client_with(lambda request: response).complete([], [])


def test_network_error_raises_llm_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("boom", request=request)

    with pytest.raises(LLMError, match="request failed"):
        client_with(handler).complete([], [])


def test_from_env() -> None:
    with pytest.raises(ConfigError, match="SUPPORT_AGENT_BASE_URL, SUPPORT_AGENT_MODEL"):
        OpenAICompatibleClient.from_env({})
    client = OpenAICompatibleClient.from_env(
        {"SUPPORT_AGENT_BASE_URL": "http://localhost:8080/v1", "SUPPORT_AGENT_MODEL": "local"}
    )
    assert client.model == "local"
    assert isinstance(client, LLMClient)


def test_scripted_llm_replays_and_records() -> None:
    llm = ScriptedLLM(
        [
            LLMResponse(tool_calls=(tool_call("noop", x=1),)),
            lambda messages: LLMResponse(content=f"saw {len(messages)} messages"),
        ]
    )
    assert llm.complete([{"role": "user", "content": "a"}], []).tool_calls[0].name == "noop"
    assert llm.complete([{"role": "user", "content": "a"}] * 3, []).content == "saw 3 messages"
    assert len(llm.calls) == 2
    with pytest.raises(LLMError, match="exhausted"):
        llm.complete([], [])


def test_demo_llm_plans_tools_from_question() -> None:
    response = DemoLLM().complete(
        [{"role": "user", "content": "Where is A1002? Open a ticket for bo@example.com"}], TOOLS
    )
    assert [c.name for c in response.tool_calls] == [
        "search_knowledge_base",
        "get_order_status",
        "create_ticket",
    ]
    assert json.loads(response.tool_calls[1].arguments) == {"order_id": "A1002"}
