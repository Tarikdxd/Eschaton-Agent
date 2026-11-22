"""Unit tests for the Benchmark-Researched Dynamic Model Selector (Nov 2026 models)."""

from pathlib import Path

from eschaton.config import EschatonConfig
from eschaton.models.selector import ModelSelector, TaskCategory


def _selector(tmp_path: Path) -> ModelSelector:
    cfg = EschatonConfig(state_dir=tmp_path / ".eschaton")
    return ModelSelector(config=cfg)


def test_classifies_prompt_categories(tmp_path: Path):
    sel = _selector(tmp_path)
    assert sel.classify_prompt("Build a responsive Tailwind CSS React dashboard UI") == TaskCategory.UI_FRONTEND
    assert sel.classify_prompt("Fix the crash and traceback in auth.py race condition") == TaskCategory.DEEP_DEBUGGING
    assert sel.classify_prompt("Design the microservice database schema architecture") == TaskCategory.ARCHITECTURE
    assert sel.classify_prompt("Add pytest unit tests for coverage verification") == TaskCategory.TESTING


def test_selects_top_ui_model_when_quota_is_high(tmp_path: Path):
    sel = _selector(tmp_path)
    result = sel.select(
        prompt="Create a modern responsive frontend dashboard UI with animations",
        available_models=["gemini-4-neon", "claude-sonnet-5.5", "gemini-3.8-flash"],
        remaining_usage_percent=90.0,
        role="ui_specialist",
        allow_network=False,
    )
    assert result.selected_model == "gemini-4-neon"
    assert result.task_category == TaskCategory.UI_FRONTEND
    assert result.economy_mode_applied is False


def test_selects_economy_model_when_quota_is_low(tmp_path: Path):
    sel = _selector(tmp_path)
    result = sel.select(
        prompt="Refactor the complex authentication pipeline",
        available_models=["claude-opus-5.5", "claude-sonnet-5.5", "gemini-3.8-flash"],
        remaining_usage_percent=12.5,
        allow_network=False,
    )
    assert result.economy_mode_applied is True
    assert result.selected_model == "gemini-3.8-flash"


def test_respects_antigravity_available_models_list(tmp_path: Path):
    sel = _selector(tmp_path)
    result = sel.select(
        prompt="Fix the failing pytest test suite and debug memory leak",
        available_models=["gpt-6.2-astra", "gemini-3.8-flash"],
        remaining_usage_percent=85.0,
        role="deep_debugger",
        allow_network=False,
    )
    assert result.selected_model == "gpt-6.2-astra"
