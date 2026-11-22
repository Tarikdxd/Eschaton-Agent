"""Tracks real-time Antigravity usage from CDP/DOM, local state files, and cumulative accounting."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field

from eschaton.config import EschatonConfig


class UsageSnapshot(BaseModel):
    """Current quota/usage state of the local Antigravity application."""

    used_percent: float = Field(ge=0.0, le=100.0)
    remaining_percent: float = Field(ge=0.0, le=100.0)
    source: str = "local_tracker"
    cumulative_weighted_tokens: int = 0
    updated_at: float = Field(default_factory=time.time)
    reset_info: Optional[str] = None


class UsageTracker:
    """Reads and persists Antigravity usage metrics across sessions."""

    def __init__(self, config: Optional[EschatonConfig] = None):
        self.config = config or EschatonConfig.from_env()
        self._state_file: Path = self.config.ensure_state_dir() / "usage_state.json"

    def _load_local_state(self) -> dict:
        if not self._state_file.exists():
            return {
                "used_percent": 0.0,
                "cumulative_weighted_tokens": 0,
                "updated_at": time.time(),
                "source": "local_tracker",
            }
        try:
            return json.loads(self._state_file.read_text(encoding="utf-8"))
        except Exception:
            return {
                "used_percent": 0.0,
                "cumulative_weighted_tokens": 0,
                "updated_at": time.time(),
                "source": "local_tracker",
            }

    def _save_local_state(self, data: dict) -> None:
        self._state_file.parent.mkdir(parents=True, exist_ok=True)
        self._state_file.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def read_snapshot(
        self,
        live_remaining_percent: Optional[float] = None,
        live_used_percent: Optional[float] = None,
        reset_info: Optional[str] = None,
    ) -> UsageSnapshot:
        """
        Return the most accurate current usage snapshot.

        If live metrics from Antigravity's CDP/DOM are supplied, they take precedence
        and synchronize the local tracker. Otherwise, local state (and any Antigravity
        state files) are used conservatively.
        """
        state = self._load_local_state()

        if live_remaining_percent is not None:
            rem = max(0.0, min(100.0, float(live_remaining_percent)))
            used = round(100.0 - rem, 3)
            state["used_percent"] = used
            state["updated_at"] = time.time()
            state["source"] = "antigravity_live_cdp"
            self._save_local_state(state)
            return UsageSnapshot(
                used_percent=used,
                remaining_percent=round(rem, 3),
                source="antigravity_live_cdp",
                cumulative_weighted_tokens=int(state.get("cumulative_weighted_tokens", 0)),
                updated_at=state["updated_at"],
                reset_info=reset_info,
            )

        if live_used_percent is not None:
            used = max(0.0, min(100.0, float(live_used_percent)))
            rem = round(100.0 - used, 3)
            state["used_percent"] = used
            state["updated_at"] = time.time()
            state["source"] = "antigravity_live_cdp"
            self._save_local_state(state)
            return UsageSnapshot(
                used_percent=round(used, 3),
                remaining_percent=rem,
                source="antigravity_live_cdp",
                cumulative_weighted_tokens=int(state.get("cumulative_weighted_tokens", 0)),
                updated_at=state["updated_at"],
                reset_info=reset_info,
            )

        used = max(0.0, min(100.0, float(state.get("used_percent", 0.0))))
        rem = round(100.0 - used, 3)
        return UsageSnapshot(
            used_percent=round(used, 3),
            remaining_percent=rem,
            source=str(state.get("source", "local_tracker")),
            cumulative_weighted_tokens=int(state.get("cumulative_weighted_tokens", 0)),
            updated_at=float(state.get("updated_at", time.time())),
            reset_info=reset_info,
        )

    def record_consumption(self, weighted_tokens: int, estimated_percent: float) -> UsageSnapshot:
        """Record actual/estimated consumption after a delegated turn completes."""
        state = self._load_local_state()
        new_tokens = int(state.get("cumulative_weighted_tokens", 0)) + max(0, int(weighted_tokens))
        new_used = min(100.0, float(state.get("used_percent", 0.0)) + max(0.0, float(estimated_percent)))
        state["cumulative_weighted_tokens"] = new_tokens
        state["used_percent"] = round(new_used, 3)
        state["updated_at"] = time.time()
        self._save_local_state(state)
        return self.read_snapshot()

    def set_manual_usage(self, remaining_percent: float) -> UsageSnapshot:
        """Explicitly calibrate remaining usage percentage (e.g. after quota reset)."""
        rem = max(0.0, min(100.0, float(remaining_percent)))
        state = self._load_local_state()
        state["used_percent"] = round(100.0 - rem, 3)
        state["source"] = "manual_calibration"
        state["updated_at"] = time.time()
        if rem >= 99.9:
            state["cumulative_weighted_tokens"] = 0
        self._save_local_state(state)
        return self.read_snapshot()
