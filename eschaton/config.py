"""Configuration and global invariants for Eschaton-Agent."""

from __future__ import annotations

import os
from pathlib import Path
from typing import List

from pydantic import BaseModel, Field


# Hard invariant: Antigravity usage must NEVER drop below 10.0% remaining.
MIN_REMAINING_USAGE_PERCENT: float = 10.0

# Economy mode threshold: between 10% and 15% remaining, enforce high-efficiency models.
ECONOMY_MODE_THRESHOLD_PERCENT: float = 15.0

# Default CDP ports probed when searching for a running Antigravity Electron instance.
DEFAULT_CDP_PORTS: List[int] = [9222, 9223, 9229, 9333, 9444]


class EschatonConfig(BaseModel):
    """Runtime configuration for Eschaton-Agent."""

    state_dir: Path = Field(default_factory=lambda: Path.home() / ".eschaton")
    antigravity_state_dir: Path = Field(
        default_factory=lambda: Path.home() / ".gemini" / "antigravity"
    )
    cdp_host: str = "127.0.0.1"
    cdp_ports: List[int] = Field(default_factory=lambda: list(DEFAULT_CDP_PORTS))
    preferred_cdp_port: int = 9222
    min_remaining_usage_percent: float = MIN_REMAINING_USAGE_PERCENT
    economy_threshold_percent: float = ECONOMY_MODE_THRESHOLD_PERCENT
    benchmark_cache_ttl_seconds: int = 21600  # 6 hours
    default_context_window_tokens: int = 200_000
    # Approximate token budget corresponding to 100% of a typical Antigravity rolling quota window.
    estimated_quota_window_tokens: int = 2_000_000
    workspace_search_roots: List[Path] = Field(
        default_factory=lambda: [
            Path.cwd(),
            Path.home() / "Projects",
            Path.home() / "Desktop",
            Path.home() / "Documents",
            Path.home() / "dev",
            Path.home() / "workspace",
            Path.home(),
        ]
    )

    def ensure_state_dir(self) -> Path:
        self.state_dir.mkdir(parents=True, exist_ok=True)
        return self.state_dir

    @classmethod
    def from_env(cls) -> "EschatonConfig":
        """Build configuration honoring optional environment overrides."""
        kwargs = {}
        if env_dir := os.getenv("ESCHATON_STATE_DIR"):
            kwargs["state_dir"] = Path(env_dir)
        if ag_dir := os.getenv("ANTIGRAVITY_STATE_DIR"):
            kwargs["antigravity_state_dir"] = Path(ag_dir)
        if port := os.getenv("ESCHATON_CDP_PORT"):
            try:
                p = int(port)
                kwargs["preferred_cdp_port"] = p
                kwargs["cdp_ports"] = [p] + [x for x in DEFAULT_CDP_PORTS if x != p]
            except ValueError:
                pass
        if quota := os.getenv("ESCHATON_QUOTA_WINDOW_TOKENS"):
            try:
                kwargs["estimated_quota_window_tokens"] = max(50_000, int(quota))
            except ValueError:
                pass
        # Note: min_remaining_usage_percent is intentionally clamped to >= 10.0%
        # so external agents cannot lower or disable the 10% safety floor.
        if min_rem := os.getenv("ESCHATON_MIN_REMAINING_PERCENT"):
            try:
                kwargs["min_remaining_usage_percent"] = max(
                    MIN_REMAINING_USAGE_PERCENT, float(min_rem)
                )
            except ValueError:
                pass
        return cls(**kwargs)
