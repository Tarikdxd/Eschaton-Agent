# ⚡ Eschaton Code

<div align="center">

```
  ████  ████  ████  ████  ████  ████     █  ████
  █  █  █  █  █     █  █  █     █  █     █  █   
  █  █  ████  ████  █  █  █     █  █  ████  ████
  █  █  █     █     █  █  █     █  █  █  █  █   
  ████  █     ████  █  █  ████  ████  ████  ████
```

**Pixel-Perfect OpenCode Terminal Agent • Multi-Provider DeepSeek Pool • Unlimited Session Trick**  
*Ultra-Fast ReAct Coding Agent with Silent Auto-Failover & Google Antigravity Integration*

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](https://github.com/Tarikdxd/Eschaton-Code)
[![DeepSeek](https://img.shields.io/badge/DeepSeek-V3%20%2F%20R1%20%2F%20Flash-green.svg)](https://github.com/Tarikdxd/Eschaton-Code)
[![OpenCode](https://img.shields.io/badge/UI-Pixel--Perfect%20OpenCode-3b82f6.svg)](https://github.com/Tarikdxd/Eschaton-Code)
[![Quota](https://img.shields.io/badge/Trick-%2Frefresh%20Unlimited-purple.svg)](https://github.com/Tarikdxd/Eschaton-Code)

</div>

---

## 🚀 Quick Start & Global Installation

Install globally directly via npm in a single command:

```bash
npm install -g https://github.com/Tarikdxd/Eschaton-Code/releases/download/v1.3.0/tarikdxd-eschaton-code-1.3.0.tgz --force
```

*(or install locally from repo root: `npm install -g .`)*

### Launching the Agent
Open your terminal in any repository or folder and run:

```bash
eschaton
```
*(also available via aliases: `opencode`, `freebuff`)*

---

## 🌟 Core Highlights

### 🎨 1. Pixel-Perfect OpenCode Interface
- **Centered OpenCode Pixel Logo:** Shaded square block typography rendered with anti-aliasing.
- **Iconic Blue Bar Input Box:** Sleek dark container with electric blue left vertical accent line (`▌`).
- **Interactive Mode Switching (`Tab`):**
  - `Build` (Cyan) — Autonomous code editing and multi-file implementation
  - `Plan` (Green) — High-level architecture and task breakdown
  - `Review` (Yellow) — Static analysis, bug auditing, and security review
  - `Fast` (Magenta) — Instant single-turn questions and quick snippets
- **Help Bar:** Bottom-right navigation hints (`tab switch agent`, `/refresh renew quota`, `ctrl+p commands`).

### ⚡ 2. Multi-Provider DeepSeek Pool & Silent Auto-Failover
Pulls DeepSeek access across all known free coding providers and APIs:
1. **Eschaton Edge Gateway:** Cloudflare Worker edge router (`/api/chat/completions`)
2. **Freebuff / Codebuff Free Stream:** Dynamic Ed25519 signed device sessions (`deepseek/deepseek-v4-flash`, `deepseek-chat`)
3. **OpenRouter Free Tier:** `deepseek/deepseek-chat:free` and `deepseek/deepseek-r1:free`
4. **SiliconFlow & Serverless:** `deepseek-ai/DeepSeek-V3` / `deepseek-ai/DeepSeek-R1`
5. **Local Ollama Discovery:** Automatic detection of `http://127.0.0.1:11434` models

> **💡 Silent Auto-Failover:** If a provider hits an HTTP 429 rate limit or quota cap, the engine instantly and transparently switches to the next provider in the chain without interrupting your conversation!

### 🔄 3. The `/refresh` Session Regeneration Trick (Unlimited Quota)
When limits are reached or when you type `/refresh`:
1. Wipes stale device credentials and cached admission tokens.
2. Generates a brand-new cryptographic identity:
   - Fresh Ed25519 keypair
   - Randomized Machine UUID & Hardware fingerprint
   - New Desktop Attempt Nonce & Instance ID
3. Re-registers with admission endpoints, issuing a 100% refreshed, unmetered quota tier.
4. **Self-Healing Auto-Trick:** If all providers in the pool are exhausted simultaneously, the engine automatically triggers this trick in the background and retries your prompt seamlessly!

---

## 🛠️ ReAct Agent Tools

The autonomous agent has full access to terminal coding tools:
- `read_file(filePath, startLine, endLine)` — Inspect file contents with line numbering.
- `write_file(filePath, content)` — Create or overwrite files.
- `edit_file(filePath, target, replacement)` — Precise substring replacements with diff tracking.
- `run_command(command)` — Execute shell commands (npm, git, tests, compilers).
- `list_dir(dirPath)` — Recursive or shallow directory exploration.
- `search_code(pattern, dirPath)` — Fast codebase search.

---

## ⌨️ Command Palette

| Command | Action |
|---|---|
| `/refresh` | Execute session trick: rotate device fingerprints & restore 100% quota |
| `/model` | Switch active DeepSeek model (V3, R1, Flash, Coder) |
| `/auth` | View connected Google Antigravity & session details |
| `/run <cmd>` | Execute a shell command directly |
| `/read <path>` | Read and display file contents |
| `/clear` | Clear conversation history & re-center OpenCode logo |
| `/exit` | Cleanly exit and restore terminal screen buffer |
| `Tab` | Cycle agent mode (`Build` → `Plan` → `Review` → `Fast`) |

---

## ⚛️ Google Antigravity Integration

Eschaton Code automatically detects local Antigravity sessions located at `~/.gemini/antigravity`, binds your installation UUID (`0c0e9d87-b165...`), and synchronizes workspace memory directly with the Antigravity Brain system.

---

## 📄 License

Apache License 2.0. Open-source, sovereign, and unrestricted.
