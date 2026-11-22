"""End-to-end tests for EschatonOrchestrator and the JSON-RPC MCP Server."""

import json
from pathlib import Path
from typing import List, Optional

from eschaton.bridge.hybrid import AntigravityBridge, BridgeStatus, DeliveryResult
from eschaton.bridge.process_manager import AntigravityProcessInfo
from eschaton.config import EschatonConfig
from eschaton.mcp.server import EschatonMCPServer
from eschaton.orchestrator.engine import EschatonOrchestrator


class FakeAntigravityBridge(AntigravityBridge):
    """In-memory fake bridge to verify orchestrator + MCP behavior deterministically."""

    def __init__(self, remaining_usage: float = 85.0, open_windows: Optional[List[str]] = None):
        super().__init__()
        self.remaining_usage = remaining_usage
        self.open_windows = open_windows or ["Antigravity - DemoProject"]
        self.deliver_calls: List[dict] = []

    def status(self, project_hint: Optional[str] = None) -> BridgeStatus:
        return BridgeStatus(
            connected=True,
            mode="cdp",
            process=AntigravityProcessInfo(running=True, pid=1234, cdp_port=9222, cdp_reachable=True),
            open_windows=self.open_windows,
            available_models=["gemini-4-neon", "claude-sonnet-5.5", "gemini-3.8-flash"],
            live_remaining_usage_percent=self.remaining_usage,
            message="Fake CDP connected",
        )

    def deliver_prompt(
        self,
        prompt: str,
        model_name: str,
        project_name: Optional[str] = None,
    ) -> DeliveryResult:
        self.deliver_calls.append(
            {"prompt": prompt, "model_name": model_name, "project_name": project_name}
        )
        return DeliveryResult(
            delivered=True,
            mode="cdp",
            model_applied=True,
            target_window=self.open_windows[0],
            detail="Delivered via fake CDP",
        )


def test_orchestrator_blocks_bridge_completely_at_10_percent(tmp_path: Path):
    proj = tmp_path / "DemoProject"
    proj.mkdir()
    (proj / ".git").mkdir()

    cfg = EschatonConfig(state_dir=tmp_path / ".eschaton", workspace_search_roots=[tmp_path])
    fake_bridge = FakeAntigravityBridge(remaining_usage=10.0)
    orch = EschatonOrchestrator(config=cfg, bridge=fake_bridge)

    report = orch.delegate_task(
        prompt="Implement a new REST endpoint",
        project_hint=str(proj),
        role="code_implementer",
        caller_agent="Qoder",
        allow_network=False,
    )
    assert report.blocked_by_usage_shield is True
    assert report.executed is False
    # Critical invariant: bridge MUST NEVER be called when shield blocks!
    assert len(fake_bridge.deliver_calls) == 0


def test_orchestrator_delegates_successfully_when_safe(tmp_path: Path):
    proj = tmp_path / "DemoProject"
    proj.mkdir()
    (proj / ".git").mkdir()

    cfg = EschatonConfig(state_dir=tmp_path / ".eschaton", workspace_search_roots=[tmp_path])
    fake_bridge = FakeAntigravityBridge(remaining_usage=85.0)
    orch = EschatonOrchestrator(config=cfg, bridge=fake_bridge)

    report = orch.delegate_task(
        prompt="Fix the bug in login handler and add pytest tests",
        project_hint=str(proj),
        role="deep_debugger",
        caller_agent="OpenCode",
        allow_network=False,
    )
    assert report.blocked_by_usage_shield is False
    assert report.executed is True
    assert report.workspace.project_name == "DemoProject"
    assert len(fake_bridge.deliver_calls) == 1
    assert "OpenCode" in fake_bridge.deliver_calls[0]["prompt"]


def test_mcp_server_protocol_initialize_list_and_call(tmp_path: Path):
    cfg = EschatonConfig(state_dir=tmp_path / ".eschaton", workspace_search_roots=[tmp_path])
    fake_bridge = FakeAntigravityBridge(remaining_usage=72.0)
    orch = EschatonOrchestrator(config=cfg, bridge=fake_bridge)
    server = EschatonMCPServer(orchestrator=orch)

    # 1. initialize
    init_resp = server.handle_request({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}})
    assert init_resp is not None
    assert init_resp["result"]["serverInfo"]["name"] == "eschaton-antigravity"

    # 2. tools/list
    list_resp = server.handle_request({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})
    assert list_resp is not None
    tool_names = [t["name"] for t in list_resp["result"]["tools"]]
    assert "antigravity_delegate_task" in tool_names
    assert "antigravity_check_usage_shield" in tool_names
    assert "antigravity_select_best_model" in tool_names

    # 3. tools/call -> antigravity_status
    call_resp = server.handle_request(
        {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {"name": "antigravity_status", "arguments": {}},
        }
    )
    assert call_resp is not None
    payload = json.loads(call_resp["result"]["content"][0]["text"])
    assert payload["bridge"]["connected"] is True
    assert payload["usage"]["remaining_percent"] == 72.0
    assert payload["shield"]["min_remaining_floor_percent"] == 10.0
