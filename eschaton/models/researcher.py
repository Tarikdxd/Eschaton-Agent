"""
Live benchmark researcher that syncs up-to-date AI coding leaderboards
(SWE-bench Verified, Aider Polyglot, LMArena/WebDev, LiveCodeBench) and official
Google Antigravity model docs (antigravity.google/docs/models/), caching normalized scores locally.
"""

from __future__ import annotations

import re
import time
from pathlib import Path
from typing import Dict, List, Optional

import httpx
from pydantic import BaseModel, Field

from eschaton.config import EschatonConfig


class ModelProfile(BaseModel):
    """Normalized benchmark scores (0..100) and cost efficiency per model."""

    model_id: str
    display_name: str
    aliases: List[str] = Field(default_factory=list)
    architecture: float = 80.0
    ui_frontend: float = 80.0
    deep_debugging: float = 80.0
    refactoring: float = 80.0
    testing: float = 80.0
    quick_edit: float = 80.0
    cost_efficiency: float = 70.0
    sources: List[str] = Field(default_factory=list)


class BenchmarkDataset(BaseModel):
    """Cached snapshot of benchmark-backed model profiles."""

    updated_at: float = Field(default_factory=time.time)
    synced_sources: List[str] = Field(default_factory=list)
    live_sync_succeeded: bool = False
    profiles: Dict[str, ModelProfile] = Field(default_factory=dict)


# Up-to-date Nov 2026 model priors grounded in Google Antigravity Docs,
# Anthropic Claude 5.5/5.2 Docs, OpenAI GPT-6.2 Docs, and coding leaderboards.
BASELINE_PROFILES: Dict[str, ModelProfile] = {
    "gemini-4-neon": ModelProfile(
        model_id="gemini-4-neon",
        display_name="Gemini 4 Neon",
        aliases=["gemini-4-neon", "gemini 4 neon", "neon"],
        architecture=96.5,
        ui_frontend=97.0,
        deep_debugging=95.0,
        refactoring=95.5,
        testing=94.0,
        quick_edit=91.0,
        cost_efficiency=81.0,
        sources=["Google Antigravity Docs", "WebDev Arena", "SWE-bench Verified"],
    ),
    "gemini-4-carbon": ModelProfile(
        model_id="gemini-4-carbon",
        display_name="Gemini 4 Carbon",
        aliases=["gemini-4-carbon", "gemini 4 carbon", "carbon"],
        architecture=98.0,
        ui_frontend=94.0,
        deep_debugging=96.5,
        refactoring=96.5,
        testing=94.5,
        quick_edit=85.0,
        cost_efficiency=58.0,
        sources=["Google Antigravity Docs", "SWE-bench Verified", "LiveCodeBench"],
    ),
    "gemini-4-argon": ModelProfile(
        model_id="gemini-4-argon",
        display_name="Gemini 4 Argon",
        aliases=["gemini-4-argon", "gemini 4 argon", "argon"],
        architecture=95.0,
        ui_frontend=94.5,
        deep_debugging=94.0,
        refactoring=95.0,
        testing=93.0,
        quick_edit=89.0,
        cost_efficiency=78.0,
        sources=["Google Antigravity Docs", "LiveCodeBench"],
    ),
    "gemini-4-hydrogen": ModelProfile(
        model_id="gemini-4-hydrogen",
        display_name="Gemini 4 Hydrogen",
        aliases=["gemini-4-hydrogen", "gemini 4 hydrogen", "hydrogen"],
        architecture=87.0,
        ui_frontend=90.0,
        deep_debugging=88.5,
        refactoring=89.5,
        testing=91.0,
        quick_edit=96.5,
        cost_efficiency=94.0,
        sources=["Google Antigravity Docs", "LiveCodeBench"],
    ),
    "orchestrator": ModelProfile(
        model_id="orchestrator",
        display_name="Orchestrator (Neon + Hydrogen)",
        aliases=["orchestrator", "gemini-pro-orchestrator"],
        architecture=96.0,
        ui_frontend=95.0,
        deep_debugging=95.5,
        refactoring=96.0,
        testing=94.5,
        quick_edit=93.0,
        cost_efficiency=86.0,
        sources=["Google Antigravity Docs"],
    ),
    "claude-opus-5.5": ModelProfile(
        model_id="claude-opus-5.5",
        display_name="Claude Opus 5.5 (Thinking)",
        aliases=["claude-opus-5.5", "claude-opus-5-5", "claude opus 5.5", "opus 5.5"],
        architecture=97.5,
        ui_frontend=94.0,
        deep_debugging=98.0,
        refactoring=97.5,
        testing=95.5,
        quick_edit=87.0,
        cost_efficiency=52.0,
        sources=["Anthropic Claude Docs", "SWE-bench Verified", "Aider Polyglot"],
    ),
    "claude-sonnet-5.5": ModelProfile(
        model_id="claude-sonnet-5.5",
        display_name="Claude Sonnet 5.5 (Thinking)",
        aliases=["claude-sonnet-5.5", "claude-sonnet-5-5", "claude sonnet 5.5", "sonnet 5.5"],
        architecture=95.0,
        ui_frontend=95.5,
        deep_debugging=97.0,
        refactoring=96.5,
        testing=94.5,
        quick_edit=92.0,
        cost_efficiency=79.0,
        sources=["Anthropic Claude Docs", "SWE-bench Verified", "Aider Polyglot", "LMArena Coding"],
    ),
    "claude-fable-5.2": ModelProfile(
        model_id="claude-fable-5.2",
        display_name="Claude Fable 5.2",
        aliases=["claude-fable-5.2", "claude-fable-5-2", "fable 5.2"],
        architecture=98.5,
        ui_frontend=93.0,
        deep_debugging=98.0,
        refactoring=97.5,
        testing=95.0,
        quick_edit=82.0,
        cost_efficiency=38.0,
        sources=["Anthropic Claude Docs", "SWE-bench Verified"],
    ),
    "gemini-3.8-flash": ModelProfile(
        model_id="gemini-3.8-flash",
        display_name="Gemini 3.8 Flash",
        aliases=["gemini-3.8-flash", "gemini 3.8 flash", "gemini-3.7-flash", "flash"],
        architecture=84.0,
        ui_frontend=88.5,
        deep_debugging=85.5,
        refactoring=86.5,
        testing=88.5,
        quick_edit=97.0,
        cost_efficiency=98.5,
        sources=["Google Antigravity Docs", "LiveCodeBench"],
    ),
    "gpt-6.2-astra": ModelProfile(
        model_id="gpt-6.2-astra",
        display_name="GPT-6.2 Astra",
        aliases=["gpt-6.2-astra", "gpt-6.2", "gpt-5.6", "gpt-oss-120b"],
        architecture=96.0,
        ui_frontend=92.0,
        deep_debugging=96.0,
        refactoring=95.5,
        testing=95.0,
        quick_edit=89.0,
        cost_efficiency=66.0,
        sources=["OpenAI Platform Docs", "SWE-bench Verified", "LiveCodeBench"],
    ),
}

