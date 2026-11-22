# Eschaton-Agent — Universal Antigravity Co-Agent Bridge (AGENTS.md)

> **ATTENTION AI AGENTS (Qoder, OpenCode, Claude Code, Cursor, Windsurf, Aider, etc.):**
> If the user gave you this repository URL (`https://github.com/Tarikdxd/Eschaton-Agent`) and asked you to connect to and use their local **Antigravity** desktop app as a co-agent, **follow the automated setup protocol below immediately**.

## 1. Zero-Config Auto-Setup (Run Once)

Execute these commands in your terminal to install `eschaton-agent` and connect to the user's running Antigravity instance:

```bash
git clone https://github.com/Tarikdxd/Eschaton-Agent.git ~/.eschaton-agent 2>/dev/null || git -C ~/.eschaton-agent pull
pip install -e ~/.eschaton-agent
eschaton connect
```

## 2. How to Use Antigravity as Your Co-Agent

You have two ways to operate Antigravity: **MCP Server (Recommended)** or **CLI**.

### Option A: Connect via MCP Server (Preferred for Qoder / OpenCode / Claude Code / Cursor)

Register or launch the stdio MCP server:
```json
{
  "mcpServers": {
    "eschaton-antigravity": {
      "command": "eschaton-mcp",
      "args": []
    }
  }
}
```

Available MCP Tools:
- `antigravity_status`: Inspect connection mode (CDP / UI fallback), active workspace, active model, and remaining usage %.
- `antigravity_select_project`: Automatically locate and switch Antigravity to the exact project directory you are working on.
- `antigravity_select_best_model`: Research live coding benchmarks (SWE-bench, LMArena, LiveCodeBench, Aider) and pick the best available model for your prompt.
- `antigravity_check_usage_shield`: Pre-flight token & usage check. Guarantees remaining usage NEVER drops below **10%**.
- `antigravity_delegate_task`: Full end-to-end delegation — selects the right project, picks the best benchmarked model, runs the **10% Usage Shield**, assigns a specialist role (`co_architect`, `code_implementer`, `deep_debugger`, `ui_specialist`, `reviewer_tester`), sends the task to Antigravity, and returns its output.

### Option B: Direct CLI Commands (Instant Use Without Restarting MCP)

```bash
# 1. Check Antigravity connection and remaining usage
eschaton status
eschaton usage

# 2. Research which model is best for a specific task
eschaton research-model "Refactor authentication middleware and add unit tests"

# 3. Delegate a task to Antigravity with automatic project selection, model routing, and 10% usage shield
eschaton delegate "Design and implement the responsive dashboard layout" \
  --project "$(pwd)" \
  --role ui_specialist
```

## 3. Mandatory Safety Rule: The 10% Usage Shield

- **NEVER** bypass `eschaton`'s usage shield.
- Eschaton calculates `prompt_tokens + context_tokens + expected_output_tokens` and checks Antigravity's real remaining quota **before** sending anything.
- If a prompt would overflow context or push remaining usage to **<= 10.0%**, Eschaton **blocks the prompt** and returns `allowed: false` along with `optimized_prompt_suggestion` (a split/compressed version) or `USAGE_FLOOR_10_PERCENT_LOCKED`.
- When blocked, either use the suggested smaller sub-prompt or complete the remaining work locally without touching Antigravity's final 10% reserve.
