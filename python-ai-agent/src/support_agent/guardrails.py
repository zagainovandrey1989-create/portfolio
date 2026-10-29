"""Prompt-injection defenses for untrusted tool output (e.g. retrieved documents).

Two layers:
1. Content layer: instruction-like sentences inside untrusted text are detected and
   replaced by a visible redaction marker before the model ever sees them.
2. Policy layer (enforced in the agent): once a run has ingested flagged content,
   side-effecting tools are blocked for the rest of that run.
The system prompt additionally tells the model that tool output is data.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

INJECTION_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = tuple(
    (name, re.compile(pattern, re.IGNORECASE))
    for name, pattern in (
        (
            "override_instructions",
            r"\b(ignore|disregard|forget|override)\b.{0,40}"
            r"\b(instructions?|rules|guidelines|prompts?)\b",
        ),
        ("role_change", r"\b(you are now|from now on,? you|act as|pretend to be)\b"),
        (
            "fake_system_message",
            r"\b(system|admin|developer)\s+(note|message|prompt|override|mode)\b",
        ),
        (
            "prompt_exfiltration",
            r"\b(reveal|print|show|output|repeat|leak)\b.{0,30}"
            r"\b(system prompt|hidden instructions|api key|secret)",
        ),
        (
            "tool_hijack",
            r"\b(call|invoke|execute|use|run)\s+(the\s+)?`?[a-z]+_[a-z_]+`?\s+(tool|function)\b",
        ),
    )
)

REDACTION_MARKER = "[removed: instruction-like content in untrusted document]"
_SENTENCE_SPLIT = re.compile(r"((?<=[.!?])\s+|\n+)")


@dataclass(frozen=True)
class GuardrailFinding:
    pattern: str
    excerpt: str
    location: str  # JSON-path-like location inside the tool result


def scan_text(text: str) -> list[str]:
    """Return names of injection patterns that match ``text``."""
    return [name for name, pattern in INJECTION_PATTERNS if pattern.search(text)]


def redact_text(text: str, location: str = "") -> tuple[str, list[GuardrailFinding]]:
    """Replace every sentence that matches an injection pattern with a marker."""
    findings: list[GuardrailFinding] = []
    out: list[str] = []
    previous_redacted = False
    for piece in _SENTENCE_SPLIT.split(text):
        if not piece.strip():
            out.append(piece)  # separator or empty split artefact
            continue
        matches = scan_text(piece)
        if not matches:
            out.append(piece)
            previous_redacted = False
            continue
        findings.extend(GuardrailFinding(m, piece.strip()[:120], location) for m in matches)
        if previous_redacted:
            # Collapse consecutive redacted sentences into a single marker.
            while out and not out[-1].strip():
                out.pop()
        else:
            out.append(REDACTION_MARKER)
        previous_redacted = True
    return "".join(out), findings


def sanitize(data: Any, location: str = "$") -> tuple[Any, list[GuardrailFinding]]:
    """Recursively redact every string inside a JSON-like structure."""
    if isinstance(data, str):
        return redact_text(data, location)
    if isinstance(data, dict):
        result, findings = {}, []
        for key, value in data.items():
            clean, found = sanitize(value, f"{location}.{key}")
            result[key] = clean
            findings.extend(found)
        return result, findings
    if isinstance(data, list):
        items, findings = [], []
        for index, value in enumerate(data):
            clean, found = sanitize(value, f"{location}[{index}]")
            items.append(clean)
            findings.extend(found)
        return items, findings
    return data, []
