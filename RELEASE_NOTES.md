# Release notes

## 3.6.0

- **First-run setup inside the agent.** `eschaton` now opens a wizard when no model is
  configured: provider, key with hidden input, model, key check, saved to
  `~/.eschaton/config.json`, then straight into the session.
- **`/setup` (or `/config`) in a session.** Change provider, key or model without leaving or
  restarting; the live pool and the active model are updated in place.
- Key verification makes a one-token completion instead of trusting `/models`, which is public on
  some providers.

## 3.5.0

- **mcptoon gateway.** When the `mcptoon` CLI is installed it is attached automatically as an MCP
  server, so upstream tool schemas stay out of the context window and tools are discovered on
  demand. Turn it off with `ESCHATON_MCPTOON=0`.
- **mcptoon skill** bundled under `skills/mcptoon`, catalogued on every turn like the others.

## 3.4.0

- **Bundled skills.** superpowers (15 skills), ponytail, caveman, graphify and
  karpathy-guidelines ship in `skills/`. The catalog goes into the system prompt on every turn;
  always-on skills are included in full; `use_skill` loads the rest.
- **Project and user skills.** `.eschaton/skills/<name>/SKILL.md` and `~/.eschaton/skills`
  override bundled skills with the same name. `/skills` lists what loaded.
- **Episodic memory.** Each run records prompt, changed files and outcome under
  `~/.eschaton/memory`; recent entries for the directory are injected into the next session.
  This mirrors claude-mem without a background service.
- Skill frontmatter accepts YAML block descriptions.

## 3.3.0

The pieces that make a terminal agent feel complete.

- **MCP servers.** Connect servers from `~/.eschaton/mcp.json` or `.eschaton/mcp.json`; their
  tools are exposed to the model as `mcp__<server>__<tool>`.
- **Permission rules.** `permissions.json` with `allow` and `deny` patterns. Answering `a` saves
  a narrow rule for the current command or folder.
- **Hooks.** `.eschaton/hooks.json` with `preTool` and `postTool` commands; a failing `preTool`
  blocks the call.
- **Task list.** `todo_write` keeps a checklist for multi-step work, rendered in the terminal and
  available through `/todos`.
- **Subagents.** The `task` tool runs a read-only agent with its own context and returns a
  summary, keeping the main conversation small.
- JSON configs are read with a BOM-tolerant parser, so files saved by Windows editors work.

## 3.2.0

Compatibility features borrowed from the way other terminal agents work. No code from them is
used; these are independent implementations of the same ideas.

- **Project memory.** `ESCHATON.md`, `AGENTS.md` or `CLAUDE.md` is loaded into the system prompt.
- **Custom commands.** Markdown files in `.eschaton/commands` become slash commands with
  `$ARGUMENTS` substitution. `/commands` lists them.
- **`@file`** attaches a file to the prompt. **`!command`** runs a shell command directly.
- **Print mode.** `eschaton -p "<prompt>"` runs one prompt and exits; `--yes` allows edits and
  commands, otherwise the run is read-only.

## 3.1.0

The terminal agent is the main product again, and it now uses native tool calling.

- **Tool calling.** Tools are sent as JSON schemas; the model returns `tool_calls` instead of a
  JSON block in prose. Providers that reject the parameter fall back to the old text parsing.
- **Undo.** A snapshot is taken before each write or edit, `/undo` restores the last one.
- **New commands.** `/init`, `/diff`, `/compact`, `/cost`, `/sessions`, `/resume`.
- **More free providers.** OpenRouter, Google and Groq free tiers are tried before paid ones.
  `eschaton login gemini ...` is new.
- **`eschaton` starts the terminal agent again.** `eschaton ide` opens the browser IDE.

## 3.0.0

Eschaton became an IDE: `eschaton` started a local server with Monaco, a file tree, tabs, a
terminal and an assistant panel with diff previews and approvals.

## 2.1.0

Repository cleanup. Behaviour unchanged.

## 2.0.x

- Published as `eschaton-code` with a working `eschaton` command.
- Provider layer for DeepSeek, OpenRouter, Groq, any OpenAI-compatible endpoint, Ollama and
  LM Studio.
- Removed the device identity rotation, the `/refresh` quota claim and the fake gateway.
