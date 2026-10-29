# Release notes

## 2.0.0

The CLI now talks to providers you choose directly. The quota trick and the custom gateway are
gone, along with the code that generated device identities.

- New provider layer in `src/llm/providers.ts`: DeepSeek, OpenRouter, Groq, any
  OpenAI-compatible endpoint, plus local Ollama and LM Studio detected at startup.
- `eschaton login <provider> <key>` saves a key to `~/.eschaton/config.json`.
- New agent loop in `src/agent/coding-agent.ts` with four modes and a 25 step limit.
- Simpler terminal interface in `src/ui/tui.ts`.
- The package is now unscoped (`eschaton-code`) and builds a single file with esbuild, so
  `npm install -g eschaton-code` works once published.

Removed:

- `src/auth/session-rotator.ts`, which rotated device keys and reported a quota reset without
  contacting a backend.
- `/refresh`, `/auth` and the `opencode`/`freebuff` command aliases.
- The `eschaton-gateway.workers.dev` endpoint, which never resolved.
