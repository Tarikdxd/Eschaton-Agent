# ⚡ Eschaton Code

<div align="center">

```
███████████                        ██                 ▄████  ▄██
███▀▀▀▀▀▀▀▀                        ██                 ██    ██▀
███ █████  ██████ ▄█████   ▄████▄  ██████▄  ██   ██ ████████████
███ ███▀▀  ██▀   ███▄▄▄██ ██▄▄▄███ ██   ▀██ ██   ██   ██    ██
███ ███    ███   ███▀▀▀▀▀ ██▀▀▀▀▀  ██▄  ▄██ ██▄  ██   ██    ██
███ ██▀    ██▀    ▀█████   ▀████▀  ██████▀   ▀████▀   ██    ██
```

**Next-Generation OpenCode & Freebuff Terminal AI Assistant**  
*Powered by Freebuff Core 0.2.34, Claude Code Tool Architecture & Native Antigravity Ecosystem*

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](https://github.com/Tarikdxd/Eschaton-Code)
[![Antigravity](https://img.shields.io/badge/Antigravity-Integrated-purple.svg)](https://github.com/Tarikdxd/Eschaton-Code)
[![Claude Code](https://img.shields.io/badge/Engine-Claude%20Code%20Core-orange.svg)](https://github.com/Tarikdxd/Eschaton-Code)

</div>

---

## 🚀 Quick Start & Installation

Install globally directly from GitHub via npm:

```bash
npm install -g https://github.com/Tarikdxd/Eschaton-Code
```

Once installed, simply run anywhere:

```bash
eschaton
```
*(or run `freebuff` / `opencode`)*

### Instant Zero-Install Launch
You can also run instantly without installation using `npx`:

```bash
npx https://github.com/Tarikdxd/Eschaton-Code
```

---

## 🌟 Key Features

### 🖥️ 1. Exact High-Fidelity OpenCode / Freebuff TUI
- **Full Terminal App:** Alternate screen buffer, box-drawing styling, and zero-flicker rendering.
- **Top Header Status:** Real-time model badge, git branch, directory status, and active token counters.
- **Interactive Multi-Line Editor:** Cursor navigation, auto-expanding text box, syntax highlighting, and slash command autocompletion (`/`).
- **Real-Time Diff Viewer:** Highlighting line insertions (`+` green) and deletions (`-` red) with line numbers.
- **Collapsible Thinking Accordion:** Expandable agent internal reasoning with elapsed timer.
- **Interactive Model Selector:** Switch on the fly between MiMo v2.6, GLM 5.3 Flash, DeepSeek V4.1, GPT-6, Gemini 3.8 Flash, and more.

### ⚛️ 2. First-Class Native Antigravity Authentication
- **Auto-Detection:** Automatically discovers your local `~/.gemini/antigravity` environment, installation UUID, and brain storage.
- **Session Linking:** Pass `--antigravity` or run `eschaton auth` to inspect your connected session:
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

### 🧠 3. Claude Code Agent Engine
- **Tool Architecture:** Implements the complete ReAct tool set (`bash`, `read_file`, `str_replace` diff editor, `write_file`, `glob`, `grep`, and `list_dir`).
- **Parallel Subagents:** Autonomous task planning, codebase indexation, and multi-file code editing.

---

## 🛠️ CLI Usage & Options

```bash
Usage: eschaton [options] [command]

Commands:
  login                         Authenticate with your Freebuff / Codebuff account
  auth, --antigravity           Inspect Antigravity session status & local brain sync

Options:
  -v, --version                 Print version information
  --continue [conversation-id]  Continue from a previous conversation
  --cwd <directory>             Set the working directory (default: current directory)
  --trust-agents                Load repository's .agents files and mcp.json without prompt
  -h, --help                    Show this help message
```

---

## 📁 Repository Architecture

This repository contains the complete OpenCode / Freebuff monorepo source code:

- `cli/`: OpenTUI and React terminal user interface implementation.
- `common/`: Core shared utilities, model catalog definitions, and types.
- `agents/`: Autonomous coding agents and agent configurations.
- `packages/`: Agent runtime, code mapping, and LLM provider drivers.
- `sdk/`: Client SDK for programmatically integrating the agent runtime.
- `freebuff/`: Extended web & cloud distribution assets.
- `bin/`: Cross-platform launcher with zero-dependency auto-extractor and Antigravity bridge.

---

## 🤝 Contributing

Contributions are warmly welcomed! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) and [AGENTS.md](./AGENTS.md) to learn about our agent guidelines and architecture.

```bash
git clone https://github.com/Tarikdxd/Eschaton-Code.git
cd Eschaton-Code
bun install
```

---

## 📜 License

Licensed under the [Apache License 2.0](./LICENSE).  
Maintained by Tarık Tozlu ([@Tarikdxd](https://github.com/Tarikdxd)).
