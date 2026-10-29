# Contributing

## Setup

```bash
git clone https://github.com/Tarikdxd/Eschaton-Code.git
cd Eschaton-Code
bun install
```

## Checks

Run these before opening a pull request:

```bash
bun test
bun run typecheck
bun run build
```

## Code layout

- `src/llm/providers.ts` builds the provider list from the environment, discovers local servers
  and streams responses. Add new hosted providers here.
- `src/agent/coding-agent.ts` holds the system prompt, the ReAct loop and the tool
  implementations.
- `src/ui/tui.ts` is the readline interface and the slash commands.
- `src/cli.ts` parses arguments and decides between `setup`, `login` and an interactive session.

The project uses TypeScript with `strict` enabled, ES modules and no runtime dependencies.
Build output goes to `dist/` and is committed so that the published package and a git install
both contain a working binary.

## Pull requests

Keep each pull request focused. Describe what changed and why, and include the command you used
to check it.
