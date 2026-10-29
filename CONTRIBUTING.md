# Contributing

## Setup

```bash
git clone https://github.com/Tarikdxd/Eschaton-Code.git
cd Eschaton-Code
bun install
```

## Checks

```bash
bun test
bun run typecheck
bun run build
```

## Layout

- `src/cli.ts` parses commands and decides between the IDE, the terminal interface and the
  small utilities (`login`, `doctor`, `setup`).
- `src/ide/server.ts` is the local HTTP server: static files, workspace API, agent streaming and
  the approval handshake.
- `src/ide/web/` is the browser UI, written in TypeScript against Monaco and xterm. `app.ts` is
  bundled with esbuild, Monaco is copied from `node_modules` at build time.
- `src/llm/providers.ts` builds the provider list, discovers local servers and streams responses.
- `src/agent/coding-agent.ts` holds the system prompt, the ReAct loop, tool dispatch,
  permissions, hooks and the subagent.
- `src/permissions.ts`, `src/hooks.ts`, `src/mcp.ts` and `src/todos.ts` are the policy and
  extension points.
- `src/session.ts` stores conversations under `~/.eschaton/sessions`.

## Conventions

- TypeScript with `strict` enabled, ES modules, no runtime dependencies.
- The server binds to `127.0.0.1` and every file path is resolved through `safePath`; do not add
  an endpoint that reads a path without it.
- Tool calls that write files or run commands must keep going through the approval flow.
- Keep `dist/` in sync by running `bun run build` before committing changes to `src/`.

## Pull requests

Keep each change focused. Describe what changed and which command you used to check it.
