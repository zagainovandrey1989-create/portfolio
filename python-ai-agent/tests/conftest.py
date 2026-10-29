from __future__ import annotations

from pathlib import Path

import pytest

from support_agent.retrieval import KnowledgeBase
from support_agent.stores import OrderStore, TicketStore
from support_agent.tools import ToolRegistry, build_default_registry

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


@pytest.fixture(scope="session")
def data_dir() -> Path:
    return DATA_DIR


@pytest.fixture(scope="session")
def kb() -> KnowledgeBase:
    return KnowledgeBase.from_directory(DATA_DIR)


@pytest.fixture
def tickets() -> TicketStore:
    return TicketStore()


@pytest.fixture
def registry(kb: KnowledgeBase, tickets: TicketStore) -> ToolRegistry:
    return build_default_registry(kb, OrderStore(), tickets)
