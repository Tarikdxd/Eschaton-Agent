# Release notes

## 3.0.0

Eschaton is now an IDE instead of a terminal prompt.

- `eschaton` starts a local server and opens an editor in the browser: Monaco, file tree, tabs,
  terminal and assistant panel. `eschaton chat` keeps the old terminal interface.
- The assistant streams into the chat panel, shows a diff before writing a file and asks for
  approval before an edit or a command. Plan and Review modes block writes entirely.
- Conversations are saved under `~/.eschaton/sessions` and listed in the Sessions view.
- `eschaton doctor` reports the configured providers, saved key and local servers.
- New flags: `--port`, `--no-open`, `--mode`, `--continue` (terminal interface).
- The package now ships the built UI in `dist/public`, including Monaco and xterm.

## 2.1.0

Repository cleanup. Behavior unchanged.

- Removed the Codebuff and Freebuff sources the CLI never imported.
- Added `typecheck` and a strict `tsconfig.json`.
- Committed `dist/eschaton.js` so git installs work.

## 2.0.1

- Published as `eschaton-code` with a working `eschaton` command.
- Fixed the repository URL format npm expected.

## 2.0.0

- Provider layer for DeepSeek, OpenRouter, Groq, any OpenAI-compatible endpoint, Ollama and
  LM Studio.
- `eschaton login` saves a key to `~/.eschaton/config.json`.
- New agent loop with four modes.
- Removed the device identity rotation, the `/refresh` quota claim, the custom gateway and the
  `opencode`/`freebuff` command aliases.
