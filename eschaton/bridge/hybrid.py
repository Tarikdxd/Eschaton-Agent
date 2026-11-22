"""Unified Hybrid Antigravity Bridge combining CDP (primary) and UI Automation (fallback)."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field

from eschaton.bridge.cdp_client import CDPClient, CDPTarget
from eschaton.bridge.process_manager import AntigravityProcessInfo, ProcessManager
from eschaton.bridge.ui_fallback import UIFallbackController
from eschaton.config import EschatonConfig


class BridgeStatus(BaseModel):
    """Snapshot of the hybrid connection between Eschaton-Agent and Antigravity."""

    connected: bool
    mode: str  # "cdp" | "ui_fallback" | "disconnected"
    process: AntigravityProcessInfo
    open_windows: List[str] = Field(default_factory=list)
    available_models: List[str] = Field(default_factory=list)
    live_remaining_usage_percent: Optional[float] = None
    message: str


class DeliveryResult(BaseModel):
    """Result of delivering an approved prompt to Antigravity."""

    delivered: bool
    mode: str
    model_applied: bool = False
    target_window: Optional[str] = None
    detail: str


class AntigravityBridge:
    """
    Hybrid Bridge to the locally running Antigravity desktop application.

    Priority order:
    1. Electron CDP / DOM bridge (background, non-intrusive, reads live usage & models)
    2. OS UI Automation fallback (when CDP is unavailable and GUI extras are installed)
    """

    def __init__(
        self,
        config: Optional[EschatonConfig] = None,
        process_manager: Optional[ProcessManager] = None,
        ui_fallback: Optional[UIFallbackController] = None,
    ):
        self.config = config or EschatonConfig.from_env()
        self.process_manager = process_manager or ProcessManager(self.config)
        self.ui_fallback = ui_fallback or UIFallbackController()
        self._cdp: Optional[CDPClient] = None

    def status(self, project_hint: Optional[str] = None) -> BridgeStatus:
        """Probe Antigravity and return full hybrid connection status."""
        proc = self.process_manager.inspect()

        if proc.cdp_reachable and proc.cdp_port:
            self._cdp = CDPClient(host=self.config.cdp_host, port=proc.cdp_port)
            targets = self._cdp.list_targets()
            titles = [t.title for t in targets if t.title]
            target = self._cdp.select_target(project_name=project_hint)
            models = self._cdp.read_available_models(target) if target else []
            live_usage = self._cdp.read_live_usage_percent(target) if target else None
            return BridgeStatus(
                connected=True,
                mode="cdp",
                process=proc,
                open_windows=titles,
                available_models=models,
                live_remaining_usage_percent=live_usage,
                message=f"Antigravity Electron CDP köprüsü aktif (port {proc.cdp_port}).",
            )

        if proc.running and self.ui_fallback.is_available():
            return BridgeStatus(
                connected=True,
                mode="ui_fallback",
                process=proc,
                message=(
                    "Antigravity çalışıyor ancak CDP portu kapalı; UI Automation yedeği hazır. "
                    "Arka plan kontrolü için Antigravity'yi `--remote-debugging-port=9222` ile başlatabilirsiniz."
                ),
            )

        return BridgeStatus(
            connected=False,
            mode="disconnected",
            process=proc,
            message=(
                "Antigravity CDP portu bulunamadı. `eschaton connect --launch` ile "
                "Antigravity'yi debug köprüsüyle başlatabilirsiniz."
            ),
        )

    def ensure_project_open(self, project_path: str, project_name: str) -> bool:
        """Focus the Antigravity window for `project_name`, or launch it if not open."""
        st = self.status(project_hint=project_name)
        if st.mode == "cdp" and any(project_name.lower() in w.lower() for w in st.open_windows):
            return True
        return self.process_manager.launch_with_cdp(workspace_path=project_path)

    def deliver_prompt(
        self,
        prompt: str,
        model_name: str,
        project_name: Optional[str] = None,
    ) -> DeliveryResult:
        """
        Send an already-approved prompt to Antigravity after selecting the target model.
        NOTE: Must ONLY be called after UsageShield.evaluate() returns allowed=True.
        """
        st = self.status(project_hint=project_name)

        if st.mode == "cdp" and self._cdp is not None:
            target: Optional[CDPTarget] = self._cdp.select_target(project_name=project_name)
            if not target:
                return DeliveryResult(
                    delivered=False,
                    mode="cdp",
                    detail="CDP üzerinde aktif Antigravity pencere hedefi bulunamadı.",
                )

            model_applied = self._cdp.select_model(target, model_name)
            res = self._cdp.send_prompt(target, prompt)
            if res.get("ok"):
                return DeliveryResult(
                    delivered=True,
                    mode="cdp",
                    model_applied=model_applied,
                    target_window=target.title,
                    detail=f"Prompt CDP köprüsüyle Antigravity'ye gönderildi ({res.get('method')}).",
                )
            return DeliveryResult(
                delivered=False,
                mode="cdp",
                model_applied=model_applied,
                target_window=target.title,
                detail=str(res.get("error", "Bilinmeyen CDP gönderim hatası.")),
            )

        if st.mode == "ui_fallback":
            res = self.ui_fallback.send_prompt_via_ui(prompt, project_hint=project_name)
            return DeliveryResult(
                delivered=bool(res.get("ok")),
                mode="ui_fallback",
                model_applied=False,
                target_window=project_name,
                detail=str(res.get("error") or "Prompt UI Automation yedeği ile gönderildi."),
            )

        return DeliveryResult(
            delivered=False,
            mode="disconnected",
            detail=st.message,
        )
