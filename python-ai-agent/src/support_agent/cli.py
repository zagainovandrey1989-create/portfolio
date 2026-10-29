"""Command line entry point: ``python -m support_agent "question" [--demo]``."""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence

from .factory import build_agent, default_data_dir
from .llm import ConfigError, LLMError

EXIT_OK = 0
EXIT_ERROR = 1
EXIT_CONFIG = 2


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="support-agent",
        description="Ask the support agent a question. Uses an OpenAI-compatible API "
        "configured via SUPPORT_AGENT_BASE_URL / SUPPORT_AGENT_MODEL / SUPPORT_AGENT_API_KEY, "
        "or a deterministic offline model with --demo.",
    )
    parser.add_argument("question", help="The customer question.")
    parser.add_argument(
        "--demo", action="store_true", help="Run offline with the built-in demo model."
    )
    parser.add_argument(
        "--data-dir", default=None, help=f"Knowledge base folder (default: {default_data_dir()})."
    )
    parser.add_argument(
        "--max-steps", type=int, default=6, help="Maximum model turns (default: 6)."
    )
    parser.add_argument("--json", action="store_true", help="Print the full result as JSON.")
    parser.add_argument("--verbose", "-v", action="store_true", help="Print tool calls to stderr.")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        agent = build_agent(demo=args.demo, data_dir=args.data_dir, max_steps=args.max_steps)
        result = agent.run(args.question)
    except (ConfigError, FileNotFoundError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return EXIT_CONFIG
    except LLMError as exc:
        print(f"error: model provider failed: {exc}", file=sys.stderr)
        return EXIT_ERROR

    if args.verbose:
        for call in result.tool_calls:
            status = "blocked" if call.blocked else ("ok" if call.ok else f"error: {call.error}")
            print(f"[step {call.step}] {call.name}({call.arguments}) -> {status}", file=sys.stderr)
        for finding in result.guardrail_findings:
            print(f"[guardrail] {finding.pattern} at {finding.location}", file=sys.stderr)

    if args.json:
        print(json.dumps(result.to_dict(), indent=2, ensure_ascii=False))
    else:
        print(result.answer)
        if result.sources:
            print("\nSources: " + ", ".join(result.sources))
    return EXIT_OK if result.stop_reason == "final_answer" else EXIT_ERROR


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
