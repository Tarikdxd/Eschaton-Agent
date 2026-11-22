"""
Strict 10% Usage Shield & Pre-Flight Overflow Guard.

Guarantees two non-negotiable invariants:
1. Context Overflow Prevention: Never sends a prompt that would overflow the model's context window.
2. 10% Usage Reserve Floor: Never allows Antigravity's remaining usage to drop to or below 10.0%.
   Between 15.0% and 10.0%, enforces Economy Mode (low-cost high-efficiency model).
   If a prompt would cross the 10.0% floor, the shield BLOCKS the send and returns
   an optimized/split prompt suggestion to the calling external agent.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel

from eschaton.config import (
    ECONOMY_MODE_THRESHOLD_PERCENT,
    MIN_REMAINING_USAGE_PERCENT,
    EschatonConfig,
)
from eschaton.guard.tokenizer import TokenEstimate, estimate_prompt_cost
from eschaton.guard.usage_tracker import UsageSnapshot


ECONOMY_MODEL_FALLBACK = "gemini-3.8-flash"


class UsageDecision(BaseModel):
    """Pre-flight decision returned before any prompt is allowed to reach Antigravity."""

    allowed: bool
    status_code: str  # OK | ECONOMY_MODE | BLOCKED_FLOOR_10_PERCENT | BLOCKED_PROJECTED_BREACH | BLOCKED_CONTEXT_OVERFLOW
    remaining_before: float
    estimated_cost_percent: float
    projected_remaining_after: float
    min_floor_percent: float = MIN_REMAINING_USAGE_PERCENT
    economy_mode_active: bool = False
    recommended_model: Optional[str] = None
    reason: str
    optimized_prompt_suggestion: Optional[str] = None
    split_chunks: List[str] = []
    token_estimate: TokenEstimate


class UsageShield:
    """Evaluates every prompt before it touches Antigravity and blocks unsafe sends."""

    def __init__(self, config: Optional[EschatonConfig] = None):
        self.config = config or EschatonConfig.from_env()
        # Hard clamp: floor can never be below 10.0%.
        self.min_floor = max(MIN_REMAINING_USAGE_PERCENT, self.config.min_remaining_usage_percent)
        self.economy_threshold = max(
            self.min_floor + 5.0,
            self.config.economy_threshold_percent or ECONOMY_MODE_THRESHOLD_PERCENT,
        )

    def evaluate(
        self,
        prompt: str,
        model_name: str,
        usage: UsageSnapshot,
        role: str = "code_implementer",
        context_texts: Optional[List[str]] = None,
    ) -> UsageDecision:
        """Run pre-flight token & quota simulation against the strict 10% floor."""
        remaining = round(float(usage.remaining_percent), 3)

        # 1. Hard Lock: If remaining usage is already at or below 10%, block immediately.
        estimate = estimate_prompt_cost(
            prompt=prompt,
            model_name=model_name,
            role=role,
            context_texts=context_texts,
            quota_window_tokens=self.config.estimated_quota_window_tokens,
            default_context_window=self.config.default_context_window_tokens,
        )
        if remaining <= self.min_floor:
            return UsageDecision(
                allowed=False,
                status_code="BLOCKED_FLOOR_10_PERCENT",
                remaining_before=remaining,
                estimated_cost_percent=estimate.estimated_quota_percent,
                projected_remaining_after=round(max(0.0, remaining - estimate.estimated_quota_percent), 3),
                min_floor_percent=self.min_floor,
                economy_mode_active=True,
                recommended_model=None,
                reason=(
                    f"KULLANIM KİLİDİ AKTİF: Antigravity kalan kotası %{remaining:.2f} "
                    f"(alt sınır %{self.min_floor:.1f}). Kota asla sıfırlanmaz; prompt gönderilmedi."
                ),
                optimized_prompt_suggestion=None,
                split_chunks=[],
                token_estimate=estimate,
            )

        # 2. Economy Mode Band (10% < remaining <= 15%): switch to economy model before re-checking.
        economy_active = remaining <= self.economy_threshold
        active_model = ECONOMY_MODEL_FALLBACK if economy_active else model_name
        if economy_active and active_model != model_name:
            estimate = estimate_prompt_cost(
                prompt=prompt,
                model_name=active_model,
                role=role,
                context_texts=context_texts,
                quota_window_tokens=self.config.estimated_quota_window_tokens,
                default_context_window=self.config.default_context_window_tokens,
            )

        projected_after = round(remaining - estimate.estimated_quota_percent, 3)

        # 3. Context Window Overflow Check
        if estimate.context_overflow:
            chunks = self._split_prompt(prompt, max_chars=max(1200, len(prompt) // 3))
            return UsageDecision(
                allowed=False,
                status_code="BLOCKED_CONTEXT_OVERFLOW",
                remaining_before=remaining,
                estimated_cost_percent=estimate.estimated_quota_percent,
                projected_remaining_after=max(0.0, projected_after),
                min_floor_percent=self.min_floor,
                economy_mode_active=economy_active,
                recommended_model=active_model,
                reason=(
                    f"BAĞLAM TAŞMASI ENGELLENDİ: Tahmini toplam {estimate.total_tokens:,} token, "
                    f"model sınırı {estimate.model_context_window:,} token. Prompt Antigravity'ye gönderilmedi."
                ),
                optimized_prompt_suggestion=self._build_compressed_suggestion(prompt, chunks),
                split_chunks=chunks,
                token_estimate=estimate,
            )

        # 4. Projected 10% Floor Breach Check
        if projected_after < self.min_floor:
            # Check whether switching to economy model would make it safe
            econ_est = estimate_prompt_cost(
                prompt=prompt,
                model_name=ECONOMY_MODEL_FALLBACK,
                role=role,
                context_texts=context_texts,
                quota_window_tokens=self.config.estimated_quota_window_tokens,
                default_context_window=self.config.default_context_window_tokens,
            )
            econ_projected = round(remaining - econ_est.estimated_quota_percent, 3)

            if not economy_active and econ_projected >= self.min_floor and not econ_est.context_overflow:
                return UsageDecision(
                    allowed=True,
                    status_code="ECONOMY_MODE",
                    remaining_before=remaining,
                    estimated_cost_percent=econ_est.estimated_quota_percent,
                    projected_remaining_after=econ_projected,
                    min_floor_percent=self.min_floor,
                    economy_mode_active=True,
                    recommended_model=ECONOMY_MODEL_FALLBACK,
                    reason=(
                        f"EKONOMİ MODU DEVREDE: '{model_name}' %{self.min_floor:.1f} sınırını aşacaktı "
                        f"(kalan %{projected_after:.2f}). Otomatik olarak '{ECONOMY_MODEL_FALLBACK}' seçildi "
                        f"(tahmini kalan %{econ_projected:.2f})."
                    ),
                    token_estimate=econ_est,
                )

            chunks = self._split_prompt(prompt, max_chars=max(600, len(prompt) // 3))
            return UsageDecision(
                allowed=False,
                status_code="BLOCKED_PROJECTED_BREACH",
                remaining_before=remaining,
                estimated_cost_percent=estimate.estimated_quota_percent,
                projected_remaining_after=max(0.0, projected_after),
                min_floor_percent=self.min_floor,
                economy_mode_active=True,
                recommended_model=ECONOMY_MODEL_FALLBACK,
                reason=(
                    f"%10 KORUMA KALKANI ENGELLEDİ: Bu prompt tahmini %{estimate.estimated_quota_percent:.2f} "
                    f"kullanım harcayarak kalan kotayı %{remaining:.2f} -> %{max(0.0, projected_after):.2f} "
                    f"seviyesine (%{self.min_floor:.1f} altına) düşürecekti. Prompt gönderilmedi."
                ),
                optimized_prompt_suggestion=self._build_compressed_suggestion(prompt, chunks),
                split_chunks=chunks,
                token_estimate=estimate,
            )

        # 5. Safe to send!
        status = "ECONOMY_MODE" if economy_active else "OK"
        reason = (
            f"EKONOMİ MODUNDA GÜVENLİ: '{active_model}' ile tahmini maliyet "
            f"%{estimate.estimated_quota_percent:.2f}, kalan kota %{projected_after:.2f}."
            if economy_active
            else f"GÜVENLİ: '{active_model}' ile tahmini maliyet %{estimate.estimated_quota_percent:.2f}, "
            f"kalan kota %{projected_after:.2f} (> %{self.min_floor:.1f})."
        )
        return UsageDecision(
            allowed=True,
            status_code=status,
            remaining_before=remaining,
            estimated_cost_percent=estimate.estimated_quota_percent,
            projected_remaining_after=projected_after,
            min_floor_percent=self.min_floor,
            economy_mode_active=economy_active,
            recommended_model=active_model,
            reason=reason,
            token_estimate=estimate,
        )

    @staticmethod
    def _split_prompt(prompt: str, max_chars: int = 1200) -> List[str]:
        """Split a large prompt into smaller paragraph/sentence chunks for safe delegation."""
        text = prompt.strip()
        if len(text) <= max_chars:
            return [text] if text else []

        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        chunks: List[str] = []
        current = ""
        for para in paragraphs:
            if len(para) > max_chars:
                if current:
                    chunks.append(current.strip())
                    current = ""
                for i in range(0, len(para), max_chars):
                    chunks.append(para[i : i + max_chars].strip())
            elif len(current) + len(para) + 2 <= max_chars:
                current = f"{current}\n\n{para}" if current else para
            else:
                if current:
                    chunks.append(current.strip())
                current = para
        if current:
            chunks.append(current.strip())
        return chunks

    @staticmethod
    def _build_compressed_suggestion(prompt: str, chunks: List[str]) -> str:
        """Build a concise actionable suggestion for the external agent when blocked."""
        if len(chunks) > 1:
            preview = chunks[0][:280].replace("\n", " ")
            return (
                f"Promptu {len(chunks)} küçük alt göreve bölerek gönderin ve gereksiz dosya dökümlerini çıkarın. "
                f"İlk alt görev önerisi: \"{preview}...\""
            )
        compact = " ".join(prompt.split())[:240]
        return (
            f"Promptu yalnızca hedeflenen dosya yolları ve net kabul kriterleriyle kısaltın "
            f"veya ekonomi modelini ('{ECONOMY_MODEL_FALLBACK}') seçin. Özet: \"{compact}...\""
        )
