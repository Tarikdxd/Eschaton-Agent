# CLAUDE.md — Eschaton-Agent Antigravity Bridge

This repository turns the user's local **Antigravity** desktop app into a managed co-agent accessible via MCP (`eschaton-mcp`) and CLI (`eschaton`).

See [AGENTS.md](./AGENTS.md) for the full auto-setup and delegation protocol.

Quick commands:
- Install: `pip install -e .`
- Connect to local Antigravity: `eschaton connect`
- Check quota & 10% shield: `eschaton usage`
- Delegate task: `eschaton delegate "<prompt>" --project "<path>" --role <co_architect|code_implementer|deep_debugger|ui_specialist|reviewer_tester>`
- Start MCP server: `eschaton-mcp`
