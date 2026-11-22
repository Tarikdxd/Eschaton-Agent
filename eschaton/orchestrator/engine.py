"""
EschatonOrchestrator: Central brain coordinating Workspace Selection,
Live Benchmark Model Routing, the 10% Usage Shield, and the Hybrid Antigravity Bridge.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel

from eschaton.bridge.hybrid import AntigravityBridge, BridgeStatus, DeliveryResult
from eschaton.config import EschatonConfig
from eschaton.guard.shield import UsageDecision, UsageShield
from eschaton.guard.usage_tracker import UsageSnapshot, UsageTracker
from eschaton.models.selector import ModelSelection, ModelSelector
from eschaton.orchestrator.roles import CoAgentRole, compose_delegation_prompt, get_role
from eschaton.workspace.selector import WorkspaceMatch, WorkspaceSelector


class DelegationReport(BaseModel):
    """Structured report returned to the calling external agent (Qoder, OpenCode, etc.)."""

    executed: bool
    blocked_by_usage_shield: bool
    workspace: WorkspaceMatch
    role: CoAgentRole
    model_selection: ModelSelection
    usage_decision: UsageDecision
    delivery: Optional[DeliveryResult] = None
    composed_prompt: str
    summary: str


class EschatonOrchestrator:
    """
    End-to-end orchestrator that lets any external AI agent safely use
    the user's local Antigravity app as a co-agent.
    """

    def __init__(
        self,
        config: Optional[EschatonConfig] = None,
        bridge: Optional[AntigravityBridge] = None,
        workspace_selector: Optional[WorkspaceSelector] = None,
        model_selector: Optional[ModelSelector] = None,
        usage_tracker: Optional[UsageTracker] = None,
        usage_shield: Optional[UsageShield] = None,
    ):
        self.config = config or EschatonConfig.from_env()
        self.bridge = bridge or AntigravityBridge(self.config)
        self.workspace_selector = workspace_selector or WorkspaceSelector(self.config)
        self.model_selector = model_selector or ModelSelector(self.config)
        self.usage_tracker = usage_tracker or UsageTracker(self.config)
        self.usage_shield = usage_shield or UsageShield(self.config)

    def get_status(self, project_hint: Optional[str] = None) -> dict:
        """Return unified connection, workspace, and usage shield status."""
        bridge_status: BridgeStatus = self.bridge.status(project_hint=project_hint)
        usage: UsageSnapshot = self.usage_tracker.read_snapshot(
            live_remaining_percent=bridge_status.live_remaining_usage_percent
        )
        return {
            "bridge": bridge_status.model_dump(),
            "usage": usage.model_dump(),
            "shield": {
                "min_remaining_floor_percent": self.usage_shield.min_floor,
                "economy_threshold_percent": self.usage_shield.economy_threshold,
                "locked": usage.remaining_percent <= self.usage_shield.min_floor,
            },
        }

    def check_usage_shield(
        self,
        prompt: str,
        role: str = "code_implementer",
        model_name: Optional[str] = None,
        context_texts: Optional[List[str]] = None,
        allow_network: bool = True,
    ) -> tuple[UsageDecision, ModelSelection, UsageSnapshot]:
        """Run pre-flight model selection + 10% usage shield evaluation without sending."""
        bridge_status = self.bridge.status()
        usage = self.usage_tracker.read_snapshot(
            live_remaining_percent=bridge_status.live_remaining_usage_percent
        )
        selection = self.model_selector.select(
            prompt=prompt,
            available_models=bridge_status.available_models or None,
            remaining_usage_percent=usage.remaining_percent,
            role=role,
            allow_network=allow_network,
        )
        chosen_model = model_name or selection.selected_model
        decision = self.usage_shield.evaluate(
            prompt=prompt,
            model_name=chosen_model,
            usage=usage,
            role=role,
            context_texts=context_texts,
        )
        return decision, selection, usage

    def delegate_task(
        self,
        prompt: str,
        project_hint: Optional[str] = None,
        role: str = "code_implementer",
        caller_agent: str = "external-agent",
        context_texts: Optional[List[str]] = None,
        dry_run: bool = False,
        allow_network: bool = True,
    ) -> DelegationReport:
        """
        Full co-agent delegation pipeline:
        1. Inspect Antigravity bridge & live usage
        2. Resolve & select the exact project workspace
        3. Research live benchmarks & select the best model for the prompt
        4. Compose specialist co-agent prompt
        5. Enforce the strict 10% Usage Shield (HARD BLOCK if unsafe)
        6. Deliver to Antigravity (unless dry_run or blocked) and record usage
        """
        bridge_status = self.bridge.status(project_hint=project_hint)
        usage = self.usage_tracker.read_snapshot(
            live_remaining_percent=bridge_status.live_remaining_usage_percent
        )

        # 1. Select the right project
        workspace = self.workspace_selector.resolve(
            project_hint=project_hint,
            prompt=prompt,
            open_antigravity_titles=bridge_status.open_windows,
        )

        # 2. Compose role-wrapped prompt
        role_obj = get_role(role)
        composed = compose_delegation_prompt(
            user_prompt=prompt,
            role_id=role_obj.role_id,
            project_name=workspace.project_name,
            project_path=workspace.project_path,
            caller_agent=caller_agent,
        )

        # 3. Select optimal model from live benchmarks + usage budget
        selection = self.model_selector.select(
            prompt=prompt,
            available_models=bridge_status.available_models or None,
            remaining_usage_percent=usage.remaining_percent,
            role=role_obj.role_id,
            allow_network=allow_network,
        )

        # 4. Run strict 10% Usage Shield on the FULL composed prompt
        decision = self.usage_shield.evaluate(
            prompt=composed,
            model_name=selection.selected_model,
            usage=usage,
            role=role_obj.role_id,
            context_texts=context_texts,
        )

        # HARD INVARIANT: If shield denies, NEVER touch the Antigravity bridge.
        if not decision.allowed:
            return DelegationReport(
                executed=False,
                blocked_by_usage_shield=True,
                workspace=workspace,
                role=role_obj,
                model_selection=selection,
                usage_decision=decision,
                delivery=None,
                composed_prompt=composed,
                summary=decision.reason,
            )

        final_model = decision.recommended_model or selection.selected_model

        if dry_run:
            return DelegationReport(
                executed=False,
                blocked_by_usage_shield=False,
                workspace=workspace,
                role=role_obj,
                model_selection=selection,
                usage_decision=decision,
                delivery=None,
                composed_prompt=composed,
                summary=(
                    f"[DRY-RUN] Görev onaylandı. Proje='{workspace.project_name}', "
                    f"Model='{final_model}', Tahmini Maliyet=%{decision.estimated_cost_percent:.2f}."
                ),
            )

        # 5. Deliver to Antigravity
        delivery = self.bridge.deliver_prompt(
            prompt=composed,
            model_name=final_model,
            project_name=workspace.project_name,
        )

        if delivery.delivered:
            self.usage_tracker.record_consumption(
                weighted_tokens=decision.token_estimate.weighted_tokens,
                estimated_percent=decision.estimated_cost_percent,
            )

        return DelegationReport(
            executed=delivery.delivered,
            blocked_by_usage_shield=False,
            workspace=workspace,
            role=role_obj,
            model_selection=selection,
            usage_decision=decision,
            delivery=delivery,
            composed_prompt=composed,
            summary=delivery.detail,
        )
