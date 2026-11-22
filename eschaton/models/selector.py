"""Task classifier and benchmark-backed dynamic model selector for Antigravity."""

from __future__ import annotations

from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field

from eschaton.config import ECONOMY_MODE_THRESHOLD_PERCENT, EschatonConfig
from eschaton.models.researcher import BenchmarkDataset, BenchmarkResearcher, ModelProfile


class TaskCategory(str, Enum):
    ARCHITECTURE = "architecture"
    UI_FRONTEND = "ui_frontend"
    DEEP_DEBUGGING = "deep_debugging"
    REFACTORING = "refactoring"
    TESTING = "testing"
    QUICK_EDIT = "quick_edit"


CATEGORY_KEYWORDS: Dict[TaskCategory, List[str]] = {
    TaskCategory.UI_FRONTEND: [
        "ui", "ux", "css", "html", "react", "next.js", "tailwind", "layout", "responsive",
        "dashboard", "tasarım", "arayüz", "buton", "sayfa", "component", "frontend", "animasyon",
    ],
    TaskCategory.DEEP_DEBUGGING: [
        "bug", "error", "fix", "crash", "exception", "traceback", "race condition", "memory leak",
        "hata", "çöz", "debug", "bozuk", "çalışmıyor", "fail", "failing", "deadlock",
    ],
    TaskCategory.ARCHITECTURE: [
        "architect", "design", "plan", "system", "microservice", "schema", "database", "migration",
        "mimari", "tasarla", "altyapı", "ölçek", "protocol", "bridge", "pipeline",
    ],
    TaskCategory.REFACTORING: [
        "refactor", "rewrite", "clean", "modular", "optimize", "performance", "decouple",
        "yeniden yaz", "temizle", "düzenle", "sadeleştir", "dönüştür",
    ],
    TaskCategory.TESTING: [
        "test", "pytest", "jest", "vitest", "e2e", "coverage", "unit test", "integration",
        "doğrula", "verify", "qa", "assert",
    ],
    TaskCategory.QUICK_EDIT: [
        "typo", "rename", "comment", "docstring", "format", "lint", "readme", "small",
        "küçük", "basit", "hızlı", "ekle", "değiştir",
    ],
}


class ModelSelection(BaseModel):
    """Result of researching and choosing the optimal Antigravity model for a prompt."""

    selected_model: str
    canonical_id: str
    task_category: TaskCategory
    composite_score: float
    domain_score: float
    cost_efficiency: float
    economy_mode_applied: bool
    live_benchmark_synced: bool
    sources: List[str] = Field(default_factory=list)
    rationale: str


class ModelSelector:
    """Selects the highest-performing Antigravity model for a prompt and usage budget."""

    def __init__(
        self,
        config: Optional[EschatonConfig] = None,
        researcher: Optional[BenchmarkResearcher] = None,
    ):
        self.config = config or EschatonConfig.from_env()
        self.researcher = researcher or BenchmarkResearcher(self.config)

    @staticmethod
    def classify_prompt(prompt: str, role: Optional[str] = None) -> TaskCategory:
        """Infer the dominant coding task category from the prompt and optional role."""
        text = (prompt or "").lower()
        scores: Dict[TaskCategory, int] = {cat: 0 for cat in TaskCategory}

        for cat, keywords in CATEGORY_KEYWORDS.items():
            for kw in keywords:
                if kw in text:
                    scores[cat] += 2

        role_map = {
            "co_architect": TaskCategory.ARCHITECTURE,
            "ui_specialist": TaskCategory.UI_FRONTEND,
            "deep_debugger": TaskCategory.DEEP_DEBUGGING,
            "reviewer_tester": TaskCategory.TESTING,
            "code_implementer": TaskCategory.REFACTORING,
            "quick_helper": TaskCategory.QUICK_EDIT,
        }
        if role and role in role_map:
            scores[role_map[role]] += 3

        # Very short prompts without heavy keywords default to quick_edit
        if max(scores.values()) == 0:
            return TaskCategory.QUICK_EDIT if len(text) < 120 else TaskCategory.REFACTORING

        return max(scores.items(), key=lambda item: item[1])[0]

    def select(
        self,
        prompt: str,
        available_models: Optional[List[str]] = None,
        remaining_usage_percent: float = 100.0,
        role: Optional[str] = None,
        force_refresh: bool = False,
        allow_network: bool = True,
    ) -> ModelSelection:
        """Choose the best available model combining live benchmarks and usage awareness."""
        dataset: BenchmarkDataset = self.researcher.get_dataset(
            force_refresh=force_refresh,
            allow_network=allow_network,
        )
        category = self.classify_prompt(prompt, role=role)
        economy_mode = remaining_usage_percent <= max(
            ECONOMY_MODE_THRESHOLD_PERCENT, self.config.economy_threshold_percent
        )

        # Match Antigravity's available models to benchmark profiles
        candidates: List[tuple[str, ModelProfile]] = []
        if available_models:
            for raw_name in available_models:
                matched = self._match_profile(raw_name, dataset)
                if matched:
                    candidates.append((raw_name, matched))
        if not candidates:
            for profile in dataset.profiles.values():
                candidates.append((profile.model_id, profile))

        # Weight domain performance vs. cost efficiency based on remaining usage
        if economy_mode:
            domain_weight, efficiency_weight = 0.40, 0.60
        elif remaining_usage_percent < 35.0:
            domain_weight, efficiency_weight = 0.72, 0.28
        else:
            domain_weight, efficiency_weight = 0.88, 0.12

        best_tuple = None
        best_score = -1.0
        best_domain = 0.0

        for raw_name, profile in candidates:
            domain_score = float(getattr(profile, category.value, 80.0))
            composite = round(
                domain_score * domain_weight + profile.cost_efficiency * efficiency_weight,
                2,
            )
            if composite > best_score:
                best_score = composite
                best_domain = domain_score
                best_tuple = (raw_name, profile)

        assert best_tuple is not None
        chosen_raw, chosen_profile = best_tuple

        rationale = (
            f"Görev tipi '{category.value}' olarak sınıflandırıldı. "
            f"Güncel benchmark kaynaklarına ({', '.join(chosen_profile.sources)}) göre "
            f"'{chosen_raw}' alan skoru {best_domain:.1f}/100, verimlilik skoru {chosen_profile.cost_efficiency:.1f}/100 "
            f"ile en uygun model seçildi"
            + (" (düşük kota nedeniyle Ekonomi Modu ağırlığı uygulandı)." if economy_mode else ".")
        )

        return ModelSelection(
            selected_model=chosen_raw,
            canonical_id=chosen_profile.model_id,
            task_category=category,
            composite_score=best_score,
            domain_score=best_domain,
            cost_efficiency=chosen_profile.cost_efficiency,
            economy_mode_applied=economy_mode,
            live_benchmark_synced=dataset.live_sync_succeeded,
            sources=list(chosen_profile.sources),
            rationale=rationale,
        )

    @staticmethod
    def _match_profile(raw_model_name: str, dataset: BenchmarkDataset) -> Optional[ModelProfile]:
        norm = raw_model_name.lower().strip()
        for profile in dataset.profiles.values():
            if norm == profile.model_id.lower() or norm == profile.display_name.lower():
                return profile
            for alias in profile.aliases:
                if alias.lower() in norm or norm in alias.lower():
                    return profile
        return None
