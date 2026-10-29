from __future__ import annotations

import json

import pytest

from support_agent.agent import MAX_STEPS_ANSWER, SYSTEM_PROMPT, Agent, AgentConfig
from support_agent.llm import LLMError, LLMResponse, ScriptedLLM, tool_call
from support_agent.tools import ToolRegistry


def tool_messages(messages: list[dict]) -> list[dict]:
    return [json.loads(m["content"]) for m in messages if m["role"] == "tool"]


def test_multi_step_tool_calls_and_cited_answer(registry: ToolRegistry) -> None:
    llm = ScriptedLLM(
        [
            LLMResponse(
                tool_calls=(tool_call("search_knowledge_base", "c1", query="refund timing"),)
            ),
            LLMResponse(tool_calls=(tool_call("get_order_status", "c2", order_id="A1003"),)),
            LLMResponse(
                content=(
                    "Your order A1003 was delivered. Refunds arrive within 5 business days "
                    "after the return reaches us [source: returns-and-refunds#refunds]."
                )
            ),
        ]
    )
    result = Agent(llm, registry).run("I want a refund for A1003, how long does it take?")

    assert result.stop_reason == "final_answer"
    assert result.steps == 3
    assert result.sources == ["returns-and-refunds#refunds"]
    assert result.unverified_citations == []
    assert [(c.step, c.name, c.ok) for c in result.tool_calls] == [
        (1, "search_knowledge_base", True),
        (2, "get_order_status", True),
    ]

    # The model sees the system prompt, the question, and each tool result linked by id.
    final_call = llm.calls[-1]
    assert final_call[0] == {"role": "system", "content": SYSTEM_PROMPT}
    assert final_call[1]["role"] == "user"
    assert [m["role"] for m in final_call[2:]] == ["assistant", "tool", "assistant", "tool"]
    assert final_call[3]["tool_call_id"] == "c1"
    assert final_call[2]["tool_calls"][0]["function"]["name"] == "search_knowledge_base"
    search_payload, order_payload = tool_messages(final_call)
    assert search_payload["untrusted_content"] is True
    assert search_payload["result"]["results"][0]["source_id"] == "returns-and-refunds#refunds"
    assert order_payload == {
        "ok": True,
        "result": {
            "order_id": "A1003",
            "status": "delivered",
            "carrier": "ParcelPost",
            "tracking_number": "PP987654321",
            "estimated_delivery": None,
        },
    }


def test_parallel_tool_calls_in_one_step(registry: ToolRegistry) -> None:
    llm = ScriptedLLM(
        [
            LLMResponse(
                tool_calls=(
                    tool_call("get_order_status", "a", order_id="A1001"),
                    tool_call("get_order_status", "b", order_id="A1002"),
                )
            ),
            LLMResponse(content="Both orders found."),
        ]
    )
    result = Agent(llm, registry).run("status of A1001 and A1002?")
    assert [c.step for c in result.tool_calls] == [1, 1]
    assert [m.get("tool_call_id") for m in llm.calls[-1] if m["role"] == "tool"] == ["a", "b"]


def test_max_steps_guard(registry: ToolRegistry) -> None:
    looping = [
        LLMResponse(tool_calls=(tool_call("get_order_status", f"c{i}", order_id="A1001"),))
        for i in range(10)
    ]
    llm = ScriptedLLM(looping)
    result = Agent(llm, registry, AgentConfig(max_steps=3)).run("loop forever")
    assert result.stop_reason == "max_steps"
    assert result.steps == 3
    assert result.answer == MAX_STEPS_ANSWER
    assert result.sources == []
    assert len(llm.calls) == 3
    assert len(result.tool_calls) == 3


def test_invalid_max_steps() -> None:
    with pytest.raises(ValueError, match="max_steps"):
        AgentConfig(max_steps=0)


def test_tool_errors_are_fed_back_and_model_recovers(registry: ToolRegistry) -> None:
    llm = ScriptedLLM(
        [
            LLMResponse(tool_calls=(tool_call("get_order_status", "c1", order_id="Z9999"),)),
            LLMResponse(tool_calls=(tool_call("get_order_status", "c2", order_id="bad id"),)),
            LLMResponse(tool_calls=(tool_call("cancel_order", "c3", order_id="A1001"),)),
            LLMResponse(content="I could not find order Z9999. Please double-check the id."),
        ]
    )
    result = Agent(llm, registry).run("Where is Z9999?")
    assert result.stop_reason == "final_answer"
    errors = [p["error"]["type"] for p in tool_messages(llm.calls[-1])]
    assert errors == ["tool_error", "invalid_arguments", "unknown_tool"]
    assert [c.ok for c in result.tool_calls] == [False, False, False]
    assert "Z9999 was not found" in result.tool_calls[0].error


def test_citations_must_come_from_retrieved_documents(registry: ToolRegistry) -> None:
    llm = ScriptedLLM(
        [
            LLMResponse(tool_calls=(tool_call("search_knowledge_base", query="tracking number"),)),
            LLMResponse(
                content=(
                    "Tracking is emailed when the parcel ships [source: shipping-policy#tracking]. "
                    "Also see [source: secret-doc#admin] "
                    "and again [source: shipping-policy#tracking]."
                )
            ),
        ]
    )
    result = Agent(llm, registry).run("When do I get tracking?")
    assert result.sources == ["shipping-policy#tracking"]
    assert result.unverified_citations == ["secret-doc#admin"]


def test_history_is_included_and_empty_question_rejected(registry: ToolRegistry) -> None:
    llm = ScriptedLLM([LLMResponse(content="You're welcome!")])
    history = [{"role": "user", "content": "hi"}, {"role": "assistant", "content": "Hello!"}]
    result = Agent(llm, registry).run("thanks", history=history)
    assert result.answer == "You're welcome!"
    assert [m["content"] for m in llm.calls[0][1:]] == ["hi", "Hello!", "thanks"]
    with pytest.raises(ValueError, match="empty"):
        Agent(llm, registry).run("   ")


def test_provider_errors_propagate(registry: ToolRegistry) -> None:
    with pytest.raises(LLMError):
        Agent(ScriptedLLM([]), registry).run("hello")


def test_agent_with_openai_compatible_client_over_mock_http(registry: ToolRegistry) -> None:
    """End-to-end through the real HTTP client against a fake chat-completions server."""
    import httpx

    from support_agent.llm import OpenAICompatibleClient

    turns = iter(
        [
            {
                "tool_calls": [
                    {
                        "id": "t1",
                        "type": "function",
                        "function": {
                            "name": "search_knowledge_base",
                            "arguments": '{"query": "express shipping cost"}',
                        },
                    }
                ]
            },
            {"content": "Express shipping costs $15 [source: shipping-policy#domestic-shipping]."},
        ]
    )
    requests: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(json.loads(request.content))
        return httpx.Response(200, json={"choices": [{"message": next(turns)}]})

    llm = OpenAICompatibleClient("http://fake.test/v1", "m", transport=httpx.MockTransport(handler))
    result = Agent(llm, registry).run("How much is express shipping?")
    assert result.sources == ["shipping-policy#domestic-shipping"]
    assert requests[1]["messages"][-1]["role"] == "tool"
    assert requests[1]["messages"][-1]["tool_call_id"] == "t1"
    assert {t["function"]["name"] for t in requests[0]["tools"]} == set(registry.names())
