"""
Standard Model Context Protocol (MCP) JSON-RPC 2.0 stdio server.

Allows Qoder, OpenCode, Claude Code, Cursor, or any MCP-compatible agent to
connect directly to the user's local Antigravity application via Eschaton-Agent.
"""

from __future__ import annotations

import json
import sys
from typing import Any, Dict, List, Optional

from eschaton import __version__
from eschaton.orchestrator.engine import EschatonOrchestrator


TOOL_DEFINITIONS: List[Dict[str, Any]] = [
    {
        "name": "antigravity_status",
        "description": (
            "Inspect local Antigravity connection status (CDP / UI fallback), open project windows, "
            "available models, current remaining usage %, and the 10% Usage Shield lock state."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "project_hint": {
                    "type": "string",
                    "description": "Optional project name or path to check window matching.",
                }
            },
        },
    },
    {
        "name": "antigravity_select_project",
        "description": (
            "Locate the exact project workspace on the user's machine and match/open it in Antigravity."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "project_hint": {
                    "type": "string",
                    "description": "Project path or project folder name.",
                },
                "open_if_needed": {
                    "type": "boolean",
                    "description": "Launch Antigravity with this project if not already open.",
                    "default": False,
                },
            },
            "required": ["project_hint"],
        },
    },
    {
        "name": "antigravity_select_best_model",
        "description": (
            "Research live AI coding benchmarks (SWE-bench, Aider Polyglot, WebDev/LMArena, LiveCodeBench) "
            "and select the highest-performing Antigravity model for a specific prompt and usage budget."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "The prompt or task description to analyze.",
                },
                "role": {
                    "type": "string",
                    "description": "Optional co-agent role (co_architect, code_implementer, deep_debugger, ui_specialist, reviewer_tester, quick_helper).",
                },
                "force_refresh": {
                    "type": "boolean",
                    "description": "Force live web benchmark refresh instead of using cache.",
                    "default": False,
                },
            },
            "required": ["prompt"],
        },
    },
    {
        "name": "antigravity_check_usage_shield",
        "description": (
            "Run pre-flight token estimation and 10% Usage Shield verification BEFORE sending a prompt. "
            "Never lets Antigravity usage drop below 10%; returns compressed/split suggestions if blocked."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "prompt": {"type": "string", "description": "Prompt to evaluate."},
                "role": {"type": "string", "default": "code_implementer"},
                "model_name": {"type": "string", "description": "Optional explicit model override."},
            },
            "required": ["prompt"],
        },
    },
    {
        "name": "antigravity_delegate_task",
        "description": (
            "Delegate a development task to the user's local Antigravity as a specialist co-agent. "
            "Automatically selects the right project, picks the best benchmarked model, enforces the "
            "strict 10% Usage Shield (blocks if overflow or <=10% remaining), and sends the task."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "prompt": {"type": "string", "description": "Task prompt for Antigravity."},
                "project_hint": {
                    "type": "string",
                    "description": "Absolute path or project name so Antigravity works on the exact workspace.",
                },
                "role": {
                    "type": "string",
                    "enum": [
                        "co_architect",
                        "code_implementer",
                        "deep_debugger",
                        "ui_specialist",
                        "reviewer_tester",
                        "quick_helper",
                    ],
                    "default": "code_implementer",
                },
                "caller_agent": {
                    "type": "string",
                    "description": "Name of the calling agent (e.g. Qoder, OpenCode, Claude Code).",
                    "default": "external-agent",
                },
                "dry_run": {
                    "type": "boolean",
                    "description": "Simulate all steps without delivering to Antigravity.",
                    "default": False,
                },
            },
            "required": ["prompt"],
        },
    },
]


