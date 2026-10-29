# Release notes

## 2.1.0

Repository cleanup. The package itself behaves the same as 2.0.1.

- Removed the Codebuff and Freebuff sources that the CLI never imported. The repository now
  contains only the CLI, its tests and the build script.
- Removed the leftover workspace configuration, the SDK build scripts and the issue templates
  that pointed at another project.
- Added `typecheck` and a minimal `tsconfig.json` with `strict` enabled.
- `dist/eschaton.js` is committed so the published package and a git install both ship a working
  binary.

## 2.0.1

- Published the package as `eschaton-code` with a working `eschaton` command.
- Fixed the repository URL format npm expected.

## 2.0.0

- New provider layer: DeepSeek, OpenRouter, Groq, any OpenAI-compatible endpoint, plus local
  Ollama and LM Studio detected at startup.
- `eschaton login <provider> <key>` saves a key to `~/.eschaton/config.json`.
- New agent loop with four modes and a 25 step limit.
- Simpler terminal interface.

Removed: the device identity rotation, the `/refresh` quota claim, the custom gateway, and the
`opencode`/`freebuff` command aliases.
