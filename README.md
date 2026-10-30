# Eschaton Code

A coding agent that runs in your terminal. Describe what you want, it reads the repository,
edits files and runs the tests.

It uses native tool calling, so the model decides when to read a file or run a command instead of
emitting a block of JSON that has to be parsed. Works with a free-tier key or a model running on
your machine. There is no subscription and no hosted backend.

## Install

```bash
npm install -g eschaton-code
```

Requires Node.js 20 or newer.

## Free setup

Any one of these is enough. No card required for the free tiers.

```bash
eschaton login openrouter sk-or-...   # free DeepSeek / Qwen models
eschaton login gemini AIza...         # free Gemini Flash tier
eschaton login groq gsk_...           # free Llama / DeepSeek distills
```

Or run a model locally, no account at all:

```bash
ollama pull deepseek-r1:7b
```

Ollama and LM Studio are detected at startup. `eschaton doctor` shows what is wired up.

## Usage

```bash
cd ~/my-project
eschaton
```

```
› add a test for the token refresh path
› why does the build fail on Windows
› rename the fetchUser helper and update its callers
```

The agent reads files, shows a diff before writing, asks before running a command, and reports
what changed.

| Command | What it does |
| --- | --- |
| `/help` | List commands |
| `/mode [name]` | `build`, `plan`, `review` or `fast` |
| `/model [name]` | Show or change the model |
| `/providers [n]` | List providers or switch |
| `/init` | Write an `AGENTS.md` for the project |
| `/diff` | Show the working tree diff |
| `/undo` | Revert the last file the agent changed |
| `/compact` | Summarize the conversation to free context |
| `/cost` | Tokens used this session |
| `/sessions`, `/resume <n>` | List and load saved sessions |
| `/clear`, `/exit` | Forget the conversation / leave |

`Ctrl+C` cancels the running request. `--continue` resumes the last session in the directory.

### Things that work like other terminal agents

- **Project memory.** `ESCHATON.md`, `AGENTS.md` or `CLAUDE.md` in the project root is read at
  startup and added to the system prompt. An existing `CLAUDE.md` keeps working as is.
- **`@file`** in a prompt attaches the file's contents: `explain @src/auth.ts`.
- **`!command`** runs a shell command and prints the output without involving the model.
- **Custom commands.** Drop a markdown file in `.eschaton/commands/review.md` and it becomes
  `/review`. `$ARGUMENTS` is replaced with whatever follows the command. `/commands` lists them.
- **Print mode.** For scripts and CI:

```bash
eschaton -p "why does the build fail" --yes
```

  Without `--yes` the agent is limited to read-only tools, so it cannot edit files or run
  commands unattended.

### MCP servers

`~/.eschaton/mcp.json` or `.eschaton/mcp.json` connects Model Context Protocol servers. Their
tools show up in the agent as `mcp__<server>__<tool>`.

```json
{
  "servers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    }
  }
}
```

Startup prints `mcp  filesystem (12)` when a server connected.

