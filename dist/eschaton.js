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
var HOSTED = ["deepseek", "openrouter", "groq", "custom"];
var LOCAL_KINDS = ["ollama", "lmstudio"];
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
  for (const kind of HOSTED) {
    const provider = makeProvider(kind, settings, env);
    if (provider) providers.push(provider);
  }
  if (settings.provider) {
    providers.sort((a, b) => Number(b.id === settings.provider) - Number(a.id === settings.provider));
  }
  return providers;
}
async function listLocalModels(baseUrl, timeoutMs = 800) {
  const modelsUrl = baseUrl.replace(/\/v1\/chat\/completions$/, "/v1/models");
  try {
    const res = await fetch(modelsUrl, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return [];
    const body = await res.json();
    const ids = body.data?.map((m) => m.id).filter(Boolean);
    if (ids?.length) return ids;
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
  useById(id) {
    const index = this.providers.findIndex((provider) => provider.id === id);
    return index >= 0 ? this.use(index) : void 0;
  }
  setModel(model) {
    const provider = this.active();
    if (provider) provider.model = model;
  }
  /** Probes Ollama and LM Studio and adds whichever of them is running. */
  async detectLocal(timeoutMs = 800) {
    const found = [];
    for (const kind of LOCAL_KINDS) {
      const defaults = DEFAULTS[kind];
      const models = await listLocalModels(defaults.baseUrl, timeoutMs);
      if (!models.length) continue;
      const model = models.find((name) => name.toLowerCase().includes("deepseek")) ?? models[0];
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
      throw new Error("No provider configured. Run `eschaton setup`.");
    }
    const now = Date.now();
    const order = [
      ...this.providers.slice(this.activeIndex),
      ...this.providers.slice(0, this.activeIndex)
    ].filter((provider) => provider.cooldownUntil <= now);
    if (!order.length) {
      throw new Error("Every provider is cooling down after a failure. Wait a minute and try again.");
    }
    const failures = [];
    for (const provider of order) {
      try {
        const result = await this.call(provider, options);
        this.activeIndex = this.providers.indexOf(provider);
        provider.cooldownUntil = 0;
        return { ...result, provider: provider.label };
      } catch (err) {
        if (isAbort(err)) throw new Error("cancelled");
        const status = err?.status;
        if (status === 401 || status === 403 || status === 429 || status >= 500 && status < 600) {
          provider.cooldownUntil = Date.now() + 6e4;
        }
        failures.push(`${provider.label}: ${explainError(err)}`);
      }
    }
    throw new Error(`All providers failed.
${failures.map((line) => `  - ${line}`).join("\n")}`);
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
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 4096,
        stream: Boolean(options.onChunk),
        ...options.onChunk ? { stream_options: { include_usage: true } } : {}
      }),
      signal: linkSignals(options.signal, 18e4)
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const error = new Error(body.slice(0, 300) || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    if (!options.onChunk || !response.body) {
      const json = await response.json();
      const text2 = json.choices?.[0]?.message?.content ?? "";
      if (options.onChunk && text2) options.onChunk(text2);
      return { text: text2, usage: readUsage(json.usage) };
    }
    let text = "";
    let reasoning = "";
    let usage;
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
          usage = readUsage(json.usage) ?? usage;
          const delta = json.choices?.[0]?.delta?.content ?? "";
          const thought = json.choices?.[0]?.delta?.reasoning_content ?? "";
          if (thought) {
            reasoning += thought;
            options.onThinking?.(thought);
          }
          if (delta) {
            text += delta;
            options.onChunk(delta);
          }
        } catch {
        }
      }
    }
    return { text: text || reasoning, usage };
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
function readUsage(raw) {
  if (!raw) return void 0;
  return {
    promptTokens: raw.prompt_tokens ?? raw.promptTokens,
    completionTokens: raw.completion_tokens ?? raw.completionTokens
  };
}
function isAbort(err) {
  return err?.name === "AbortError" || err?.name === "TimeoutError";
}
function linkSignals(signal, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
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
var MODES = ["Build", "Plan", "Review", "Fast"];
var READ_ONLY_MODES = ["Plan", "Review"];
var MODE_RULES = {
  Build: "Implement the change: read the files you need, edit them, run the build or tests, then report what changed.",
  Plan: "Read-only. Do not edit files and do not run commands. Inspect the code and reply with a concrete plan: files to touch, order of work, risks.",
  Review: "Read-only. Do not edit files and do not run commands. Read the relevant code and report bugs, unsafe assumptions and missing tests, quoting paths and line numbers.",
  Fast: "Answer directly with as few tool calls as possible. A short explanation beats a full implementation."
};
function systemPrompt(cwd, mode) {
  return `You are Eschaton Code, a coding agent working in the user's terminal.

Working directory: ${cwd}
Platform: ${process.platform}
Mode: ${mode}. ${MODE_RULES[mode]}

Tools:
1. read_file(filePath, startLine?, endLine?)
2. write_file(filePath, content)
3. edit_file(filePath, target, replacement) \u2014 replaces one exact substring
4. run_command(command)
5. list_dir(dirPath?)
6. search_code(pattern, dirPath?)

Reply with exactly one fenced block per tool call:

\`\`\`tool:json
{"tool": "read_file", "args": {"filePath": "src/cli.ts", "startLine": 1, "endLine": 40}}
\`\`\`

Rules:
- Read a file before editing it. Copy the target text exactly, including indentation.
- Paths are relative to the working directory.
- Run the project's own test or build command when you change code, if one exists.
- Never invent file contents. If something is unknown, read it.
- When the task is done, answer normally without a tool block.`;
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
  getMode() {
    return this.mode;
  }
  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.resetHistory();
  }
  getHistory() {
    return this.history;
  }
  setHistory(messages) {
    this.history = messages.length ? [...messages] : [];
    if (!this.history.length || this.history[0]?.role !== "system") this.resetHistory();
  }
  resetHistory() {
    this.history = [{ role: "system", content: systemPrompt(this.cwd, this.mode) }];
  }
  async run(prompt, callbacks = {}, options = {}) {
    this.history.push({ role: "user", content: prompt });
    const usage = { promptTokens: 0, completionTokens: 0 };
    let provider;
    const maxSteps = options.maxSteps ?? 25;
    for (let step = 1; step <= maxSteps; step++) {
      let buffered = "";
      let muted = false;
      const forward = (chunk) => {
        if (!callbacks.onToken || muted) return;
        buffered += chunk;
        const marker = buffered.indexOf("```tool");
        if (marker >= 0) {
          if (marker > 0) callbacks.onToken(buffered.slice(0, marker));
          buffered = "";
          muted = true;
          return;
        }
        if (buffered.length > 8) {
          callbacks.onToken(buffered.slice(0, -8));
          buffered = buffered.slice(-8);
        }
      };
      const response = await this.pool.generate({
        messages: this.history,
        signal: options.signal,
        onChunk: forward,
        onThinking: callbacks.onThinking
      });
      if (!muted && buffered) callbacks.onToken?.(buffered);
      provider = response.provider;
      accumulate(usage, response.usage);
      this.history.push({ role: "assistant", content: response.text });
      const call = this.parseToolCall(response.text);
      if (!call) {
        return { text: response.text, steps: step, usage, provider };
      }
      const result = await this.execute(call, callbacks, options);
      callbacks.onToolEnd?.(result);
      this.history.push({
        role: "user",
        content: `Result of ${call.tool}:
${result.output}`
      });
      this.compactHistory();
    }
    return {
      text: `Stopped after ${maxSteps} steps. Ask again to continue from here.`,
      steps: maxSteps,
      usage,
      provider
    };
  }
  async execute(call, callbacks, options) {
    const { tool, args } = call;
    if (READ_ONLY_MODES.includes(this.mode) && ["write_file", "edit_file", "run_command"].includes(tool)) {
      return {
        tool,
        isError: true,
        output: `Blocked: ${this.mode} mode is read-only. Switch to Build to change files or run commands.`
      };
    }
    const preview = this.describe(tool, args);
    callbacks.onToolStart?.(call, preview);
    if (preview.needsApproval && options.approve) {
      const allowed = await options.approve(call, preview);
      if (!allowed) {
        return { tool, isError: true, output: "Denied by the user. Do not retry this call; ask what to do instead.", preview };
      }
    }
    try {
      const output = await this.runTool(tool, args);
      return { tool, isError: false, output, preview };
    } catch (err) {
      return { tool, isError: true, output: `${tool} failed: ${err.message}`, preview };
    }
  }
  describe(tool, args) {
    if (tool === "write_file") {
      const target = path2.resolve(this.cwd, args.filePath ?? "");
      const before = fs2.existsSync(target) ? readText(target) : void 0;
      return { kind: "write", path: args.filePath, before, after: String(args.content ?? ""), needsApproval: true };
    }
    if (tool === "edit_file") {
      const target = path2.resolve(this.cwd, args.filePath ?? "");
      const before = fs2.existsSync(target) ? readText(target) : void 0;
      const target_ = String(args.target ?? "");
      const after = before?.includes(target_) ? before.replace(target_, String(args.replacement ?? "")) : void 0;
      return { kind: "edit", path: args.filePath, before, after, needsApproval: true };
    }
    if (tool === "run_command") {
      return { kind: "command", command: String(args.command ?? ""), needsApproval: true };
    }
    if (tool === "read_file") return { kind: "read", path: args.filePath, needsApproval: false };
    if (tool === "list_dir") return { kind: "list", path: args.dirPath ?? ".", needsApproval: false };
    return { kind: "search", detail: String(args.pattern ?? ""), needsApproval: false };
  }
  async runTool(tool, args) {
    switch (tool) {
      case "read_file": {
        const file = path2.resolve(this.cwd, args.filePath);
        if (!fs2.existsSync(file)) return `File not found: ${args.filePath}`;
        const lines = readText(file).split("\n");
        const start = Math.max(1, Number(args.startLine) || 1);
        const end = Math.min(lines.length, Number(args.endLine) || lines.length);
        return lines.slice(start - 1, end).map((line, i) => `${start + i}: ${line}`).join("\n");
      }
      case "write_file": {
        const file = path2.resolve(this.cwd, args.filePath);
        fs2.mkdirSync(path2.dirname(file), { recursive: true });
        fs2.writeFileSync(file, args.content ?? "", "utf-8");
        return `Wrote ${Buffer.byteLength(args.content ?? "")} bytes to ${args.filePath}`;
      }
      case "edit_file": {
        const file = path2.resolve(this.cwd, args.filePath);
        if (!fs2.existsSync(file)) return `File not found: ${args.filePath}`;
        const content = readText(file);
        const target = args.target ?? "";
        if (!target) return "target is empty";
        if (!content.includes(target)) {
          return `Target string not found in ${args.filePath}. Read the file again and copy the exact text.`;
        }
        fs2.writeFileSync(file, content.replace(target, args.replacement ?? ""), "utf-8");
        return `Edited ${args.filePath}`;
      }
      case "run_command": {
        const command = args.command ?? "";
        if (!command) return "command is empty";
        try {
          const { stdout, stderr } = await execAsync(command, {
            cwd: this.cwd,
            timeout: 12e4,
            maxBuffer: 4 * 1024 * 1024,
            shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh"
          });
          return [stdout, stderr].filter(Boolean).join("\n").trim() || "(no output)";
        } catch (err) {
          return `exit code ${err.code ?? "?"}
${err.stdout ?? ""}
${err.stderr ?? ""}`.trim();
        }
      }
      case "list_dir": {
        const dir = path2.resolve(this.cwd, args.dirPath || ".");
        if (!fs2.existsSync(dir)) return `Directory not found: ${args.dirPath || "."}`;
        return fs2.readdirSync(dir, { withFileTypes: true }).map((entry) => `${entry.isDirectory() ? "dir  " : "file "} ${entry.name}`).join("\n") || "(empty)";
      }
      case "search_code": {
        const pattern = args.pattern ?? "";
        if (!pattern) return "pattern is empty";
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
              if (readText(full).includes(pattern)) hits.push(path2.relative(root, full));
            } catch {
            }
          }
        };
        walk(root);
        return hits.join("\n") || "No matches.";
      }
      default:
        return `Unknown tool: ${tool}`;
    }
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
  /** Keeps the system prompt and the most recent turns when the history grows. */
  compactHistory(maxChars = 12e4) {
    const size = () => this.history.reduce((total2, message) => total2 + message.content.length, 0);
    if (size() <= maxChars) return;
    const [system, ...rest] = this.history;
    const kept = [];
    let total = system?.content.length ?? 0;
    for (let i = rest.length - 1; i >= 0; i--) {
      const message = rest[i];
      if (total + message.content.length > maxChars && kept.length >= 4) break;
      kept.unshift(message);
      total += message.content.length;
    }
    this.history = system ? [system, ...kept] : kept;
  }
};
function readText(file) {
  return fs2.readFileSync(file, "utf-8");
}
function accumulate(target, next) {
  if (!next) return;
  target.promptTokens = (target.promptTokens ?? 0) + (next.promptTokens ?? 0);
  target.completionTokens = (target.completionTokens ?? 0) + (next.completionTokens ?? 0);
}