class EschatonMCPServer:
    """JSON-RPC 2.0 MCP server wrapping EschatonOrchestrator."""

    def __init__(self, orchestrator: Optional[EschatonOrchestrator] = None):
        self.orchestrator = orchestrator or EschatonOrchestrator()

    def handle_request(self, request: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Process a single JSON-RPC 2.0 request and return a JSON-RPC response dict."""
        req_id = request.get("id")
        method = request.get("method", "")
        params = request.get("params") or {}

        # Notifications have no id and require no response
        if req_id is None and method.startswith("notifications/"):
            return None

        try:
            if method == "initialize":
                return self._ok(
                    req_id,
                    {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {"tools": {}},
                        "serverInfo": {"name": "eschaton-antigravity", "version": __version__},
                    },
                )

            if method == "ping":
                return self._ok(req_id, {})

            if method == "tools/list":
                return self._ok(req_id, {"tools": TOOL_DEFINITIONS})

            if method == "tools/call":
                tool_name = params.get("name", "")
                arguments = params.get("arguments") or {}
                result_payload = self._dispatch_tool(tool_name, arguments)
                return self._ok(
                    req_id,
                    {
                        "content": [
                            {
                                "type": "text",
                                "text": json.dumps(result_payload, ensure_ascii=False, indent=2),
                            }
                        ],
                        "isError": False,
                    },
                )

            return self._error(req_id, -32601, f"Unknown method: {method}")
        except Exception as exc:
            return self._error(req_id, -32603, str(exc))

    def _dispatch_tool(self, name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        if name == "antigravity_status":
            return self.orchestrator.get_status(project_hint=args.get("project_hint"))

        if name == "antigravity_select_project":
            bridge_status = self.orchestrator.bridge.status()
            match = self.orchestrator.workspace_selector.resolve(
                project_hint=args.get("project_hint"),
                open_antigravity_titles=bridge_status.open_windows,
            )
            opened = False
            if args.get("open_if_needed") and match.found and not match.already_open_in_antigravity:
                opened = self.orchestrator.bridge.ensure_project_open(
                    match.project_path, match.project_name
                )
            return {"workspace": match.model_dump(), "launched_in_antigravity": opened}

        if name == "antigravity_select_best_model":
            bridge_status = self.orchestrator.bridge.status()
            usage = self.orchestrator.usage_tracker.read_snapshot(
                live_remaining_percent=bridge_status.live_remaining_usage_percent
            )
            sel = self.orchestrator.model_selector.select(
                prompt=str(args.get("prompt", "")),
                available_models=bridge_status.available_models or None,
                remaining_usage_percent=usage.remaining_percent,
                role=args.get("role"),
                force_refresh=bool(args.get("force_refresh", False)),
            )
            return sel.model_dump()

        if name == "antigravity_check_usage_shield":
            decision, selection, usage = self.orchestrator.check_usage_shield(
                prompt=str(args.get("prompt", "")),
                role=str(args.get("role", "code_implementer")),
                model_name=args.get("model_name"),
            )
            return {
                "usage": usage.model_dump(),
                "model_selection": selection.model_dump(),
                "usage_decision": decision.model_dump(),
            }

        if name == "antigravity_delegate_task":
            report = self.orchestrator.delegate_task(
                prompt=str(args.get("prompt", "")),
                project_hint=args.get("project_hint"),
                role=str(args.get("role", "code_implementer")),
                caller_agent=str(args.get("caller_agent", "external-agent")),
                dry_run=bool(args.get("dry_run", False)),
            )
            return report.model_dump()

        raise ValueError(f"Unknown tool: {name}")

    @staticmethod
    def _ok(req_id: Any, result: Dict[str, Any]) -> Dict[str, Any]:
        return {"jsonrpc": "2.0", "id": req_id, "result": result}

    @staticmethod
    def _error(req_id: Any, code: int, message: str) -> Dict[str, Any]:
        return {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}}

    def run_stdio(self) -> None:
        """Run the blocking stdio JSON-RPC loop for MCP clients."""
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                req = json.loads(line)
            except json.JSONDecodeError as exc:
                resp = self._error(None, -32700, f"Parse error: {exc}")
                sys.stdout.write(json.dumps(resp, ensure_ascii=False) + "\n")
                sys.stdout.flush()
                continue

            resp = self.handle_request(req)
            if resp is not None:
                sys.stdout.write(json.dumps(resp, ensure_ascii=False) + "\n")
                sys.stdout.flush()


def main() -> None:
    """CLI entrypoint for `eschaton-mcp`."""
    server = EschatonMCPServer()
    server.run_stdio()


if __name__ == "__main__":
    main()
