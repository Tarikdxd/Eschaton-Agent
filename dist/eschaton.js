#!/usr/bin/env node

// src/cli.ts
import process3 from "node:process";

// src/config.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
var CONFIG_DIR = path.join(os.homedir(), ".eschaton");
var CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
function loadSettings() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
  }
  return {};
}
function saveSettings(settings) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(settings, null, 2), { encoding: "utf-8", mode: 384 });
}
function maskKey(key) {
  if (!key) return "not set";
  if (key.length <= 10) return "set";
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

// src/llm/providers.ts
var DEFAULTS = {
  deepseek: {
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/chat/completions",
    envKey: "DEEPSEEK_API_KEY",
    model: "deepseek-chat",
    local: false
  },
  openrouter: {
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    envKey: "OPENROUTER_API_KEY",
    model: "deepseek/deepseek-chat-v3-0324:free",
    local: false,
    headers: {
      "HTTP-Referer": "https://github.com/Tarikdxd/Eschaton-Code",
      "X-Title": "Eschaton Code"
    }
  },
  groq: {
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1/chat/completions",
    envKey: "GROQ_API_KEY",
    model: "deepseek-r1-distill-llama-70b",
    local: false
  },
  ollama: {
    label: "Ollama",
    baseUrl: "http://127.0.0.1:11434/v1/chat/completions",
    envKey: "OLLAMA_API_KEY",
    model: "deepseek-r1:7b",
    local: true
  },
  lmstudio: {
    label: "LM Studio",
    baseUrl: "http://127.0.0.1:1234/v1/chat/completions",
    envKey: "LMSTUDIO_API_KEY",
    model: "deepseek-r1-distill-qwen-7b",
    local: true
  },
  custom: {
    label: "Custom endpoint",
    baseUrl: "",
    envKey: "OPENAI_API_KEY",
    model: "deepseek-chat",
    local: false
  }
};
var KIND_ORDER = ["deepseek", "openrouter", "groq", "custom"];
function makeProvider(kind, settings, env) {
  const defaults = DEFAULTS[kind];
  if (kind === "custom") {
    const baseUrl = env.OPENAI_BASE_URL || settings.baseUrl;
    const apiKey2 = env.OPENAI_API_KEY || settings.apiKey;
    if (!baseUrl) return null;
    return {
      id: kind,
      label: defaults.label,
      baseUrl: baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl.replace(/\/$/, "")}/chat/completions`,
      model: env.OPENAI_MODEL || settings.model || defaults.model,
      apiKey: apiKey2,
      local: false,
      cooldownUntil: 0
    };
  }
  const selected = settings.provider === kind;
  const apiKey = selected && settings.apiKey || env[defaults.envKey];
  if (!apiKey) return null;
  return {
    id: kind,
    label: defaults.label,
    baseUrl: selected && settings.baseUrl || defaults.baseUrl,
    model: selected && settings.model || env.ESCHATON_MODEL || defaults.model,
    apiKey,
    headers: defaults.headers,
    local: false,
    cooldownUntil: 0
  };
}
function providersFromSettings(settings = loadSettings(), env = process.env) {
  const providers = [];
  for (const kind of KIND_ORDER) {
    const provider = makeProvider(kind, settings, env);
    if (provider) providers.push(provider);
  }
  if (settings.provider) {
    providers.sort((a, b) => Number(b.id === settings.provider) - Number(a.id === settings.provider));
  }
  return providers;
}
async function listLocalModels(baseUrl, timeoutMs) {
  const modelsUrl = baseUrl.replace(/\/v1\/chat\/completions$/, "/v1/models");
  try {
    const res = await fetch(modelsUrl, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return [];
    const body = await res.json();
    const ids = body.data?.map((m) => m.id).filter(Boolean);
    if (ids && ids.length) return ids;
    return body.models?.map((m) => m.name).filter(Boolean) || [];
  } catch {
    return [];
  }
}
var ProviderPool = class {
  providers;
  activeIndex = 0;
  constructor(providers = providersFromSettings()) {
    this.providers = providers;
  }
  list() {
    return this.providers;
  }
  active() {
    return this.providers[this.activeIndex] ?? this.providers[0];
  }
  use(index) {
    if (index < 0 || index >= this.providers.length) return void 0;
    this.activeIndex = index;
    return this.providers[index];
  }
  setModel(model) {
    const provider = this.active();
    if (provider) provider.model = model;
  }
  /**
   * Probes Ollama and LM Studio and adds whichever of them is running.
   * The first model containing "deepseek" is preferred.
   */
  async detectLocal(timeoutMs = 800) {
    const found = [];
    for (const kind of ["ollama", "lmstudio"]) {
      const defaults = DEFAULTS[kind];
      const models = await listLocalModels(defaults.baseUrl, timeoutMs);
      if (!models.length) continue;
      const model = models.find((m) => m.toLowerCase().includes("deepseek")) ?? models[0];
      found.push({
        id: kind,
        label: defaults.label,
        baseUrl: defaults.baseUrl,
        model,
        local: true,
        cooldownUntil: 0
      });
    }
    this.providers.push(...found);
    return found;
  }
  async generate(options) {
    if (!this.providers.length) {
      throw new Error("No provider configured. Run `eschaton setup` or set an API key.");
    }
    const now = Date.now();
    const order = [
      ...this.providers.slice(this.activeIndex),
      ...this.providers.slice(0, this.activeIndex)
    ].filter((p) => p.cooldownUntil <= now);
    if (!order.length) {
      throw new Error("Every provider is cooling down after a failure. Wait a minute and try again.");
    }
    const failures = [];
    for (const provider of order) {
      try {
        const output = await this.call(provider, options);
        this.activeIndex = this.providers.indexOf(provider);
        provider.cooldownUntil = 0;
        return output;
      } catch (err) {
        const status = err?.status;
        if (status === 401 || status === 403 || status === 429 || status >= 500 && status < 600) {
          provider.cooldownUntil = Date.now() + 6e4;
        }
        failures.push(`${provider.label}: ${explainError(err)}`);
      }
    }
    throw new Error(`All providers failed.
${failures.map((f) => `  - ${f}`).join("\n")}`);
  }
  async call(provider, options) {
    const headers = {
      "Content-Type": "application/json",
      ...provider.headers
    };
    if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;
    const response = await fetch(provider.baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: provider.model,
        messages: options.messages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 4096,
        stream: Boolean(options.onChunk)
      }),
      signal: AbortSignal.timeout(18e4)
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const error = new Error(body.slice(0, 300) || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    if (!options.onChunk || !response.body) {
      const json = await response.json();
      const content = json.choices?.[0]?.message?.content ?? "";
      if (options.onChunk && content) options.onChunk(content);
      return content;
    }
    let output = "";
    let reasoning = "";
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content ?? "";
          const thought = json.choices?.[0]?.delta?.reasoning_content ?? "";
          if (thought) {
            reasoning += thought;
            options.onThinking?.(thought);
          }
          if (delta) {
            output += delta;
            options.onChunk(delta);
          }
        } catch {
        }
      }
    }
    return output || reasoning;
  }
};
function explainError(err) {
  const status = err?.status;
  if (status === 401 || status === 403) return "API key rejected";
  if (status === 404) return "model or endpoint not found";
  if (status === 429) return "rate limited";
  if (status >= 500) return `server error (HTTP ${status})`;
  if (err?.code === "ECONNREFUSED") return "connection refused, is the server running?";
  if (err?.name === "TimeoutError") return "request timed out";
  return err?.message || "unknown error";
}

// src/ui/tui.ts
import readline from "node:readline";
import process2 from "node:process";

// src/agent/coding-agent.ts
import fs2 from "node:fs";
import path2 from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
var execAsync = promisify(exec);
var MODE_RULES = {
  Build: "Implement the change. Read the files you need, edit them, run the build or tests, and report what you changed.",
  Plan: "Do not edit files. Inspect the code as needed and reply with a concrete plan: files to touch, order of work, and risks.",
  Review: "Do not edit files. Read the relevant code and report bugs, unsafe assumptions and missing tests. Quote file paths and line numbers.",
  Fast: "Answer directly with as few tool calls as possible. Prefer a short explanation over a full implementation."
};
function systemPrompt(cwd, mode) {
  return `You are Eschaton Code, a coding agent running in the user's terminal.

Working directory: ${cwd}
Mode: ${mode}. ${MODE_RULES[mode]}

Tools:
1. read_file(filePath, startLine?, endLine?)
2. write_file(filePath, content)
3. edit_file(filePath, target, replacement) \u2014 replaces an exact substring
4. run_command(command)
5. list_dir(dirPath?)
6. search_code(pattern, dirPath?)

To call a tool, reply with a single fenced block:

\`\`\`tool:json
{"tool": "read_file", "args": {"filePath": "src/index.ts", "startLine": 1, "endLine": 40}}
\`\`\`

Call one tool per reply. Paths are relative to the working directory. Read a file before
editing it. When the task is done, reply with the final answer and no tool block.`;
}
var CodingAgent = class {
  pool;
  history = [];
  cwd;
  mode;
  constructor(pool, cwd = process.cwd(), mode = "Build") {
    this.pool = pool;
    this.cwd = cwd;
    this.mode = mode;
    this.resetHistory();
  }
  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.resetHistory();
  }
  getMode() {
    return this.mode;
  }
  resetHistory() {
    this.history = [{ role: "system", content: systemPrompt(this.cwd, this.mode) }];
  }
  async run(userPrompt, callbacks = {}, maxSteps = 25) {
    this.history.push({ role: "user", content: userPrompt });
    for (let step = 0; step < maxSteps; step++) {
      const reply = await this.pool.generate({
        messages: this.history,
        onChunk: callbacks.onToken,
        onThinking: callbacks.onThinking
      });
      this.history.push({ role: "assistant", content: reply });
      const call = this.parseToolCall(reply);
      if (!call) return reply;
      callbacks.onToolStart?.(call);
      const result = await this.executeTool(call);
      callbacks.onToolEnd?.(result);
      this.history.push({
        role: "user",
        content: `Result of ${call.tool}:
${result.output}`
      });
    }
    return `Stopped after ${maxSteps} steps. Ask again to continue from here.`;
  }
  parseToolCall(content) {
    const block = content.match(/```(?:tool:json|tool|json)\s*([\s\S]*?)```/);
    const candidates = block?.[1] ? [block[1]] : [];
    candidates.push(content);
    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate.trim());
        if (parsed?.tool && parsed?.args) return parsed;
      } catch {
      }
    }
    const inline = content.match(/\{"tool"\s*:\s*"[^"]+"[\s\S]*?"args"\s*:\s*\{[\s\S]*?\}\s*\}/);
    if (inline) {
      try {
        const parsed = JSON.parse(inline[0]);
        if (parsed?.tool && parsed?.args) return parsed;
      } catch {
      }
    }
    return null;
  }
  async executeTool(call) {
    const { tool, args } = call;
    try {
      switch (tool) {
        case "read_file": {
          const file = path2.resolve(this.cwd, args.filePath);
          if (!fs2.existsSync(file)) return { tool, isError: true, output: `File not found: ${args.filePath}` };
          const lines = fs2.readFileSync(file, "utf-8").split("\n");
          const start = Math.max(1, Number(args.startLine) || 1);
          const end = Math.min(lines.length, Number(args.endLine) || lines.length);
          const body = lines.slice(start - 1, end).map((line, i) => `${start + i}: ${line}`).join("\n");
          return { tool, isError: false, output: body };
        }
        case "write_file": {
          const file = path2.resolve(this.cwd, args.filePath);
          fs2.mkdirSync(path2.dirname(file), { recursive: true });
          fs2.writeFileSync(file, args.content ?? "", "utf-8");
          const bytes = Buffer.byteLength(args.content ?? "");
          return { tool, isError: false, output: `Wrote ${bytes} bytes to ${args.filePath}` };
        }
        case "edit_file": {
          const file = path2.resolve(this.cwd, args.filePath);
          if (!fs2.existsSync(file)) return { tool, isError: true, output: `File not found: ${args.filePath}` };
          const content = fs2.readFileSync(file, "utf-8");
          const target = args.target ?? "";
          if (!target) return { tool, isError: true, output: "target is empty" };
          if (!content.includes(target)) {
            return {
              tool,
              isError: true,
              output: `Target string not found in ${args.filePath}. Read the file again and copy the exact text.`
            };
          }
          fs2.writeFileSync(file, content.replace(target, args.replacement ?? ""), "utf-8");
          return { tool, isError: false, output: `Edited ${args.filePath}` };
        }
        case "run_command": {
          const command = args.command ?? "";
          if (!command) return { tool, isError: true, output: "command is empty" };
          try {
            const { stdout, stderr } = await execAsync(command, {
              cwd: this.cwd,
              timeout: 12e4,
              maxBuffer: 4 * 1024 * 1024,
              shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh"
            });
            const output = [stdout, stderr].filter(Boolean).join("\n").trim();
            return { tool, isError: false, output: output || "(no output)" };
          } catch (err) {
            return { tool, isError: true, output: `${err.message}
${err.stderr ?? ""}`.trim() };
          }
        }
        case "list_dir": {
          const dir = path2.resolve(this.cwd, args.dirPath || ".");
          if (!fs2.existsSync(dir)) return { tool, isError: true, output: `Directory not found: ${args.dirPath || "."}` };
          const entries = fs2.readdirSync(dir, { withFileTypes: true }).map((entry) => `${entry.isDirectory() ? "dir  " : "file "} ${entry.name}`).join("\n");
          return { tool, isError: false, output: entries || "(empty)" };
        }
        case "search_code": {
          const pattern = args.pattern ?? "";
          if (!pattern) return { tool, isError: true, output: "pattern is empty" };
          const root = path2.resolve(this.cwd, args.dirPath || ".");
          const hits = [];
          const skip = /* @__PURE__ */ new Set(["node_modules", ".git", "dist", "build", ".next"]);
          const walk = (dir) => {
            if (hits.length >= 50) return;
            for (const entry of fs2.readdirSync(dir, { withFileTypes: true })) {
              if (hits.length >= 50) return;
              if (skip.has(entry.name)) continue;
              const full = path2.join(dir, entry.name);
              if (entry.isDirectory()) {
                walk(full);
                continue;
              }
              try {
                if (fs2.statSync(full).size > 512 * 1024) continue;
                if (fs2.readFileSync(full, "utf-8").includes(pattern)) {
                  hits.push(path2.relative(root, full));
                }
              } catch {
              }
            }
          };
          walk(root);
          return { tool, isError: false, output: hits.join("\n") || "No matches." };
        }
        default:
          return { tool, isError: true, output: `Unknown tool: ${tool}` };
      }
    } catch (err) {
      return { tool, isError: true, output: `${tool} failed: ${err.message}` };
    }
  }
};

