from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from support_agent.agent import Agent
from support_agent.api import create_app
from support_agent.factory import build_agent, build_registry
from support_agent.llm import ScriptedLLM


@pytest.fixture
def client(data_dir) -> TestClient:
    return TestClient(create_app(lambda: build_agent(demo=True, data_dir=data_dir)))


def test_health(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok"}


def test_ask_demo(client: TestClient) -> None:
    response = client.post("/ask", json={"question": "When will I get my refund?"})
    assert response.status_code == 200
    body = response.json()
    assert body["stop_reason"] == "final_answer"
    assert body["sources"][0] == "returns-and-refunds#refunds"
    assert body["tool_calls"] == [
        {"name": "search_knowledge_base", "ok": True, "blocked": False, "error": None}
    ]
    assert body["guardrail_flags"] == 0


@pytest.mark.parametrize("payload", [{}, {"question": ""}, {"question": "   "}, {"q": "hi"}])
def test_ask_validation(client: TestClient, payload: dict) -> None:
    assert client.post("/ask", json=payload).status_code == 422


def test_provider_failure_maps_to_502(data_dir) -> None:
    app = create_app(lambda: Agent(ScriptedLLM([]), build_registry(data_dir)))
    response = TestClient(app).post("/ask", json={"question": "hello"})
    assert response.status_code == 502
    assert "exhausted" in response.json()["detail"]


def test_default_factory_reads_demo_env(monkeypatch, data_dir) -> None:
    monkeypatch.setenv("SUPPORT_AGENT_DEMO", "1")
    monkeypatch.setenv("SUPPORT_AGENT_DATA_DIR", str(data_dir))
    response = TestClient(create_app()).post("/ask", json={"question": "Where is order A1002?"})
    assert response.status_code == 200
    assert "A1002 is processing" in response.json()["answer"]
