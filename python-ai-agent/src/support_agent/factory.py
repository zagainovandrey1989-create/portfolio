"""Wiring helpers shared by the CLI and the HTTP API."""

from __future__ import annotations

import os
from pathlib import Path

from .agent import Agent, AgentConfig
from .llm import DemoLLM, LLMClient, OpenAICompatibleClient
from .retrieval import KnowledgeBase
from .stores import OrderStore, TicketStore
from .tools import ToolRegistry, build_default_registry

ENV_DATA_DIR = "SUPPORT_AGENT_DATA_DIR"


def default_data_dir() -> Path:
    return Path(os.environ.get(ENV_DATA_DIR, "data"))


def build_registry(data_dir: str | Path | None = None) -> ToolRegistry:
    kb = KnowledgeBase.from_directory(data_dir or default_data_dir())
    return build_default_registry(kb, OrderStore(), TicketStore())


def build_llm(demo: bool) -> LLMClient:
    return DemoLLM() if demo else OpenAICompatibleClient.from_env()


def build_agent(
    *,
    demo: bool,
    data_dir: str | Path | None = None,
    max_steps: int = 6,
    llm: LLMClient | None = None,
) -> Agent:
    return Agent(
        llm=llm or build_llm(demo),
        tools=build_registry(data_dir),
        config=AgentConfig(max_steps=max_steps),
    )
