<div align="center">

# ⚡ Eschaton Code

**Production-Grade Multi-Agent Orchestration Framework & Autonomous Terminal Coding Agent**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Stars](https://img.shields.io/github/stars/Tarikdxd/Eschaton-Code?style=flat-square&color=yellow)](https://github.com/Tarikdxd/Eschaton-Code)

*Build autonomous AI agent teams that collaborate in real time, or launch an interactive terminal coding agent right in your command line with a single command.*

---

</div>

## 🚀 Quick Terminal Launch (CLI Agent)

You don't need any npm tokens or complex setups to run **Eschaton Code**. Install globally directly from GitHub:

```bash
npm install -g https://github.com/Tarikdxd/Eschaton-Code
```

Once installed, simply launch your autonomous terminal agent anywhere by typing:
```bash
eschaton
```

```text
╔══════════════════════════════════════════════════════════════════════╗
║                    ⚡ ESCHATON CODE CLI AGENT                        ║
║          Autonomous Multi-Agent Terminal Orchestration Engine        ║
║                       Developer: @Tarikdxd                           ║
╚══════════════════════════════════════════════════════════════════════╝

eschaton> /team Build an authenticated REST API with SQLite and JWT
[⚡ OTONOM AJAN TAKIMI BAŞLATILDI]
-> [Planner] Decomposing goals into topological DAG tasks...
-> [Researcher] Analyzing dependencies and schemas...
-> [Coder] Generating modular source files and tests...
-> [Reviewer] Auditing security, syntax, and zero-leak compliance...
[✓] Task Completed Successfully!
```

*(Alternatively, you can clone and run it directly with `git clone https://github.com/Tarikdxd/Eschaton-Code.git && cd Eschaton-Code && npm start`)*

---

## 🛠️ CLI Interactive Command Matrix

| Command | Action | Description |
| :--- | :--- | :--- |
| `eschaton` | **Launch Agent** | Opens interactive terminal REPL agent session |
| `/agent <task>` | **Single Agent** | Runs a dedicated autonomous agent with file/bash execution tools |
| `/team <goal>` | **Multi-Agent Team** | Spawns a full team (*Planner*, *Researcher*, *Coder*, *Reviewer*) resolving DAG tasks |
| `/tools` | **Inspect Tool Matrix** | Lists built-in tools (`bash`, `file_read`, `file_write`, `file_edit`, `grep`) |
| `/exit` | **Terminate** | Safely shuts down agent session and saves memory |

---

## 📦 Programmatic SDK Usage (Library)

If you're building your own autonomous AI agent systems in Node.js / TypeScript:

```bash
npm install https://github.com/Tarikdxd/Eschaton-Code
```

### 1. Single Agent Workflow
```typescript
import { OpenMultiAgent } from '@tarikdxd/eschaton-code'

const orchestrator = new OpenMultiAgent({ defaultModel: 'claude-sonnet-4-6' })

const result = await orchestrator.runAgent(
  {
    name: 'coder',
    model: 'claude-sonnet-4-6',
    tools: ['bash', 'file_write', 'file_read'],
  },
  'Refactor the authentication middleware to support JWT refresh rotation.',
)

console.log(result.output)
```

### 2. Multi-Agent Team with DAG Scheduling
```typescript
import { OpenMultiAgent } from '@tarikdxd/eschaton-code'

const orchestrator = new OpenMultiAgent()

const team = orchestrator.createTeam('engineering-dept', {
  name: 'engineering',
  agents: [
    { name: 'architect', model: 'claude-sonnet-4-6', systemPrompt: 'You design modular system architectures.' },
    { name: 'developer', model: 'gpt-4o', tools: ['file_write', 'file_read'], systemPrompt: 'You implement clean code.' },
    { name: 'security',  model: 'claude-sonnet-4-6', systemPrompt: 'You audit code for vulnerabilities and leak risks.' }
  ],
  sharedMemory: true
})

const result = await orchestrator.runTeam(team, 'Design and implement an encrypted rate-limiter middleware.')
```

---

## ✨ Core Framework Architecture

- 🧩 **Topological DAG Task Scheduling:** Tasks declare dependencies. Independent tasks execute concurrently; dependent tasks wait automatically.
- 🔄 **Model-Agnostic Engine:** Mix Claude 3.7 / 3.5 Sonnet and GPT-4o within the same collaborative agent team.
- 🪶 **In-Process High Performance:** Zero container or subprocess overhead. Pure Node.js async event loop execution.
- 💾 **Shared Memory & Event Bus:** Real-time inter-agent messaging and shared state synchronization.

---

## 📄 License

Distributed under the [MIT License](LICENSE). Developed by [Tarık Tozlu (@Tarikdxd)](https://github.com/Tarikdxd).
