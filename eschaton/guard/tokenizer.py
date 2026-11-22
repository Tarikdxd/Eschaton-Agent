"""High-accuracy token and quota-cost estimation without heavy native dependencies."""

from __future__ import annotations

import math
import re
from typing import Dict, List, Optional

from pydantic import BaseModel

# Relative quota cost multipliers per model family (1.0 = standard flagship baseline).
MODEL_COST_MULTIPLIERS: Dict[str, float] = {
    "gemini-3-pro": 1.0,
    "gemini-2.5-pro": 1.0,
    "gemini-3-flash": 0.35,
    "gemini-2.5-flash": 0.35,
    "claude-sonnet-4.6": 1.25,
    "claude-sonnet-4.5": 1.25,
    "claude-opus-4.6": 2.4,
    "claude-opus-4.5": 2.4,
    "gpt-5": 1.4,
    "gpt-4.1": 1.0,
    "o3": 2.2,
    "o4-mini": 0.6,
}

# Context window sizes (in tokens) per model family.
MODEL_CONTEXT_WINDOWS: Dict[str, int] = {
    "gemini-3-pro": 1_000_000,
    "gemini-2.5-pro": 1_000_000,
    "gemini-3-flash": 1_000_000,
    "gemini-2.5-flash": 1_000_000,
    "claude-sonnet-4.6": 200_000,
    "claude-sonnet-4.5": 200_000,
    "claude-opus-4.6": 200_000,
    "claude-opus-4.5": 200_000,
    "gpt-5": 400_000,
    "gpt-4.1": 1_000_000,
    "o3": 200_000,
    "o4-mini": 200_000,
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
    # Code and Turkish/UTF-8 text average ~3.6 chars/token; combining regex pieces
    # with char-length yields a conservative (safe) upper bound.
    pieces = len(_TOKEN_PATTERN.findall(text))
    char_based = math.ceil(len(text) / 3.6)
    return max(pieces, char_based)


def resolve_model_multiplier(model_name: str) -> float:
    """Return relative quota cost multiplier for a given Antigravity model name."""
    norm = model_name.lower().strip()
    for key, mult in MODEL_COST_MULTIPLIERS.items():
        if key in norm:
            return mult
    if "flash" in norm or "mini" in norm or "haiku" in norm or "lite" in norm:
        return 0.35
    if "opus" in norm or "ultra" in norm or "o1" in norm or "o3" in norm:
        return 2.2
    return 1.0


def resolve_context_window(model_name: str, default_window: int = 200_000) -> int:
    """Return the model's context window in tokens."""
    norm = model_name.lower().strip()
    for key, window in MODEL_CONTEXT_WINDOWS.items():
        if key in norm:
            return window
    if "gemini" in norm:
        return 1_000_000
    return default_window


def estimate_prompt_cost(
    prompt: str,
    model_name: str,
    role: str = "code_implementer",
    context_texts: Optional[List[str]] = None,
    quota_window_tokens: int = 2_000_000,
    default_context_window: int = 200_000,
) -> TokenEstimate:
    """Estimate full token footprint and quota percentage for an Antigravity turn."""
    prompt_tokens = estimate_tokens(prompt)
    context_tokens = sum(estimate_tokens(t) for t in (context_texts or []))

    # Antigravity agentic turns include system prompt overhead + thinking + tool calls.
    base_agent_overhead = 2_500
    role_mult = ROLE_OUTPUT_MULTIPLIERS.get(role, 3.0)
    expected_output_tokens = int(max(1_500, (prompt_tokens * role_mult) + base_agent_overhead))

    total_tokens = prompt_tokens + context_tokens + expected_output_tokens
    cost_mult = resolve_model_multiplier(model_name)
    # Output/thinking tokens weigh ~2.5x input tokens in quota accounting.
    weighted_tokens = int(
        (prompt_tokens + context_tokens + expected_output_tokens * 2.5) * cost_mult
    )

    context_window = resolve_context_window(model_name, default_context_window)
    # Keep 5% headroom below raw context window to prevent mid-generation truncation.
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
