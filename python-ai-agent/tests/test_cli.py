from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

from support_agent.cli import EXIT_CONFIG, EXIT_ERROR, EXIT_OK, main

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def test_demo_answers_with_sources(data_dir, capsys) -> None:
    code = main(
        ["--demo", "--data-dir", str(data_dir), "How long does international shipping take?"]
    )
    out = capsys.readouterr().out
    assert code == EXIT_OK
    assert "7 to 14 business days" in out
    assert "Sources: shipping-policy#international-shipping" in out


def test_demo_json_output_and_verbose_trace(data_dir, capsys) -> None:
    code = main(["--demo", "--json", "-v", "--data-dir", str(data_dir), "Where is order A1001?"])
    captured = capsys.readouterr()
    assert code == EXIT_OK
    payload = json.loads(captured.out)
    assert payload["stop_reason"] == "final_answer"
    assert "PP123456789" in payload["answer"]
    assert [c["name"] for c in payload["tool_calls"]] == [
        "search_knowledge_base",
        "get_order_status",
    ]
    assert "get_order_status" in captured.err


def test_max_steps_exit_code(data_dir, capsys) -> None:
    code = main(["--demo", "--max-steps", "1", "--data-dir", str(data_dir), "shipping?"])
    assert code == EXIT_ERROR
    assert "allowed number of steps" in capsys.readouterr().out


def test_missing_provider_config_suggests_demo(data_dir, capsys, monkeypatch) -> None:
    for name in ("SUPPORT_AGENT_BASE_URL", "SUPPORT_AGENT_MODEL", "SUPPORT_AGENT_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    code = main(["--data-dir", str(data_dir), "hello"])
    assert code == EXIT_CONFIG
    assert "--demo" in capsys.readouterr().err


def test_missing_data_dir(tmp_path, capsys) -> None:
    assert main(["--demo", "--data-dir", str(tmp_path / "nope"), "hello"]) == EXIT_CONFIG
    assert "not found" in capsys.readouterr().err


def test_python_dash_m_smoke() -> None:
    env = {k: v for k, v in os.environ.items() if not k.startswith("SUPPORT_AGENT_")}
    completed = subprocess.run(
        [sys.executable, "-m", "support_agent", "--demo", "Is water damage covered by warranty?"],
        cwd=PROJECT_ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    assert completed.returncode == 0, completed.stderr
    assert "water damage" in completed.stdout
    assert "Sources: warranty#" in completed.stdout
