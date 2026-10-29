"""Optional HTTP API. Run with:

    uvicorn support_agent.api:create_app --factory

Set SUPPORT_AGENT_DEMO=1 to use the offline demo model.
"""

from __future__ import annotations

import os
from collections.abc import Callable
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .agent import Agent
from .factory import build_agent
from .llm import LLMError


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)


class ToolCallOut(BaseModel):
    name: str
    ok: bool
    blocked: bool
    error: str | None = None


class AskResponse(BaseModel):
    answer: str
    sources: list[str]
    steps: int
    stop_reason: str
    tool_calls: list[ToolCallOut]
    guardrail_flags: int


def create_app(agent_factory: Callable[[], Agent] | None = None) -> FastAPI:
    app = FastAPI(title="Support Agent", version="0.1.0")
    # Built once at startup so configuration errors surface immediately.
    if agent_factory is not None:
        app.state.agent = agent_factory()
    else:
        demo = os.environ.get("SUPPORT_AGENT_DEMO", "").lower() in ("1", "true", "yes")
        app.state.agent = build_agent(demo=demo)

    @app.get("/health")
    def health() -> dict[str, Any]:
        return {"status": "ok"}

    @app.post("/ask")
    def ask(request: AskRequest) -> AskResponse:
        agent: Agent = app.state.agent
        if not request.question.strip():
            raise HTTPException(status_code=422, detail="question must not be blank")
        try:
            result = agent.run(request.question)
        except LLMError as exc:
            raise HTTPException(status_code=502, detail=f"model provider failed: {exc}") from exc
        return AskResponse(
            answer=result.answer,
            sources=result.sources,
            steps=result.steps,
            stop_reason=result.stop_reason,
            tool_calls=[
                ToolCallOut(name=c.name, ok=c.ok, blocked=c.blocked, error=c.error)
                for c in result.tool_calls
            ],
            guardrail_flags=len(result.guardrail_findings),
        )

    return app
