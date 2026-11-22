"""High-accuracy token and quota-cost estimation for Nov 2026 Antigravity & frontier models."""

from __future__ import annotations

import math
import re
from typing import Dict, List, Optional

from pydantic import BaseModel

# Relative quota cost multipliers per model family (1.0 = standard flagship baseline).
# Grounded in Nov 2026 Antigravity (Gemini 4 / 3.8), Anthropic (Claude 5.5 / 5.2), and OpenAI (GPT-6.2 / OSS) tiers.
MODEL_COST_MULTIPLIERS: Dict[str, float] = {
    # Google Antigravity Gemini 4 & 3.8 series
    "gemini-4-carbon": 1.6,
    "gemini-4-neon": 1.15,
    "gemini-4-argon": 1.1,
    "gemini-4-hydrogen": 0.45,
    "orchestrator": 0.85,
    "gemini-3.8-flash": 0.28,
    "gemini-3.7-flash": 0.28,
    "gemini-3.6-flash": 0.25,
    "gemini-3.1-pro": 0.9,
    # Anthropic Claude 5.x series (and legacy 4.6)
    "claude-fable-5.2": 2.6,
    "claude-fable-5-2": 2.6,
    "claude-opus-5.5": 1.8,
    "claude-opus-5-5": 1.8,
    "claude-sonnet-5.5": 1.1,
    "claude-sonnet-5-5": 1.1,
    "claude-haiku-5.5": 0.22,
    "claude-haiku-5-5": 0.22,
    "claude-opus-4.6": 2.1,
    "claude-sonnet-4.6": 1.25,
    # OpenAI series
    "gpt-6.2-astra": 1.6,
    "gpt-5.6": 1.35,
    "gpt-oss-120b": 0.55,
}

# Context window sizes (in tokens) per model family.
MODEL_CONTEXT_WINDOWS: Dict[str, int] = {
    "gemini-4-neon": 512_000,
    "gemini-4-carbon": 1_000_000,
    "gemini-4-argon": 1_000_000,
    "gemini-4-hydrogen": 512_000,
    "orchestrator": 512_000,
    "gemini-3.8-flash": 1_000_000,
    "gemini-3.7-flash": 1_000_000,
    "gemini-3.6-flash": 1_000_000,
    "gemini-3.1-pro": 1_000_000,
    "claude-fable-5.2": 1_000_000,
    "claude-fable-5-2": 1_000_000,
    "claude-opus-5.5": 1_000_000,
    "claude-opus-5-5": 1_000_000,
    "claude-sonnet-5.5": 1_000_000,
    "claude-sonnet-5-5": 1_000_000,
    "claude-haiku-5.5": 1_000_000,
    "claude-haiku-5-5": 1_000_000,
    "claude-opus-4.6": 1_000_000,
    "claude-sonnet-4.6": 1_000_000,
    "gpt-6.2-astra": 400_000,
    "gpt-5.6": 400_000,
    "gpt-oss-120b": 128_000,
}

# Expected output+thinking multiplier based on role / task intensity.
ROLE_OUTPUT_MULTIPLIERS: Dict[str, float] = {
    "co_architect": 3.5,
    "code_implementer": 4.0,
    "deep_debugger": 3.8,
    "ui_specialist": 4.2,
    "reviewer_tester": 3.0,
    "quick_helper": 1.8,
}

_TOKEN_PATTERN = re.compile(r"\w+|[^\w\s]", re.UNICODE)


class TokenEstimate(BaseModel):
    """Breakdown of estimated token and quota impact for a delegated task."""

    prompt_tokens: int
    context_tokens: int
    expected_output_tokens: int
    total_tokens: int
    weighted_tokens: int
    model_cost_multiplier: float
    model_context_window: int
    estimated_quota_percent: float
    context_overflow: bool


def estimate_tokens(text: str) -> int:
    """Estimate BPE-like token count accurately for both prose and source code."""
    if not text:
        return 0
    pieces = len(_TOKEN_PATTERN.findall(text))
    char_based = math.ceil(len(text) / 3.6)
    return max(pieces, char_based)


def resolve_model_multiplier(model_name: str) -> float:
    """Return relative quota cost multiplier for a given Antigravity model name."""
    norm = model_name.lower().strip().replace(" ", "-")
    for key, mult in MODEL_COST_MULTIPLIERS.items():
        if key in norm:
            return mult
    if "flash" in norm or "hydrogen" in norm or "haiku" in norm or "mini" in norm:
        return 0.35
    if "carbon" in norm or "fable" in norm or "opus" in norm:
        return 2.0
    return 1.0


def resolve_context_window(model_name: str, default_window: int = 512_000) -> int:
    """Return the model's context window in tokens."""
    norm = model_name.lower().strip().replace(" ", "-")
    for key, window in MODEL_CONTEXT_WINDOWS.items():
        if key in norm:
            return window
    if "gemini" in norm or "claude" in norm:
        return 1_000_000
    return default_window


def estimate_prompt_cost(
    prompt: str,
    model_name: str,
    role: str = "code_implementer",
    context_texts: Optional[List[str]] = None,
    quota_window_tokens: int = 2_000_000,
    default_context_window: int = 512_000,
) -> TokenEstimate:
    """Estimate full token footprint and quota percentage for an Antigravity turn."""
    prompt_tokens = estimate_tokens(prompt)
    context_tokens = sum(estimate_tokens(t) for t in (context_texts or []))

    base_agent_overhead = 2_500
    role_mult = ROLE_OUTPUT_MULTIPLIERS.get(role, 3.0)
    expected_output_tokens = int(max(1_500, (prompt_tokens * role_mult) + base_agent_overhead))

    total_tokens = prompt_tokens + context_tokens + expected_output_tokens
    cost_mult = resolve_model_multiplier(model_name)
    weighted_tokens = int(
        (prompt_tokens + context_tokens + expected_output_tokens * 2.5) * cost_mult
    )

    context_window = resolve_context_window(model_name, default_context_window)
    context_overflow = total_tokens > int(context_window * 0.95)

    estimated_quota_percent = round((weighted_tokens / max(1, quota_window_tokens)) * 100.0, 3)

    return TokenEstimate(
        prompt_tokens=prompt_tokens,
        context_tokens=context_tokens,
        expected_output_tokens=expected_output_tokens,
        total_tokens=total_tokens,
        weighted_tokens=weighted_tokens,
        model_cost_multiplier=cost_mult,
        model_context_window=context_window,
        estimated_quota_percent=estimated_quota_percent,
        context_overflow=context_overflow,
    )
