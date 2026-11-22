"""Unit tests for the strict 10% Usage Shield & Token Estimator."""

from pathlib import Path

from eschaton.config import EschatonConfig
from eschaton.guard.shield import UsageShield
from eschaton.guard.tokenizer import estimate_prompt_cost, estimate_tokens
from eschaton.guard.usage_tracker import UsageSnapshot, UsageTracker


def _make_config(tmp_path: Path, quota_tokens: int = 200_000) -> EschatonConfig:
    return EschatonConfig(
        state_dir=tmp_path / ".eschaton",
        estimated_quota_window_tokens=quota_tokens,
        min_remaining_usage_percent=10.0,
        economy_threshold_percent=15.0,
    )


def test_estimate_tokens_handles_code_and_turkish():
    text = "Merhaba dünya! def hesapla(x: int) -> int: return x * 2"
    tokens = estimate_tokens(text)
    assert tokens > 10
    assert estimate_tokens("") == 0


def test_hard_lock_at_or_below_10_percent(tmp_path: Path):
    cfg = _make_config(tmp_path)
    shield = UsageShield(cfg)

    for remaining in (10.0, 9.9, 5.0, 0.0):
        snap = UsageSnapshot(used_percent=100.0 - remaining, remaining_percent=remaining)
        decision = shield.evaluate(
            prompt="Kısa bir düzeltme yap",
            model_name="gemini-3-flash",
            usage=snap,
        )
        assert decision.allowed is False
        assert decision.status_code == "BLOCKED_FLOOR_10_PERCENT"


def test_projected_breach_blocks_and_suggests_split(tmp_path: Path):
    # Small quota window so a medium prompt costs > 1.5%
    cfg = _make_config(tmp_path, quota_tokens=100_000)
    shield = UsageShield(cfg)

    # Remaining is 11.0% — even economy model will cross 10.0% for a large prompt
    snap = UsageSnapshot(used_percent=89.0, remaining_percent=11.0)
    large_prompt = ("Bu büyük bir mimari yeniden yazım görevidir. " * 120).strip()

    decision = shield.evaluate(
        prompt=large_prompt,
        model_name="claude-opus-4.6",
        usage=snap,
        role="code_implementer",
    )
    assert decision.allowed is False
    assert decision.status_code == "BLOCKED_PROJECTED_BREACH"
    assert decision.optimized_prompt_suggestion is not None
    assert len(decision.split_chunks) >= 2


def test_economy_mode_auto_switches_between_10_and_15_percent(tmp_path: Path):
    cfg = _make_config(tmp_path, quota_tokens=2_000_000)
    shield = UsageShield(cfg)

    snap = UsageSnapshot(used_percent=86.0, remaining_percent=14.0)
    decision = shield.evaluate(
        prompt="Fix the typo in README.md",
        model_name="claude-opus-4.6",
        usage=snap,
        role="quick_helper",
    )
    assert decision.allowed is True
    assert decision.status_code == "ECONOMY_MODE"
    assert decision.economy_mode_active is True
    assert decision.recommended_model == "gemini-2.5-flash"
    assert decision.projected_remaining_after >= 10.0


def test_context_overflow_is_blocked(tmp_path: Path):
    cfg = _make_config(tmp_path, quota_tokens=50_000_000)
    shield = UsageShield(cfg)

    snap = UsageSnapshot(used_percent=10.0, remaining_percent=90.0)
    # Huge context exceeding claude-sonnet-4.6's 200k context window
    huge_context = ["token " * 120_000, "more " * 120_000]
    decision = shield.evaluate(
        prompt="Özetle",
        model_name="claude-sonnet-4.6",
        usage=snap,
        context_texts=huge_context,
    )
    assert decision.allowed is False
    assert decision.status_code == "BLOCKED_CONTEXT_OVERFLOW"
    assert decision.token_estimate.context_overflow is True


def test_usage_tracker_persists_consumption(tmp_path: Path):
    cfg = _make_config(tmp_path)
    tracker = UsageTracker(cfg)
    snap0 = tracker.set_manual_usage(80.0)
    assert snap0.remaining_percent == 80.0

    snap1 = tracker.record_consumption(weighted_tokens=10_000, estimated_percent=2.5)
    assert snap1.remaining_percent == 77.5
    assert snap1.cumulative_weighted_tokens == 10_000


def test_prompt_cost_respects_model_multiplier():
    flash = estimate_prompt_cost("Write a test", model_name="gemini-3-flash")
    opus = estimate_prompt_cost("Write a test", model_name="claude-opus-4.6")
    assert opus.estimated_quota_percent > flash.estimated_quota_percent
