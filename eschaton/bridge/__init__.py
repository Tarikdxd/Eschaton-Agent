"""Hybrid bridge connecting Eschaton-Agent to the local Antigravity desktop app."""

from eschaton.bridge.cdp_client import CDPClient, CDPTarget
from eschaton.bridge.hybrid import AntigravityBridge, BridgeStatus, DeliveryResult
from eschaton.bridge.process_manager import AntigravityProcessInfo, ProcessManager

__all__ = [
    "AntigravityBridge",
    "AntigravityProcessInfo",
    "BridgeStatus",
    "CDPClient",
    "CDPTarget",
    "DeliveryResult",
    "ProcessManager",
]