// src/session.ts
import fs3 from "node:fs";
import os2 from "node:os";
import path3 from "node:path";
var SESSION_DIR = path3.join(os2.homedir(), ".eschaton", "sessions");
function saveSession(session) {
  fs3.mkdirSync(SESSION_DIR, { recursive: true });
  const record = {
    id: session.id ?? newId(),
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    cwd: session.cwd,
    mode: session.mode,
    model: session.model,
    messages: session.messages
  };
  fs3.writeFileSync(path3.join(SESSION_DIR, `${record.id}.json`), JSON.stringify(record, null, 2), "utf-8");
  prune();
  return record;
}
function loadSession(id) {
  try {
    const raw = fs3.readFileSync(path3.join(SESSION_DIR, `${id}.json`), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function latestSession(cwd = process.cwd()) {
  const sessions = listSessions().filter((session) => path3.resolve(session.cwd) === path3.resolve(cwd));
  return sessions[0] ?? null;
}
function listSessions() {
  try {
    return fs3.readdirSync(SESSION_DIR).filter((name) => name.endsWith(".json")).map((name) => {
      try {
        return JSON.parse(fs3.readFileSync(path3.join(SESSION_DIR, name), "utf-8"));
      } catch {
        return null;
      }
    }).filter((session) => Boolean(session)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}
function prune(keep = 50) {
  const sessions = listSessions();
  for (const session of sessions.slice(keep)) {
    try {
      fs3.unlinkSync(path3.join(SESSION_DIR, `${session.id}.json`));
    } catch {
    }
  }
}
function newId() {
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${stamp}-${suffix}`;
}

// src/ui/theme.ts
var enabled = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
function paint(code) {
  if (!enabled) return (text) => text;
  return (text) => `\x1B[${code}m${text}\x1B[0m`;
}
var c = {
  bold: paint("1"),
  dim: paint("2"),
  italic: paint("3"),
  red: paint("31"),
  green: paint("32"),
  yellow: paint("33"),
  blue: paint("34"),
  magenta: paint("35"),
  cyan: paint("36"),
  gray: paint("90"),
  white: paint("97")
};
var sym = {
  prompt: "\u203A",
  tool: "\u25B8",
  ok: "\u2713",
  fail: "\u2717",
  dot: "\xB7",
  arrow: "\u2192"
};

// src/ui/render.ts
function renderDiff(before, after, maxLines = 16) {
  const oldLines = before.split("\n");
  const newLines = after.split("\n");
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) {
    prefix++;
  }
  let suffix = 0;
  while (suffix < oldLines.length - prefix && suffix < newLines.length - prefix && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]) {
    suffix++;
  }
  const removed = oldLines.slice(prefix, oldLines.length - suffix);
  const added = newLines.slice(prefix, newLines.length - suffix);
  const out = [];
  if (prefix > 0) out.push(c.gray(`  ${prefix} unchanged line${prefix === 1 ? "" : "s"}`));
  for (const line of removed.slice(0, maxLines)) out.push(c.red(`  - ${line}`));
  if (removed.length > maxLines) out.push(c.red(`  - ... ${removed.length - maxLines} more removed`));
  for (const line of added.slice(0, maxLines)) out.push(c.green(`  + ${line}`));
  if (added.length > maxLines) out.push(c.green(`  + ... ${added.length - maxLines} more added`));
  if (!removed.length && !added.length) out.push(c.gray("  (no changes)"));
  return out;
}
function truncateLines(text, maxLines = 12, maxWidth = 160) {
  const lines = text.split("\n");
  const shown = lines.slice(0, maxLines).map((line) => line.length > maxWidth ? `${line.slice(0, maxWidth)}\u2026` : line);
  if (lines.length > maxLines) shown.push(`\u2026 ${lines.length - maxLines} more lines`);
  return shown;
}
function formatDuration(ms) {
  if (ms < 1e3) return `${ms} ms`;
  const seconds = ms / 1e3;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}
function formatTokens(prompt, completion) {
  const total = (prompt ?? 0) + (completion ?? 0);
  if (!total) return "";
  if (total < 1e3) return `${total} tokens`;
  return `${(total / 1e3).toFixed(1)}k tokens`;
}
function previewHeader(preview) {
  if (preview.kind === "command") return c.gray(`$ ${preview.command}`);
  if (preview.kind === "read") return c.gray(`read ${preview.path}`);
  if (preview.kind === "list") return c.gray(`list ${preview.path}`);
  if (preview.kind === "search") return c.gray(`search "${preview.detail}"`);
  return c.gray(`${preview.kind} ${preview.path}`);
}
function toolLine(name, detail) {
  return `${c.cyan(sym.tool)} ${c.bold(name)} ${c.gray(detail)}`;
}
function okLine(text) {
  return `${c.green(sym.ok)} ${c.dim(text)}`;
}
function failLine(text) {
  return `${c.red(sym.fail)} ${text}`;
}

// src/ui/tui.ts
var SPINNER = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];
var TerminalUI = class {
  rl = null;
  agent;
  pool;
  options;
  busy = false;
  allowAll = false;
  abort = null;
  spinner = null;
  spinnerFrame = 0;
  streamed = false;
  pending = [];
  lastSigint = 0;
  sessionId;
  resumedCount = 0;
  constructor(pool, options) {
    this.pool = pool;
    this.options = options;
    this.agent = new CodingAgent(pool, options.cwd, options.mode ?? "Build");
    this.sessionId = options.sessionId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    if (options.resume) {
      const session = options.sessionId ? loadSession(options.sessionId) : latestSession(options.cwd);
      if (session) {
        this.sessionId = session.id;
        this.agent.setMode(session.mode ?? "Build");
        this.agent.setHistory(session.messages);
        this.resumedCount = session.messages.filter((message) => message.role === "user").length;
      }
    }
  }
  async start() {
    this.printBanner();
    this.rl = readline.createInterface({
      input: process2.stdin,
      output: process2.stdout,
      terminal: true,
      historySize: 500
    });
    this.setPrompt();
    this.rl.prompt();
    this.rl.on("line", (line) => {
      void this.onLine(line);
    });
    this.rl.on("SIGINT", () => this.onSigint());
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
      `  ${c.bold("eschaton")} ${c.dim(this.options.version)}`,
      `  ${c.dim("model  ")} ${provider ? `${provider.label} ${c.dim(sym.dot)} ${provider.model}` : c.red("none configured")}`,
      `  ${c.dim("folder ")} ${this.options.cwd}`,
      `  ${c.dim("mode   ")} ${this.modeLabel()}`,
      ""
    ];
    if (this.resumedCount) lines.push(`  ${c.dim(`resumed ${this.resumedCount} message${this.resumedCount === 1 ? "" : "s"}`)}`, "");
    lines.push(
      `  ${c.dim("/help for commands")} ${c.dim(sym.dot)} ${c.dim("Ctrl+C cancels")} ${c.dim(sym.dot)} ${c.dim("Ctrl+D exits")}`,
      ""
    );
    process2.stdout.write(lines.join("\n"));
  }
  modeLabel() {
    return c.magenta(this.agent.getMode());
  }
  setPrompt() {
    this.rl?.setPrompt(`${this.modeLabel()} ${c.gray(sym.prompt)} `);
  }
  async onLine(line) {
    if (this.busy) {
      this.rl?.prompt();
      return;
    }
    const input = line.trimEnd();
    if (!input.trim()) {
      this.rl?.prompt();
      return;
    }
    if (input.endsWith("\\")) {
      this.pending.push(input.slice(0, -1));
      this.rl?.setPrompt(c.gray("\u2026 "));
      this.rl?.prompt();
      return;
    }
    const text = [...this.pending, input].join("\n").trim();
    this.pending = [];
    this.setPrompt();
    if (!text.startsWith("/")) {
      await this.runTask(text);
      return;
    }
    await this.runCommand(text);
    this.rl?.prompt();
  }
  async runTask(input) {
    this.busy = true;
    this.allowAll = false;
    this.streamed = false;
    this.abort = new AbortController();
    const started = Date.now();
    this.startSpinner();
    process2.stdout.write("\n");
    try {
      const result = await this.agent.run(
        input,
        {
          onToken: (token) => {
            if (!this.streamed) {
              this.stopSpinner();
              this.streamed = true;
            }
            process2.stdout.write(token);
          },
          onThinking: () => {
          },
          onToolStart: (call, preview) => this.onToolStart(call, preview),
          onToolEnd: (toolResult) => this.onToolEnd(toolResult)
        },
        {
          signal: this.abort.signal,
          approve: (call, preview) => this.confirm(call, preview)
        }
      );
      this.stopSpinner();
      if (this.streamed) process2.stdout.write("\n");
      const tokens = formatTokens(result.usage.promptTokens, result.usage.completionTokens);
      const parts = [
        formatDuration(Date.now() - started),
        `${result.steps} step${result.steps === 1 ? "" : "s"}`,
        tokens,
        result.provider
      ].filter(Boolean);
      process2.stdout.write(c.dim(`  ${parts.join(` ${sym.dot} `)}`) + "\n\n");
      this.persist();
    } catch (err) {
      this.stopSpinner();
      if (this.streamed) process2.stdout.write("\n");
      if (err?.message === "cancelled") {
        process2.stdout.write(c.dim("  cancelled") + "\n\n");
      } else {
        process2.stdout.write(`  ${c.red("error")} ${err?.message ?? err}

`);
      }
    } finally {
      this.busy = false;
      this.abort = null;
      this.rl?.prompt();
    }
  }
  onToolStart(call, preview) {
    this.stopSpinner();
    if (this.streamed) {
      process2.stdout.write("\n");
      this.streamed = false;
    }
    process2.stdout.write(`
  ${toolLine(call.tool, detailOf(preview))}
`);
    if (preview.needsApproval) {
      process2.stdout.write(`${previewHeader(preview)}
`);
      if ((preview.kind === "write" || preview.kind === "edit") && preview.after !== void 0) {
        const diff = renderDiff(preview.before ?? "", preview.after);
        for (const line of diff) process2.stdout.write(`${line}
`);
      }
    }
  }
  onToolEnd(result) {
    if (result.isError) {
      process2.stdout.write(`  ${failLine(firstLine(result.output))}
`);
      return;
    }
    if (result.preview?.kind === "command") {
      for (const line of truncateLines(result.output, 14)) {
        process2.stdout.write(`  ${c.dim(line)}
`);
      }
      return;
    }
    if (result.preview?.kind === "read") {
      const count = result.output.split("\n").length;
      process2.stdout.write(`  ${okLine(`${count} line${count === 1 ? "" : "s"}`)}
`);
      return;
    }
    if (result.preview?.kind === "search") {
      const count = result.output === "No matches." ? 0 : result.output.split("\n").length;
      process2.stdout.write(`  ${okLine(`${count} match${count === 1 ? "" : "es"}`)}
`);
      return;
    }
    if (result.preview?.kind === "list") {
      process2.stdout.write(`  ${okLine("listed")}
`);
      return;
    }
    process2.stdout.write(`  ${okLine("applied")}
`);
  }
  async confirm(_call, _preview) {
    if (this.allowAll) return true;
    const answer = (await this.ask(`  ${c.yellow("allow?")} ${c.dim("[y]es  [n]o  [a]lways")} `)).toLowerCase();
    if (answer === "a" || answer === "always") {
      this.allowAll = true;
      return true;
    }
    return answer === "" || answer === "y" || answer === "yes";
  }
  /** Asks a question while the main interface is paused. */
  ask(question) {
    const main2 = this.rl;
    main2?.pause();
    return new Promise((resolve) => {
      const rl = readline.createInterface({ input: process2.stdin, output: process2.stdout, terminal: true });
      let settled = false;
      const finish = (answer) => {
        if (settled) return;
        settled = true;
        rl.close();
        main2?.resume();
        main2?.prompt();
        resolve(answer);
      };
      rl.on("SIGINT", () => finish("n"));
      rl.question(question, (answer) => finish(answer.trim()));
    });
  }
  async runCommand(input) {
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
        process2.stdout.write(c.dim("  history cleared") + "\n");
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
      case "session":
        process2.stdout.write(c.dim(`  session ${this.sessionId}`) + "\n");
        return;
      default:
        process2.stdout.write(c.dim(`  unknown command /${command}, try /help`) + "\n");
    }
  }
  setMode(argument) {
    const wanted = argument.toLowerCase();
    if (!wanted) {
      const next = MODES[(MODES.indexOf(this.agent.getMode()) + 1) % MODES.length];
      this.agent.setMode(next);
    } else {
      const match = MODES.find((mode) => mode.toLowerCase() === wanted);
      if (!match) {
        process2.stdout.write(c.dim("  modes: build, plan, review, fast") + "\n");
        return;
      }
      this.agent.setMode(match);
    }
    this.setPrompt();
    process2.stdout.write(`  ${c.dim("mode")} ${this.modeLabel()}
`);
  }
  setModel(argument) {
    if (!argument) {
      process2.stdout.write(`  ${c.dim("model")} ${this.pool.active()?.model ?? "none"}
`);
      return;
    }
    this.pool.setModel(argument);
    process2.stdout.write(`  ${c.dim("model")} ${argument}
`);
  }
  showProviders(argument) {
    if (argument) {
      const index = Number(argument);
      const provider = this.pool.use(index - 1);
      process2.stdout.write(
        provider ? `  ${c.dim("using")} ${provider.label} ${sym.dot} ${provider.model}
` : c.dim("  invalid number") + "\n"
      );
      return;
    }
    const active = this.pool.active();
    for (const [index, provider] of this.pool.list().entries()) {
      const marker = provider === active ? c.cyan("*") : " ";
      const key = provider.apiKey ? provider.apiKey.slice(0, 6) + "\u2026" : "local";
      process2.stdout.write(
        `  ${marker} ${index + 1}. ${provider.label} ${c.dim(sym.dot)} ${provider.model} ${c.dim(`(${key})`)}
`
      );
    }
  }
  printHelp() {
    const rows = [
      ["/help", "this list"],
      ["/mode [name]", "build, plan, review, fast (cycles when empty)"],
      ["/model [name]", "show or set the model for the active provider"],
      ["/providers [n]", "list providers, or switch to number n"],
      ["/session", "show the current session id"],
      ["/clear", "forget the conversation"],
      ["/exit", "leave"]
    ];
    process2.stdout.write("\n");
    for (const [command, description] of rows) {
      process2.stdout.write(`  ${c.cyan(command.padEnd(16))} ${c.dim(description)}
`);
    }
    process2.stdout.write(
      "\n" + c.dim("  Anything else is sent to the agent. End a line with \\ to continue on the next line.") + "\n" + c.dim("  Tool calls that write files or run commands ask for confirmation first.") + "\n\n"
    );
  }
  startSpinner() {
    if (!process2.stdout.isTTY) return;
    this.spinnerFrame = 0;
    this.spinner = setInterval(() => {
      const frame = SPINNER[this.spinnerFrame++ % SPINNER.length];
      process2.stdout.write(`\r\x1B[2K  ${c.cyan(frame)} ${c.dim("thinking")}`);
    }, 80);
  }
  stopSpinner() {
    if (!this.spinner) return;
    clearInterval(this.spinner);
    this.spinner = null;
    process2.stdout.write("\r\x1B[2K");
  }
  onSigint() {
    if (this.busy) {
      this.abort?.abort();
      return;
    }
    const now = Date.now();
    if (now - this.lastSigint < 1500) {
      this.rl?.close();
      return;
    }
    this.lastSigint = now;
    this.pending = [];
    process2.stdout.write("\n" + c.dim("  press Ctrl+C again to exit") + "\n");
    this.rl?.prompt();
  }
  persist() {
    try {
      saveSession({
        id: this.sessionId,
        cwd: this.options.cwd,
        mode: this.agent.getMode(),
        model: this.pool.active()?.model,
        messages: this.agent.getHistory()
      });
    } catch {
    }
  }
};
function detailOf(preview) {
  if (preview.kind === "command") return preview.command ?? "";
  if (preview.kind === "search") return `"${preview.detail ?? ""}"`;
  return preview.path ?? "";
}
function firstLine(text) {
  return text.split("\n")[0]?.slice(0, 140) ?? "";
}

// src/ide/server.ts
import http from "node:http";
import fs4 from "node:fs";
import path4 from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
var SKIP_DIRS = /* @__PURE__ */ new Set(["node_modules", ".git", "dist", "build", ".next", ".cache", "coverage"]);
var MAX_FILE_BYTES = 2 * 1024 * 1024;
var MAX_FILES = 5e3;
var MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf"
};
async function startIde(options) {
  const root = path4.resolve(options.cwd);
  const pool = new ProviderPool(providersFromSettings());
  if (options.model) pool.setModel(options.model);
  await pool.detectLocal();
  const approvals = /* @__PURE__ */ new Map();
  const agents = /* @__PURE__ */ new Map();
  const publicDir = findPublicDir();
  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      if (!res.headersSent) sendJson(res, 500, { error: String(err?.message ?? err) });
      else res.end();
    });
  });
  async function handle(req, res) {
    const url2 = new URL(req.url ?? "/", "http://127.0.0.1");
    const route = url2.pathname;
    if (route === "/api/state") {
      return sendJson(res, 200, {
        cwd: root,
        name: path4.basename(root),
        model: pool.active()?.model ?? null,
        provider: pool.active()?.label ?? null,
        providers: pool.list().map((provider) => ({
          id: provider.id,
          label: provider.label,
          model: provider.model,
          local: provider.local
        })),
        sessions: listSessions().filter((session) => path4.resolve(session.cwd) === root).slice(0, 20).map((session) => ({
          id: session.id,
          createdAt: session.createdAt,
          mode: session.mode,
          model: session.model,
          messages: session.messages.filter((message) => message.role === "user").length
        }))
      });
    }
    if (route === "/api/tree") {
      const relative = url2.searchParams.get("path") ?? ".";
      const target = safePath(root, relative);
      if (!target) return sendJson(res, 400, { error: "path outside the workspace" });
      const entries = fs4.readdirSync(target, { withFileTypes: true }).filter((entry) => !entry.name.startsWith(".")).map((entry) => ({
        name: entry.name,
        path: path4.relative(root, path4.join(target, entry.name)).replace(/\\/g, "/"),
        dir: entry.isDirectory()
      })).sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
      return sendJson(res, 200, { entries });
    }
    if (route === "/api/files") {
      const files = [];
      walk(root, files);
      return sendJson(res, 200, { files });
    }
    if (route === "/api/file" && req.method === "GET") {
      const relative = url2.searchParams.get("path") ?? "";
      const target = safePath(root, relative);
      if (!target) return sendJson(res, 400, { error: "path outside the workspace" });
      if (!fs4.existsSync(target) || fs4.statSync(target).isDirectory()) {
        return sendJson(res, 404, { error: "file not found" });
      }
      if (fs4.statSync(target).size > MAX_FILE_BYTES) return sendJson(res, 413, { error: "file is too large" });
      return sendJson(res, 200, { path: relative, content: fs4.readFileSync(target, "utf-8") });
    }
    if (route === "/api/file" && req.method === "PUT") {
      const body = await readJson(req);
      const target = safePath(root, body.path);
      if (!target) return sendJson(res, 400, { error: "path outside the workspace" });
      fs4.mkdirSync(path4.dirname(target), { recursive: true });
      fs4.writeFileSync(target, body.content ?? "", "utf-8");
      return sendJson(res, 200, { ok: true });
    }
    if (route === "/api/model" && req.method === "POST") {
      const body = await readJson(req);
      pool.setModel(body.model);
      return sendJson(res, 200, { model: pool.active()?.model });
    }
    if (route === "/api/exec" && req.method === "POST") {
      const body = await readJson(req);
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      });
      const child = spawn(body.command, {
        cwd: root,
        shell: true,
        windowsHide: true
      });
      child.stdout.on("data", (chunk) => emit(res, { type: "stdout", text: String(chunk) }));
      child.stderr.on("data", (chunk) => emit(res, { type: "stderr", text: String(chunk) }));
      child.on("close", (code) => {
        emit(res, { type: "exit", code });
        res.end();
      });
      child.on("error", (err) => {
        emit(res, { type: "stderr", text: `${err.message}
` });
        emit(res, { type: "exit", code: 1 });
        res.end();
      });
      req.on("close", () => child.kill());
      return;
    }
    if (route === "/api/chat" && req.method === "POST") {
      const body = await readJson(req);
      return chat(res, body);
    }
    if (route === "/api/approve" && req.method === "POST") {
      const body = await readJson(req);
      approvals.get(body.id)?.(Boolean(body.allow));
      approvals.delete(body.id);
      return sendJson(res, 200, { ok: true });
    }
    return serveStatic(route, res);
  }
  async function chat(res, body) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });
    const session = body.sessionId ? loadSession(body.sessionId) : null;
    const sessionId = body.sessionId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const mode = body.mode ?? (session?.mode ?? "Build");
    let agent = agents.get(sessionId);
    if (!agent) {
      agent = new CodingAgent(pool, root, mode);
      if (session?.messages?.length) agent.setHistory(session.messages);
      agents.set(sessionId, agent);
    }
    agent.setMode(mode);
    emit(res, { type: "start", sessionId });
    const controller = new AbortController();
    res.on("close", () => controller.abort());
    try {
      const result = await agent.run(
        body.message,
        {
          onToken: (text) => emit(res, { type: "token", text }),
          onToolStart: (call, preview) => emit(res, { type: "tool", name: call.tool, preview: publicPreview(preview) }),
          onToolEnd: (toolResult) => emit(res, {
            type: "tool_end",
            name: toolResult.tool,
            isError: toolResult.isError,
            output: toolResult.output.slice(0, 2e3)
          })
        },
        {
          signal: controller.signal,
          approve: (call, preview) => askApproval(res, approvals, call.tool, publicPreview(preview))
        }
      );
      saveSession({
        id: sessionId,
        cwd: root,
        mode: agent.getMode(),
        model: pool.active()?.model,
        messages: agent.getHistory()
      });
      emit(res, { type: "done", steps: result.steps, usage: result.usage, provider: result.provider });
    } catch (err) {
      emit(res, { type: "error", message: String(err?.message ?? err) });
    } finally {
      res.end();
    }
  }
  function askApproval(res, pending, tool, preview) {
    const id = Math.random().toString(36).slice(2, 10);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve(false);
      }, 3e5);
      pending.set(id, (allow) => {
        clearTimeout(timer);
        resolve(allow);
      });
      emit(res, { type: "approval", id, tool, preview });
    });
  }
  async function serveStatic(route, res) {
    const clean = route === "/" ? "index.html" : decodeURIComponent(route).replace(/^\/+/, "");
    const target = path4.join(publicDir, clean);
    if (!target.startsWith(publicDir) || !fs4.existsSync(target) || fs4.statSync(target).isDirectory()) {
      return sendJson(res, 404, { error: "not found" });
    }
    res.writeHead(200, { "Content-Type": MIME[path4.extname(target)] ?? "application/octet-stream" });
    fs4.createReadStream(target).pipe(res);
  }
  function walk(dir, out) {
    if (out.length >= MAX_FILES) return;
    for (const entry of fs4.readdirSync(dir, { withFileTypes: true })) {
      if (out.length >= MAX_FILES) return;
      if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
      const full = path4.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else out.push(path4.relative(root, full).replace(/\\/g, "/"));
    }
  }
  const port = await listen(server, options.port);
  const url = `http://127.0.0.1:${port}`;
  if (options.open) openBrowser(url);
  return {
    url,
    close: () => new Promise((resolve) => {
      server.close(() => resolve());
    })
  };
}
function publicPreview(preview) {
  return {
    kind: preview.kind,
    path: preview.path,
    command: preview.command,
    before: preview.before?.slice(0, 4e3),
    after: preview.after?.slice(0, 4e3),
    detail: preview.detail,
    needsApproval: preview.needsApproval
  };
}
function safePath(root, relative) {
  const target = path4.resolve(root, relative);
  const normalizedRoot = root.endsWith(path4.sep) ? root : root + path4.sep;
  return target === root || target.startsWith(normalizedRoot) ? target : null;
}
function findPublicDir() {
  const here = path4.dirname(fileURLToPath(import.meta.url));
  const candidates = [path4.join(here, "public"), path4.join(here, "../public"), path4.join(here, "web")];
  for (const candidate of candidates) {
    if (fs4.existsSync(path4.join(candidate, "index.html"))) return candidate;
  }
  throw new Error("IDE assets not found. Run `npm run build` first.");
}
function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(payload);
}
function emit(res, payload) {
  if (res.writableEnded) return;
  res.write(`data: ${JSON.stringify(payload)}

`);
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > MAX_FILE_BYTES) {
        reject(new Error("request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch (err) {
        reject(err);
      }
    });
  });
}
function listen(server, port) {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    const tryPort = (candidate) => {
      server.once("error", (err) => {
        if (err.code === "EADDRINUSE" && attempt < 10) {
          attempt++;
          tryPort(candidate + 1);
          return;
        }
        reject(err);
      });
      server.listen(candidate, "127.0.0.1", () => {
        const address = server.address();
        resolve(typeof address === "object" && address ? address.port : candidate);
      });
    };
    tryPort(port);
  });
}
function openBrowser(url) {
  const command = process.platform === "win32" ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
  try {
    spawn(command, { shell: true, detached: true, stdio: "ignore", windowsHide: true }).unref();
  } catch {
  }
}

// src/cli.ts
var VERSION = "3.0.0";
var DEFAULT_PORT = 4123;
function setupText() {
  return `
Eschaton needs a model. Pick one:

  1. Local, free and private
     Ollama       ollama pull deepseek-r1:7b        https://ollama.com
     LM Studio    load a model and start the local server   https://lmstudio.ai

  2. Hosted, with your own key (recommended)
     eschaton login openrouter sk-or-...
     eschaton login deepseek sk-...
     eschaton login groq gsk_...

  3. Environment variable
     macOS / Linux     export OPENROUTER_API_KEY=...
     Windows (cmd)     set OPENROUTER_API_KEY=...
     Windows (PS)      $env:OPENROUTER_API_KEY="..."

  Any OpenAI-compatible endpoint works too: OPENAI_BASE_URL and OPENAI_API_KEY.

  Keys are stored in ${CONFIG_FILE}
`;
}
function printHelp() {
  process3.stdout.write(`
Usage: eschaton [command] [options]

Commands:
  (none)                    open the IDE in your browser
  ide [--port 4123]         open the IDE
  chat                      use the terminal interface instead
  doctor                    show detected models and settings
  setup                     show how to connect a model
  login <provider> <key>    save a key: deepseek, openrouter, groq, custom

Options:
  --port <n>                IDE port (default ${DEFAULT_PORT})
  --no-open                 do not open a browser
  -m, --model <name>        override the model for this session
  --mode <name>             build, plan, review or fast
  -h, --help                show this help
  -v, --version             print the version
`);
}
function flag(argv, ...names) {
  for (const name of names) {
    const index = argv.indexOf(name);
    if (index >= 0 && argv[index + 1] && !argv[index + 1].startsWith("-")) return argv[index + 1];
  }
  return void 0;
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
async function runDoctor() {
  const settings = loadSettings();
  const providers = providersFromSettings(settings);
  const pool = new ProviderPool(providers);
  const local = await pool.detectLocal(1200);
  const lines = [
    "",
    `  ${c.bold("Eschaton")} ${c.dim(VERSION)}`,
    `  node        ${process3.version}`,
    `  config      ${CONFIG_FILE}`,
    `  saved key   ${maskKey(settings.apiKey)}${settings.provider ? c.dim(` (${settings.provider})`) : ""}`,
    ""
  ];
  if (providers.length) {
    lines.push(`  ${c.bold("hosted providers")}`);
    for (const provider of providers) {
      lines.push(`    ${c.cyan("*")} ${provider.label.padEnd(16)} ${provider.model} ${c.dim(maskKey(provider.apiKey))}`);
    }
  } else {
    lines.push(`  ${c.dim("no hosted provider configured")}`);
  }
  lines.push("", `  ${c.bold("local servers")}`);
  for (const kind of LOCAL_KINDS) {
    const models = await listLocalModels(
      kind === "ollama" ? "http://127.0.0.1:11434/v1/chat/completions" : "http://127.0.0.1:1234/v1/chat/completions",
      700
    );
    lines.push(`    ${models.length ? c.green("*") : c.dim("\xB7")} ${kind.padEnd(10)} ${models[0] ?? c.dim("not running")}`);
  }
  lines.push("", `  ${c.dim(`active: ${local.length ? local[0].label : pool.active()?.label ?? "none"}`)}`, "");
  process3.stdout.write(lines.join("\n"));
  return 0;
}
async function runIde(argv) {
  const port = Number(flag(argv, "--port") ?? DEFAULT_PORT);
  const model = flag(argv, "-m", "--model");
  const mode = parseMode(flag(argv, "--mode"));
  const pool = new ProviderPool(providersFromSettings());
  if (model) pool.setModel(model);
  const ide = await startIde({
    cwd: process3.cwd(),
    port: Number.isFinite(port) ? port : DEFAULT_PORT,
    open: !argv.includes("--no-open"),
    model,
    mode
  });
  const active = pool.active();
  process3.stdout.write(
    [
      "",
      `  ${c.bold("Eschaton")} ${c.dim(VERSION)}`,
      `  ${c.dim("workspace")} ${process3.cwd()}`,
      `  ${c.dim("url      ")} ${c.cyan(ide.url)}`,
      active ? `  ${c.dim("model    ")} ${active.label} ${c.dim("\xB7")} ${active.model}` : `  ${c.dim("model    ")} none`,
      "",
      c.dim("  Ctrl+C stops the server."),
      ""
    ].join("\n")
  );
  await new Promise((resolve) => {
    process3.on("SIGINT", () => {
      void ide.close().then(resolve);
    });
  });
  return 0;
}
async function runChat(argv) {
  const model = flag(argv, "-m", "--model");
  const mode = parseMode(flag(argv, "--mode"));
  const resume = argv.includes("--continue") || argv.includes("-c");
  const pool = new ProviderPool(providersFromSettings());
  if (model) pool.setModel(model);
  await pool.detectLocal();
  if (!pool.list().length) {
    process3.stdout.write(setupText());
    return 1;
  }
  const ui = new TerminalUI(pool, {
    version: VERSION,
    cwd: process3.cwd(),
    mode,
    resume
  });
  await ui.start();
  return 0;
}
function parseMode(value) {
  if (!value) return void 0;
  return MODES.find((mode) => mode.toLowerCase() === value.toLowerCase());
}
async function main() {
  const argv = process3.argv.slice(2);
  const command = argv[0];
  if (argv.includes("-h") || argv.includes("--help") || command === "help") {
    printHelp();
    return 0;
  }
  if (argv.includes("-v") || argv.includes("--version") || command === "version") {
    process3.stdout.write(`eschaton ${VERSION}
`);
    return 0;
  }
  if (command === "login") return runLogin(argv.slice(1));
  if (command === "doctor") return runDoctor();
  if (command === "chats" || command === "chat") return runChat(argv.slice(1));
  if (command === "setup") {
    process3.stdout.write(setupText());
    return 0;
  }
  return runIde(command === "ide" ? argv.slice(1) : argv);
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
