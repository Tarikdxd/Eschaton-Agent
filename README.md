# ⚡ Eschaton Code

<div align="center">

```
███████ ███████  ██████ ██   ██  █████  ████████  ██████  ███    ██
██      ██      ██      ██   ██ ██   ██    ██    ██    ██ ████   ██
█████   ███████ ██      ███████ ███████    ██    ██    ██ ██ ██  ██
██           ██ ██      ██   ██ ██   ██    ██    ██    ██ ██  ██ ██
███████ ███████  ██████ ██   ██ ██   ██    ██     ██████  ██   ████
```

**Sovereign Terminal AI Coding Assistant & Autonomous Agent Runtime**  
*Powered by Native OpenCode Engine, Claude Code Tool Architecture & Google Antigravity Ecosystem*

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](https://github.com/Tarikdxd/Eschaton-Code)
[![Antigravity](https://img.shields.io/badge/Antigravity-Synchronized-purple.svg)](https://github.com/Tarikdxd/Eschaton-Code)
[![DeepSeek](https://img.shields.io/badge/DeepSeek-V4.1%20Flash%20Free-green.svg)](https://github.com/Tarikdxd/Eschaton-Code)
[![Claude Code](https://img.shields.io/badge/Engine-Claude%20Code%20Core-orange.svg)](https://github.com/Tarikdxd/Eschaton-Code)

</div>

---

## 🚀 Quick Start & Installation

Install globally directly via npm:

```bash
npm install -g https://github.com/Tarikdxd/Eschaton-Code/releases/download/v1.2.1/tarikdxd-eschaton-code-1.2.1.tgz
```

*(or install from repo root: `npm install -g .`)*

### Launching Eschaton Code
Once installed, simply type anywhere in your terminal:

```bash
eschaton
```
*(aliases: `freebuff`, `opencode`)*

---

## 🌟 Key Architecture & Features

### 🖥️ 1. Native High-Fidelity Terminal Interface
- **Alternate Screen Buffer:** Preserves your terminal scrollback on exit, zero-flicker box-drawing UI.
- **Top Header Status:** Displays current model, connected Antigravity session UUID, active workspace directory, and engine badges.
- **Interactive Multi-Line Editor:** Cursor navigation, history navigation (`↑` / `↓`), syntax highlighting, and slash command autocompletion (`/`).
- **Interactive Model Picker (`Ctrl+O` / `/model`):**
  - **DeepSeek V4.1 Flash** (Fast coding, free and unlimited)
  - **DeepSeek V4.1 Flash Fast** (Parallel subagent context gathering)
  - **GLM 5.3 Flash** (Deep reasoning and multi-step planning)
  - **MiMo 2.6 Pro** (Multimodal vision and reasoning)
  - **Claude 3.7 Sonnet** (Full Claude Code toolset)
  - **GPT-6 Luna** (All-around coding)
- **Real-Time Diff Viewer:** Instant line deletions (`-` red) and additions (`+` green) previewing agent edits.
- **Collapsible Thinking Accordion:** Real-time animated spinner tracking agent reasoning steps and time elapsed.

### ⚛️ 2. First-Class Antigravity Synchronization
- **Auto-Discovery:** Automatically detects local `~/.gemini/antigravity` environment (`installation_id`, brain storage).
- **Session Linking:** Pass `--antigravity` or run `eschaton auth`:
  ```bash
  eschaton auth
  ```
  ```text
  ┌─────────────────────────────────────────────────────────────┐
  │   ⚡ ESCHATON CODE • ANTIGRAVITY AUTHENTICATION             │
  ├─────────────────────────────────────────────────────────────┤
  │   Status:          ● CONNECTED (Active Local Session)       │
  │   Installation ID: 0c0e9d87-b165-479e-926d-c9938490a27e     │
  │   Brain Directory: C:\Users\uyuzo\.gemini\antigravity\brain │
  │   Engine Backend:  Claude Code ReAct + OpenCode TUI         │
  └─────────────────────────────────────────────────────────────┘
  ```

### ☁️ 3. Cloudflare Edge Gateway & Web Platform
- Located at [`server/gateway/`](./server/gateway), deployable directly to Cloudflare Workers with `wrangler deploy`.
- Serves an interactive Cyberpunk Web Dashboard and Edge REST endpoints for session telemetry, models, and AI completions.
- Provides fallback local gateway server on `http://127.0.0.1:38421`.

### 🧠 4. Claude Code Tool Engine
- Production-grade autonomous tools:
  - `/run <command>`: Shell command runner with live stdout/stderr capture and exit code badge.
  - `/read <path>`: File inspector and context loader.
  - String replacement diff engine with hunk formatting.
  - Multi-file code editor with automatic rollback on syntax error.

---

## 🛠️ Commands & Keyboard Shortcuts

| Shortcut / Command | Action |
| :--- | :--- |
| `[Enter]` | Submit prompt or execute command |
| `[Ctrl+O]` / `/model` | Open interactive model picker menu |
| `[/]` | Open slash command palette |
| `[↑]` / `[↓]` | Cycle previous prompt history |
| `[Ctrl+C]` / `/exit` | Cleanly exit and restore terminal |
| `/run <command>` | Execute terminal command with ReAct runner |
| `/read <file>` | Inspect file contents into memory |
| `/auth` | View Antigravity connection status |
| `/clear` | Clear conversation history |

---

## 📁 Repository Structure

- `bin/`: Sovereign native Eschaton TUI engine and CLI launchers.
- `server/gateway/`: Cloudflare Worker API gateway and HTML web platform.
- `cli/`: OpenTUI & React component definitions and theme configurations.
- `common/`: Core model definitions, types, and session protocols.
- `agents/`: Autonomous agent definitions and benchmarks.
- `packages/`: Agent runtime, code-map, and LLM provider drivers.
- `sdk/`: SDK for programmatic integration.

---

## 📜 License

Licensed under the [Apache License 2.0](./LICENSE).  
Maintained by Tarık Tozlu ([@Tarikdxd](https://github.com/Tarikdxd)).
