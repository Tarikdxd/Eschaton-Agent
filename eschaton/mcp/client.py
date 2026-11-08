import json
import subprocess
from typing import Dict, Any, List


class MCPClient:
    """
    Client for Model Context Protocol (MCP) servers.
    Allows connecting external tool servers via standard JSON-RPC stdin/stdout.
    """

    def __init__(self, server_command: str):
        self.server_command = server_command
        self.process = None

    def start(self):
        if not self.process:
            self.process = subprocess.Popen(
                self.server_command,
                shell=True,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )

    def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Any:
        if not self.process:
            self.start()

        request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments
            }
        }
        json_req = json.dumps(request) + "\n"
        self.process.stdin.write(json_req)
        self.process.stdin.flush()

        line = self.process.stdout.readline()
        if not line:
            return {"error": "MCP server did not return output"}
        return json.loads(line)

    def stop(self):
        if self.process:
            self.process.terminate()
            self.process = None
