# Eschaton Code

A terminal coding agent. Point it at your own API key or at a model running on your machine,
then describe what you want and it reads, edits and runs code in the current directory.

There is no account, no hosted backend and no quota system. The agent talks directly to the
provider you choose.

## Install

```bash
npm install -g eschaton-code
```

Requires Node.js 20 or newer.

## Connect a model

Either a hosted provider with your own key:

```bash
export DEEPSEEK_API_KEY=sk-...        # DeepSeek platform
export OPENROUTER_API_KEY=sk-or-...   # OpenRouter
export GROQ_API_KEY=gsk_...           # Groq
```

or a local server, which needs no key:

```bash
ollama pull deepseek-r1:7b
```

LM Studio works too: load a model, start the local server, and Eschaton Code finds it on port
1234. Local servers are detected on startup.

To save a key once instead of exporting it:

```bash
eschaton login openrouter sk-or-...
```

That writes `~/.eschaton/config.json` with mode 0600. Environment variables take precedence over
the file.

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

In a session:

| Command | Description |
| --- | --- |
| `/help` | List commands |
| `/mode [name]` | `build`, `plan`, `review` or `fast`; cycles when no name is given |
| `/model [name]` | Show or change the model for the active provider |
| `/providers [n]` | List providers, or switch to one |
| `/clear` | Forget the conversation |
| `/exit` | Leave |

Modes change the instructions the agent works under. `Build` edits and runs code, `Plan` and
`Review` are read-only, `Fast` answers with as few tool calls as possible.

The agent can read and write files, run shell commands, list directories and search code. It
asks for one tool call at a time and feeds the result back into the conversation.

## Providers

| Provider | Key variable | Default model |
| --- | --- | --- |
| DeepSeek | `DEEPSEEK_API_KEY` | `deepseek-chat` |
| OpenRouter | `OPENROUTER_API_KEY` | `deepseek/deepseek-chat-v3-0324:free` |
| Groq | `GROQ_API_KEY` | `deepseek-r1-distill-llama-70b` |
| Ollama | none | first installed model, DeepSeek preferred |
| LM Studio | none | first loaded model, DeepSeek preferred |
| Any OpenAI-compatible endpoint | `OPENAI_API_KEY` + `OPENAI_BASE_URL` | `OPENAI_MODEL` |

Set `ESCHATON_MODEL` to override the model used for a hosted provider. When a provider returns an
error or a rate limit, the next one is tried and the failing provider is skipped for a minute.

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

## Development

The CLI sources are TypeScript and the published bundle is built with esbuild.

```bash
npm install
npm run dev              # bun src/cli.ts
npm test                 # provider and agent tests
npm run build            # writes dist/eschaton.js
```

## Limitations

- Tool calls are parsed from JSON blocks in the model output. Weak models sometimes emit
  malformed JSON, in which case the agent reports the parse failure instead of guessing.
- The agent keeps a single conversation in memory; there is no session persistence yet.
- Complex refactors across many files are better handled by the larger hosted models.

## Relationship to upstream

This repository contains code derived from the Codebuff project; see [NOTICE](NOTICE). Freebuff
sources live under `freebuff/`. Eschaton Code is an independent fork and is not affiliated with
Codebuff, OpenCode or DeepSeek.

## License

Apache License 2.0. See [LICENSE](LICENSE).
