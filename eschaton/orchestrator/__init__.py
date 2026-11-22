"""Core co-agent orchestration engine and specialist roles."""

from eschaton.orchestrator.engine import DelegationReport, EschatonOrchestrator
from eschaton.orchestrator.roles import ROLES, CoAgentRole, compose_delegation_prompt, get_role

__all__ = [
    "CoAgentRole",
    "DelegationReport",
    "EschatonOrchestrator",
    "ROLES",
    "compose_delegation_prompt",
    "get_role",
]