// src/ui/tui.ts
var MODES = ["Build", "Plan", "Review", "Fast"];
function color(code) {
  if (!process2.stdout.isTTY || process2.env.NO_COLOR) return (text) => text;
  return (text) => `\x1B[${code}m${text}\x1B[0m`;
}
var dim = color("38;5;244");
var bold = color("1");
var blue = color("38;5;75");
var red = color("31");
var TerminalUI = class {
  rl = null;
  agent;
  pool;
  options;
  busy = false;
  constructor(pool, options) {
    this.pool = pool;
    this.options = options;
    this.agent = new CodingAgent(pool, options.cwd);
  }
  async start() {
    this.printBanner();
    this.rl = readline.createInterface({
      input: process2.stdin,
      output: process2.stdout,
      terminal: true,
      historySize: 200
    });
    this.rl.setPrompt(this.prompt());
    this.rl.prompt();
    this.rl.on("line", async (line) => {
      const input = line.trim();
      if (this.busy) {
        this.rl?.prompt();
        return;
      }
      if (!input) {
        this.rl?.prompt();
        return;
      }
      this.busy = true;
      try {
        await this.handle(input);
      } catch (err) {
        process2.stdout.write(`
${red("error")} ${err?.message ?? err}
`);
      } finally {
        this.busy = false;
        this.rl?.setPrompt(this.prompt());
        this.rl?.prompt();
      }
    });
    this.rl.on("close", () => {
      process2.stdout.write("\n");
      process2.exit(0);
    });
    await new Promise((resolve) => this.rl?.on("close", resolve));
  }
  printBanner() {
    const provider = this.pool.active();
    const lines = [
      "",
      `${bold("Eschaton Code")} ${dim(this.options.version)}`,
      `${dim("directory")} ${this.options.cwd}`,
      provider ? `${dim("provider ")} ${provider.label} ${dim("\xB7")} ${provider.model}${provider.apiKey ? dim(` \xB7 key ${maskKey(provider.apiKey)}`) : dim(" \xB7 local")}` : `${dim("provider ")} ${red("none configured")}`,
      `${dim("commands")} /help  /mode  /model  /providers  /clear  /exit`,
      ""
    ];
    process2.stdout.write(lines.join("\n"));
  }
  prompt() {
    return `${blue("\u203A")} `;
  }
  async handle(input) {
    if (!input.startsWith("/")) {
      await this.runTask(input);
      return;
    }
    const [command, ...rest] = input.slice(1).split(/\s+/);
    const argument = rest.join(" ").trim();
    switch (command) {
      case "help":
        this.printHelp();
        return;
      case "exit":
      case "quit":
        this.rl?.close();
        return;
      case "clear":
        this.agent.resetHistory();
        process2.stdout.write(`${dim("history cleared")}
`);
        return;
      case "mode":
        this.setMode(argument);
        return;
      case "model":
        this.setModel(argument);
        return;
      case "provider":
      case "providers":
        this.showProviders(argument);
        return;
      default:
        process2.stdout.write(`${dim(`unknown command /${command}, try /help`)}
`);
    }
  }
  async runTask(input) {
    process2.stdout.write("\n");
    let streamedAnything = false;
    try {
      await this.agent.run(input, {
        onToken: (token) => {
          streamedAnything = true;
          process2.stdout.write(token);
        },
        onToolStart: (call) => {
          if (streamedAnything) process2.stdout.write("\n");
          streamedAnything = false;
          process2.stdout.write(dim(`  ${call.tool} ${describeArgs(call)}
`));
        },
        onToolEnd: (result) => {
          if (result.isError) process2.stdout.write(red(`  ${firstLine(result.output)}
`));
        }
      });
    } catch (err) {
      if (streamedAnything) process2.stdout.write("\n");
      process2.stdout.write(`${red("request failed")}
${err?.message ?? err}
`);
    }
    process2.stdout.write("\n");
  }
  setMode(argument) {
    const wanted = argument.toLowerCase();
    if (!wanted) {
      const next = MODES[(MODES.indexOf(this.agent.getMode()) + 1) % MODES.length];
      this.agent.setMode(next);
      process2.stdout.write(`${dim("mode")} ${next}
`);
      return;
    }
    const match = MODES.find((mode) => mode.toLowerCase() === wanted);
    if (!match) {
      process2.stdout.write(`${dim("modes: build, plan, review, fast")}
`);
      return;
    }
    this.agent.setMode(match);
    process2.stdout.write(`${dim("mode")} ${match}
`);
  }
  setModel(argument) {
    if (!argument) {
      const provider = this.pool.active();
      process2.stdout.write(`${dim("model")} ${provider?.model ?? "none"}
`);
      return;
    }
    this.pool.setModel(argument);
    process2.stdout.write(`${dim("model")} ${argument}
`);
  }
  showProviders(argument) {
    if (argument) {
      const index = Number(argument);
      const provider = this.pool.use(index - 1);
      process2.stdout.write(
        provider ? `${dim("using")} ${provider.label} \xB7 ${provider.model}
` : `${dim("invalid provider number")}
`
      );
      return;
    }
    const active = this.pool.active();
    const rows = this.pool.list().map((provider, i) => {
      const marker = provider === active ? "*" : " ";
      const key = provider.apiKey ? maskKey(provider.apiKey) : "local";
      return `${marker} ${i + 1}. ${provider.label} \xB7 ${provider.model} \xB7 ${key}`;
    });
    process2.stdout.write(`${rows.join("\n")}
`);
  }
  printHelp() {
    const lines = [
      "",
      "  /help              this list",
      "  /mode [name]       build, plan, review, fast (cycles when empty)",
      "  /model [name]      show or set the model for the active provider",
      "  /providers [n]     list providers, or switch to number n",
      "  /clear             forget the conversation",
      "  /exit              leave",
      "",
      "  Anything else is sent to the agent, which can read and edit files and run commands.",
      ""
    ];
    process2.stdout.write(lines.join("\n"));
  }
};
function describeArgs(call) {
  const value = call.args.filePath ?? call.args.command ?? call.args.pattern ?? call.args.dirPath ?? "";
  return String(value).slice(0, 80);
}
function firstLine(text) {
  return text.split("\n")[0]?.slice(0, 120) ?? "";
}

