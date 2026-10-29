# Eschaton Code

A terminal coding agent. Point it at your own API key or at a model running on your machine,
then describe what you want and it reads, edits and runs code in the current directory.

No account, no hosted backend, no quota system. The agent talks directly to the provider you
choose.

## Install

```bash
npm install -g eschaton-code
```

Requires Node.js 20 or newer.

## Connect a model

A hosted provider with your own key:

```bash
export DEEPSEEK_API_KEY=sk-...        # DeepSeek platform
export OPENROUTER_API_KEY=sk-or-...   # OpenRouter
export GROQ_API_KEY=gsk_...           # Groq
```

Or a local server, which needs no key:

```bash
ollama pull deepseek-r1:7b
```

LM Studio works too: load a model, start the local server, and Eschaton Code finds it on port
1234. Local servers are detected on startup.

To save a key once instead of exporting it:

```bash
eschaton login openrouter sk-or-...
```

That writes `~/.eschaton/config.json` with mode 0600. Environment variables take precedence.

## Usage

```bash
cd ~/my-project
eschaton
```

```
› explain how the auth middleware works
› add a test for the token refresh path
› why does the build fail on Windows
```

| Command | Description |
| --- | --- |
| `/help` | List commands |
| `/mode [name]` | `build`, `plan`, `review` or `fast`; cycles when no name is given |
| `/model [name]` | Show or change the model for the active provider |
| `/providers [n]` | List providers, or switch to one |
| `/clear` | Forget the conversation |
| `/exit` | Leave |

`Build` edits and runs code. `Plan` and `Review` are read-only. `Fast` answers with as few tool
calls as possible.

The agent can read and write files, run shell commands, list directories and search code. It
requests one tool call at a time and feeds the result back into the conversation.

## Providers

| Provider | Key variable | Default model |
| --- | --- | --- |
| DeepSeek | `DEEPSEEK_API_KEY` | `deepseek-chat` |
| OpenRouter | `OPENROUTER_API_KEY` | `deepseek/deepseek-chat-v3-0324:free` |
| Groq | `GROQ_API_KEY` | `deepseek-r1-distill-llama-70b` |
| Ollama | none | first installed model, DeepSeek preferred |
| LM Studio | none | first loaded model, DeepSeek preferred |
| Any OpenAI-compatible endpoint | `OPENAI_API_KEY` + `OPENAI_BASE_URL` | `OPENAI_MODEL` |

Set `ESCHATON_MODEL` to override the model of a hosted provider. When a provider fails or rate
limits, the next one is tried and the failing provider is skipped for a minute.

Free tiers have their own limits. If a provider returns HTTP 429, that is the provider's quota,
not something this tool can reset.

## Configuration

| Variable | Purpose |
| --- | --- |
| `DEEPSEEK_API_KEY` | DeepSeek platform key |
| `OPENROUTER_API_KEY` | OpenRouter key |
| `GROQ_API_KEY` | Groq key |
| `OPENAI_BASE_URL` | Base URL of any OpenAI-compatible endpoint |
| `OPENAI_API_KEY` | Key for that endpoint |
| `OPENAI_MODEL` | Model name for that endpoint |
| `ESCHATON_MODEL` | Overrides the model of the selected provider |
| `NO_COLOR` | Disables ANSI colours |

Local endpoints probed at startup:

- Ollama: `http://127.0.0.1:11434/v1`
- LM Studio: `http://127.0.0.1:1234/v1`

## How it is built

```
src/cli.ts              argument parsing, commands, startup
src/config.ts           ~/.eschaton/config.json
src/llm/providers.ts    provider list, local discovery, streaming, failover
src/agent/coding-agent.ts  ReAct loop and tools
src/ui/tui.ts           readline interface
tests/providers.test.ts provider and agent tests
scripts/build.mjs       esbuild bundle to dist/eschaton.js
```

The published package is a single bundled file with no runtime dependencies.

## Development

```bash
bun install
bun run dev        # run from source
bun test
bun run typecheck
bun run build
```

## Limitations

- Tool calls are parsed from JSON blocks in the model output. Weak models sometimes emit
  malformed JSON; the agent then reports the parse failure instead of guessing.
- One conversation in memory, no session persistence yet.
- Large refactors across many files are better handled by bigger hosted models.

## License

Apache License 2.0. See [LICENSE](LICENSE).
