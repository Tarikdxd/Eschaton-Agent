# Eschaton Code

A terminal coding agent for people who want to start working without an API key.

Eschaton Code is built on [Codebuff](https://github.com/CodebuffAI/codebuff) and bundles the
Freebuff CLI. On top of that it adds a terminal interface, a router for DeepSeek models, and a
set of file and shell tools the agent can call while it works in your project directory.

**Status: early.** The interface and the tool loop run. The provider router is incomplete and
the project is not published to npm yet. See [Current limitations](#current-limitations) before
you install it.

## What works

- `eschaton` starts a session in the current directory.
- Streaming responses with tool-call output.
- File tools: read, write, edit, list, search.
- Shell tool for builds, tests and git commands.
- Four modes, cycled with `Tab`: Build, Plan, Review, Fast.

## Current limitations

- **No published package.** `npm install -g eschaton-code` does not work yet. Use the source
  install below.
- **The provider router is unfinished.** `/refresh` does not renew a quota. It writes a new
  local device key and reports success without contacting a live backend, so treat it as a
  no-op.
- **The default gateway does not exist.** `eschaton-gateway.workers.dev` does not resolve, so
  the first provider in the pool always falls through to the next one.
- **The OpenRouter and SiliconFlow entries need your own keys.** The built-in placeholder
  values are rejected by both services.

## Requirements

- Node.js 22.18 or newer (the CLI runs the TypeScript sources directly)
- git

## Install from source

```bash
git clone https://github.com/Tarikdxd/Eschaton-Code.git
cd Eschaton-Code
npm install
node bin/eschaton.js
```

To get an `eschaton` command on your PATH:

```bash
npm install -g .
```

## Usage

```bash
cd ~/my-project
eschaton
```

Type a request and press Enter. `Tab` switches mode. `/exit` or `Ctrl+C` leaves the session.

## Configuration

| Variable | Purpose |
| --- | --- |
| `ESCHATON_API_URL` | Base URL of your own OpenAI-compatible gateway |
| `OPENROUTER_API_KEY` | Key for the OpenRouter free-tier DeepSeek models |
| `SILICONFLOW_API_KEY` | Key for SiliconFlow's serverless DeepSeek models |

With no variables set, the agent tries the providers in the order defined in
`src/llm/deepseek-pool.ts` and skips the ones that fail.

## Project layout

```
bin/        CLI entry points
src/ui/     terminal interface
src/llm/    provider pool and routing
src/auth/   device identity helpers
agents/     agent definitions and evaluation harnesses
sdk/        Codebuff SDK
freebuff/   Freebuff CLI sources
```

## Development

The workspace uses Bun for builds and tests:

```bash
bun install
bun test
bun run build
```

## Relationship to upstream

This repository contains code derived from the Codebuff project; see [NOTICE](NOTICE). Freebuff
sources live under `freebuff/`. Eschaton Code is an independent fork and is not affiliated with
Codebuff, OpenCode or DeepSeek.

## Roadmap

- Publish the CLI as an unscoped npm package so `npm install -g eschaton-code` works.
- Replace the placeholder gateway with a real endpoint that serves free DeepSeek Flash models.
- Remove the `/refresh` path or implement it against an API that actually supports quota resets.

## License

Apache License 2.0. See [LICENSE](LICENSE).
