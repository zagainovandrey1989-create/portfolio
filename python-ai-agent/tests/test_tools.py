from __future__ import annotations

import json
from typing import Annotated, Literal

import pytest
from pydantic import BaseModel, Field

from support_agent.stores import TicketStore
from support_agent.tools import ToolError, ToolRegistrationError, ToolRegistry


class NoteArgs(BaseModel):
    title: str = Field(min_length=1)
    body: str = ""


def make_registry() -> ToolRegistry:
    registry = ToolRegistry()

    @registry.register
    def add(
        a: Annotated[int, Field(description="First addend.")],
        b: int = 1,
        mode: Literal["fast", "exact"] = "exact",
    ) -> int:
        """Add two integers.

        Longer explanation that should not end up in the description.
        """
        return a + b

    @registry.register(name="fail_expected")
    def fail_expected(reason: str) -> None:
        """Always fails with a ToolError."""
        raise ToolError(f"nope: {reason}")

    @registry.register
    def crash() -> None:
        """Always crashes."""
        raise RuntimeError("secret internal detail")

    return registry


class TestSchemaGeneration:
    def test_schema_from_type_hints(self) -> None:
        schema = make_registry().get("add").schema()
        assert schema["type"] == "function"
        fn = schema["function"]
        assert fn["name"] == "add"
        assert fn["description"] == "Add two integers."
        params = fn["parameters"]
        assert params["type"] == "object"
        assert params["required"] == ["a"]
        assert params["additionalProperties"] is False
        assert params["properties"]["a"] == {"type": "integer", "description": "First addend."}
        assert params["properties"]["b"] == {"type": "integer", "default": 1}
        assert params["properties"]["mode"]["enum"] == ["fast", "exact"]
        assert "title" not in json.dumps(params)

    def test_schema_from_pydantic_model_keeps_property_named_title(self) -> None:
        registry = ToolRegistry()

        @registry.register
        def save_note(args: NoteArgs) -> dict:
            """Save a note."""
            return {"saved": args.title}

        params = registry.get("save_note").schema()["function"]["parameters"]
        assert set(params["properties"]) == {"title", "body"}
        assert params["required"] == ["title"]
        assert registry.execute("save_note", {"title": "hi"}).data == {"saved": "hi"}

    def test_default_tools_schemas(self, registry: ToolRegistry) -> None:
        names = [s["function"]["name"] for s in registry.schemas()]
        assert names == ["search_knowledge_base", "get_order_status", "create_ticket"]
        ticket = registry.get("create_ticket")
        assert ticket.side_effect is True
        assert registry.get("search_knowledge_base").untrusted_output is True
        params = ticket.schema()["function"]["parameters"]
        assert set(params["required"]) == {"customer_email", "subject", "description"}

    def test_registration_errors(self) -> None:
        registry = make_registry()
        with pytest.raises(ToolRegistrationError, match="already registered"):
            registry.register(lambda a: a, name="add", description="dup")

        def no_hints(x):  # type: ignore[no-untyped-def]
            """Doc."""

        with pytest.raises(ToolRegistrationError, match="type hint"):
            registry.register(no_hints)

        def no_doc(x: int) -> int:
            return x

        with pytest.raises(ToolRegistrationError, match="description"):
            registry.register(no_doc)

        def unresolvable(x: UndefinedType) -> None:  # noqa: F821
            """Doc."""

        with pytest.raises(ToolRegistrationError, match="resolve type hints"):
            registry.register(unresolvable)


class TestExecution:
    def test_valid_call_with_json_string(self) -> None:
        result = make_registry().execute("add", '{"a": 2, "b": 3}')
        assert result.ok
        assert result.data == 5
        assert result.to_payload() == {"ok": True, "result": 5}

    @pytest.mark.parametrize(
        ("arguments", "expected"),
        [
            ('{"b": 2}', "a: Field required"),
            ('{"a": "two"}', "a: Input should be a valid integer"),
            ('{"a": 1, "c": 3}', "c: Extra inputs are not permitted"),
            ('{"a": 1, "mode": "slow"}', "mode: Input should be 'fast' or 'exact'"),
            ("{not json", "not valid JSON"),
            ("[1, 2]", "must be a JSON object"),
        ],
    )
    def test_invalid_arguments(self, arguments: str, expected: str) -> None:
        result = make_registry().execute("add", arguments)
        assert not result.ok
        assert result.error_type == "invalid_arguments"
        assert expected in result.error_message

    def test_unknown_tool(self) -> None:
        result = make_registry().execute("delete_everything", "{}")
        assert result.error_type == "unknown_tool"
        assert "add" in result.error_message

    def test_tool_error_is_reported(self) -> None:
        result = make_registry().execute("fail_expected", {"reason": "because"})
        assert result.to_payload() == {
            "ok": False,
            "error": {"type": "tool_error", "message": "nope: because"},
        }

    def test_unexpected_exception_is_contained_without_leaking_details(self) -> None:
        result = make_registry().execute("crash", {})
        assert result.error_type == "internal_error"
        assert "RuntimeError" in result.error_message
        assert "secret" not in result.error_message


class TestDefaultTools:
    def test_order_status(self, registry: ToolRegistry) -> None:
        result = registry.execute("get_order_status", {"order_id": "A1001"})
        assert result.ok
        assert result.data["status"] == "shipped"
        assert result.data["tracking_number"] == "PP123456789"
        assert result.data["estimated_delivery"] == "2026-11-04"

    def test_order_not_found_and_bad_format(self, registry: ToolRegistry) -> None:
        missing = registry.execute("get_order_status", {"order_id": "Z9999"})
        assert missing.error_type == "tool_error"
        assert "Z9999 was not found" in missing.error_message
        bad = registry.execute("get_order_status", {"order_id": "1001"})
        assert bad.error_type == "invalid_arguments"

    def test_create_ticket(self, registry: ToolRegistry, tickets: TicketStore) -> None:
        result = registry.execute(
            "create_ticket",
            {
                "customer_email": "ann@example.com",
                "subject": "Broken charger",
                "description": "The charger stopped working after a week.",
                "priority": "high",
            },
        )
        assert result.ok
        assert result.data["ticket_id"] == "T-0001"
        assert [t.subject for t in tickets.all()] == ["Broken charger"]

    def test_create_ticket_validation(self, registry: ToolRegistry, tickets: TicketStore) -> None:
        result = registry.execute(
            "create_ticket",
            {"customer_email": "not-an-email", "subject": "Hi", "description": "short"},
        )
        assert result.error_type == "invalid_arguments"
        for field_name in ("customer_email", "subject", "description"):
            assert field_name in result.error_message
        assert tickets.all() == []

    def test_search_returns_structured_hits(self, registry: ToolRegistry) -> None:
        result = registry.execute("search_knowledge_base", {"query": "warranty claim", "top_k": 2})
        hits = result.data["results"]
        assert len(hits) == 2
        assert hits[0]["source_id"] == "warranty#making-a-warranty-claim"
        assert set(hits[0]) == {"source_id", "title", "section", "score", "text"}
        assert hits[0]["score"] >= hits[1]["score"]