If [mcptoon](https://github.com/activeing123/mcptoon) is on your PATH, it is attached
automatically as a gateway. mcptoon keeps upstream tool schemas out of the context window and
exposes a small set of meta-tools (`mcptoon_manifest`, `mcptoon_call`, `mcptoon_retrieve`, ...)
instead. Disable it with `ESCHATON_MCPTOON=0`.

### Permission rules

`~/.eschaton/permissions.json` and `.eschaton/permissions.json` decide what runs without asking.

```json
{
  "allow": ["run_command:npm test*", "write_file:docs/*"],
  "deny": ["run_command:rm -rf*"]
}
```

`deny` wins over `allow`, and anything unmatched asks. Answering `a` at a prompt saves a narrow
rule for that command or folder, so the next run does not ask again. `/permissions` shows the
active rules.

### Hooks

`.eschaton/hooks.json` runs a command around every tool call. A non-zero exit from `preTool`
blocks the tool and the output is handed back to the model.

```json
{
  "preTool": "node scripts/check-tool.js",
  "postTool": "npm run lint --silent"
}
```

The hook receives `ESCHATON_TOOL`, `ESCHATON_TOOL_ARGS` and `ESCHATON_CWD` in its environment.

### Skills

Skills are folders with a `SKILL.md` file: YAML frontmatter and instructions. The catalog is in
the system prompt on every turn; the model calls `use_skill` to load the full text. Three skills
are marked always-on and are included in full.

Bundled in this repository under `skills/`:

| Skill | What it adds |
| --- | --- |
| **superpowers** | 15 skills: brainstorming, plans, TDD, debugging, code review, worktrees, subagents |
| **ponytail** | lazy-senior-dev mode: the smallest change that fully solves it |
| **caveman** | terse replies without filler |
| **graphify** | query a codebase as a knowledge graph when `graphify-out/` exists |
| **karpathy-guidelines** | behavioural rules that cut common LLM coding mistakes |
| **mcptoon** | compress MCP tool discovery; schemas on demand, results reversible |

Add your own in `.eschaton/skills/<name>/SKILL.md` or `~/.eschaton/skills/`. Project skills
override bundled ones with the same name. `/skills` lists what loaded.

```markdown
---
name: release
description: Use when cutting a release
---
Run the tests, bump the minor version, write the changelog entry.
```

See [skills/NOTICE.md](skills/NOTICE.md) for sources and licenses.

### Memory

After each run the agent records a one-line episode (prompt, files changed, outcome) in
`~/.eschaton/memory`. The last few episodes for the current directory are added to the system
prompt, so a new session starts with the context of the old ones. This is the behaviour of
claude-mem, implemented locally without a background service.

### Task list and subagents

For multi-step work the agent keeps a task list with `todo_write`; it is printed as a checklist
and `/todos` shows the current one. The `task` tool runs a read-only subagent with its own
context and returns a summary, so exploring ten files does not fill the main conversation.

## How it works

- **Native tool calling.** The agent sends `read_file`, `write_file`, `edit_file`, `run_command`,
  `list_dir` and `search_code` as JSON schemas. Providers that reject `tools` fall back to a
  single JSON block in the reply, so older models still work.
- **Approval flow.** File writes and commands show a diff or the exact command and wait for
  `y` / `n` / `a` (always for the rest of the run).
- **Failover.** Providers are tried in order, free tiers first. A rejected key or a rate limit
  moves to the next one and cools the failing provider down for a minute.
- **Sessions.** Every conversation is stored in `~/.eschaton/sessions` and can be resumed.
- **Undo.** Snapshots are taken before each write or edit, `/undo` restores the last one.

## Providers

| Provider | Variable | Default model |
| --- | --- | --- |
| OpenRouter | `OPENROUTER_API_KEY` | `deepseek/deepseek-chat-v3-0324:free` |
| Google | `GEMINI_API_KEY` | `gemini-2.5-flash` |
| Groq | `GROQ_API_KEY` | `deepseek-r1-distill-llama-70b` |
| DeepSeek | `DEEPSEEK_API_KEY` | `deepseek-chat` |
| Ollama | none | first installed model |
| LM Studio | none | first loaded model |
| Any OpenAI-compatible endpoint | `OPENAI_BASE_URL` + `OPENAI_API_KEY` | `OPENAI_MODEL` |

`ESCHATON_MODEL` overrides the model of the selected provider.

## Browser IDE

There is also a light IDE built on Monaco and xterm, served locally:

```bash
eschaton ide
```

![Eschaton IDE](docs/screenshot.png)

It shares the same agent core and adds a file tree, tabs, a terminal, search, source control and
approval cards. See `eschaton --help`.

## Development

```bash
bun install
bun run dev        # build once, then start the agent
bun test
bun run typecheck
bun run build
```

```
src/agent/coding-agent.ts  tool loop, approvals, undo, compaction
src/llm/providers.ts       providers, tool calling, streaming, failover
src/ui/tui.ts              terminal interface and commands
src/ide/                   browser IDE (server + Monaco/xterm UI)
src/session.ts             session storage
```

## Limitations

- The agent works with the files it reads; it does not index the whole repository. `search_code`
  is a literal string search, not a symbol index.
- No LSP or diagnostics yet.
- The IDE terminal runs one command at a time, no PTY.
- Model quality varies. Small local models often skip reading a file before editing it; the
  prompt asks them not to, but they still do.

## License

Apache License 2.0. See [LICENSE](LICENSE).