// src/cli.ts
var VERSION = "2.1.0";
var SETUP = `
Eschaton Code needs a model. Pick one:

  Local, free and private
    Ollama      ollama pull deepseek-r1:7b      https://ollama.com
    LM Studio   load a DeepSeek model and start the server   https://lmstudio.ai

  Hosted, with your own key
    export DEEPSEEK_API_KEY=...
    export OPENROUTER_API_KEY=...
    export GROQ_API_KEY=...
    export OPENAI_BASE_URL=... OPENAI_API_KEY=...   # any OpenAI-compatible endpoint

  Save a key once instead of exporting it:
    eschaton login openrouter sk-or-...

The settings file is ${CONFIG_FILE}
`;
function printHelp() {
  process3.stdout.write(
    `
Usage: eschaton [options] [command]

Commands:
  setup                     show how to connect a model
  login <provider> <key>    save a key to the settings file
                            providers: deepseek, openrouter, groq, custom

Options:
  -m, --model <name>        override the model for this session
  -h, --help                show this help
  -v, --version             print the version
`
  );
}
function runLogin(args) {
  const [provider, key, model] = args;
  const allowed = ["deepseek", "openrouter", "groq", "custom"];
  if (!provider || !key) {
    process3.stderr.write("usage: eschaton login <provider> <key> [model]\n");
    return 1;
  }
  if (!allowed.includes(provider)) {
    process3.stderr.write(`unknown provider "${provider}". expected one of: ${allowed.join(", ")}
`);
    return 1;
  }
  const settings = loadSettings();
  saveSettings({ ...settings, provider, apiKey: key, ...model ? { model } : {} });
  process3.stdout.write(`saved ${provider} key to ${CONFIG_FILE}
`);
  return 0;
}
async function main() {
  const argv = process3.argv.slice(2);
  if (argv.includes("-h") || argv.includes("--help") || argv[0] === "help") {
    printHelp();
    return 0;
  }
  if (argv.includes("-v") || argv.includes("--version") || argv[0] === "version") {
    process3.stdout.write(`eschaton ${VERSION}
`);
    return 0;
  }
  if (argv[0] === "login") return runLogin(argv.slice(1));
  if (argv[0] === "setup") {
    process3.stdout.write(SETUP);
    return 0;
  }
  const modelFlag = argv.indexOf("-m") >= 0 ? argv.indexOf("-m") : argv.indexOf("--model");
  const modelOverride = modelFlag >= 0 ? argv[modelFlag + 1] : void 0;
  const pool = new ProviderPool(providersFromSettings());
  if (modelOverride) pool.setModel(modelOverride);
  await pool.detectLocal();
  if (!pool.list().length) {
    process3.stdout.write(SETUP);
    return 1;
  }
  const ui = new TerminalUI(pool, { version: VERSION, cwd: process3.cwd() });
  await ui.start();
  return 0;
}
main().then((code) => {
  if (code !== 0) process3.exitCode = code;
}).catch((err) => {
  process3.stderr.write(`eschaton: ${err?.message ?? err}
`);
  process3.exitCode = 1;
});
export {
  VERSION
};
