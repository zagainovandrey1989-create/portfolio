"""Support Agent: a tool-calling support assistant with retrieval and guardrails."""

from .agent import Agent, AgentConfig, AgentResult
from .llm import DemoLLM, LLMClient, LLMResponse, OpenAICompatibleClient, ScriptedLLM, ToolCall
from .retrieval import BM25Retriever, EmbeddingRetriever, HashingEmbedder, KnowledgeBase
from .tools import ToolError, ToolRegistry, build_default_registry

__all__ = [
    "Agent",
    "AgentConfig",
    "AgentResult",
    "BM25Retriever",
    "DemoLLM",
    "EmbeddingRetriever",
    "HashingEmbedder",
    "KnowledgeBase",
    "LLMClient",
    "LLMResponse",
    "OpenAICompatibleClient",
    "ScriptedLLM",
    "ToolCall",
    "ToolError",
    "ToolRegistry",
    "build_default_registry",
]

__version__ = "0.1.0"
