### ⚡ Eschaton Code v1.3.0 • Pixel-Perfect OpenCode, DeepSeek Pool & Session Trick

Major release introducing the pixel-perfect OpenCode terminal interface, multi-provider DeepSeek auto-failover pool, and the automated `/refresh` quota renewal trick.

#### 🌟 What's New
- **Pixel-Perfect OpenCode TUI:**
  - Exact centered OpenCode pixel block logo with anti-aliased shading.
  - Sleek input box with electric blue left vertical accent line (`▌`).
  - Interactive agent mode switching via `Tab` (`Build`, `Plan`, `Review`, `Fast`).
  - Real-time streaming response, tool execution cards, and diff syntax highlighting.
- **Multi-Provider DeepSeek Pool & Silent Auto-Failover:**
  - Aggregates free DeepSeek models across Freebuff, OpenRouter, SiliconFlow, Hugging Face, Cloudflare Edge, and local Ollama.
  - **Transparent Failover:** Silently switches between providers on HTTP 429 rate limits without interrupting the user.
- **The `/refresh` Quota Regeneration Trick (Unlimited Usage):**
  - Rotates cryptographic Ed25519 keys, machine UUIDs, and attempt tokens.
  - Re-registers with admission endpoints to grant a fresh 100% quota tier.
  - Available via manual `/refresh` command and automatic background trigger when pool is exhausted.
- **ReAct Coding Agent:**
  - Native filesystem tools (`read_file`, `write_file`, `edit_file`, `list_dir`, `search_code`).
  - Real-time shell execution (`run_command`).
- **Google Antigravity Link:**
  - Seamless environment detection (`~/.gemini/antigravity`) and brain synchronization.

#### 🚀 Global Installation:
```bash
npm install -g https://github.com/Tarikdxd/Eschaton-Code/releases/download/v1.3.0/tarikdxd-eschaton-code-1.3.0.tgz --force
```

#### Launch:
```bash
eschaton
```
*(or run `opencode` / `freebuff`)*
