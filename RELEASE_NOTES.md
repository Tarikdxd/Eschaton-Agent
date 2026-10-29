# Release notes

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