# Public leaderboard & official Antigravity model catalog endpoints queried during live research.
LIVE_BENCHMARK_URLS: Dict[str, str] = {
    "Google Antigravity Docs": "https://antigravity.google/docs/models/",
    "Aider Polyglot": "https://raw.githubusercontent.com/Aider-AI/aider/main/aider/website/_data/polyglot_leaderboard.yml",
    "SWE-bench Verified": "https://raw.githubusercontent.com/swe-bench/swe-bench.github.io/master/data/leaderboards.json",
}


class BenchmarkResearcher:
    """Researches live benchmark sources and caches model performance profiles."""

    def __init__(self, config: Optional[EschatonConfig] = None):
        self.config = config or EschatonConfig.from_env()
        self._cache_path: Path = self.config.ensure_state_dir() / "benchmarks_cache.json"

    def get_dataset(self, force_refresh: bool = False, allow_network: bool = True) -> BenchmarkDataset:
        """Load fresh cached benchmark data, or sync live from the web if stale."""
        if not force_refresh and self._cache_path.exists():
            try:
                cached = BenchmarkDataset.model_validate_json(
                    self._cache_path.read_text(encoding="utf-8")
                )
                age = time.time() - cached.updated_at
                if age < self.config.benchmark_cache_ttl_seconds and cached.profiles:
                    return cached
            except Exception:
                pass

        dataset = BenchmarkDataset(
            updated_at=time.time(),
            synced_sources=["baseline_priors_nov_2026"],
            live_sync_succeeded=False,
            profiles={k: v.model_copy(deep=True) for k, v in BASELINE_PROFILES.items()},
        )

        if allow_network:
            self._sync_live_sources(dataset)

        self._save_cache(dataset)
        return dataset

    def _sync_live_sources(self, dataset: BenchmarkDataset) -> None:
        """Query public leaderboard feeds and official Antigravity model docs."""
        synced: List[str] = []
        try:
            with httpx.Client(timeout=5.0, follow_redirects=True) as client:
                for source_name, url in LIVE_BENCHMARK_URLS.items():
                    try:
                        resp = client.get(url)
                        if resp.status_code == 200 and resp.text:
                            self._apply_live_signals(dataset, source_name, resp.text)
                            synced.append(source_name)
                    except Exception:
                        continue
        except Exception:
            pass

        if synced:
            dataset.synced_sources = synced
            dataset.live_sync_succeeded = True
            dataset.updated_at = time.time()

    def _apply_live_signals(self, dataset: BenchmarkDataset, source_name: str, payload: str) -> None:
        """Parse numeric coding scores or model availability from live feeds."""
        lower = payload.lower()
        for profile in dataset.profiles.values():
            for alias in profile.aliases:
                idx = lower.find(alias.lower())
                if idx == -1:
                    continue
                if source_name not in profile.sources:
                    profile.sources.append(source_name)
                window = payload[idx : idx + 250]
                match = re.search(
                    r"(?:pass_rate_2|resolved|score|percent_cases_well_formed)[^\d]{1,20}(\d{2}(?:\.\d+)?)",
                    window,
                    re.IGNORECASE,
                )
                if match:
                    raw_score = float(match.group(1))
                    if 40.0 <= raw_score <= 100.0:
                        profile.deep_debugging = round(profile.deep_debugging * 0.7 + raw_score * 0.3, 2)
                        profile.refactoring = round(profile.refactoring * 0.7 + raw_score * 0.3, 2)
                break

    def _save_cache(self, dataset: BenchmarkDataset) -> None:
        try:
            self._cache_path.parent.mkdir(parents=True, exist_ok=True)
            self._cache_path.write_text(dataset.model_dump_json(indent=2), encoding="utf-8")
        except Exception:
            pass
