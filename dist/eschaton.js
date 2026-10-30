#!/usr/bin/env node

// src/cli.ts
import process3 from "node:process";

// src/config.ts
import fs2 from "node:fs";
import os from "node:os";
import path from "node:path";

// src/json.ts
import fs from "node:fs";
function readJson(file) {
  try {
    const raw = fs.readFileSync(file, "utf-8").replace(/^\uFEFF/, "");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// src/config.ts
var CONFIG_DIR = path.join(os.homedir(), ".eschaton");
var CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
function loadSettings() {
  const parsed = readJson(CONFIG_FILE);
  return parsed && typeof parsed === "object" ? parsed : {};
}
function saveSettings(settings) {
  fs2.mkdirSync(CONFIG_DIR, { recursive: true });
  fs2.writeFileSync(CONFIG_FILE, JSON.stringify(settings, null, 2), { encoding: "utf-8", mode: 384 });
}
function maskKey(key) {
  if (!key) return "not set";
  if (key.length <= 10) return "set";
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

// src/llm/providers.ts
var DEFAULTS = {
  openrouter: {
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    envKey: "OPENROUTER_API_KEY",
    model: "deepseek/deepseek-chat-v3-0324:free",
    local: false,
    free: true,
    headers: {
      "HTTP-Referer": "https://github.com/Tarikdxd/Eschaton-Code",
      "X-Title": "Eschaton Code"
    }
  },
  gemini: {
    label: "Google",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    envKey: "GEMINI_API_KEY",
    model: "gemini-2.5-flash",
    local: false,
    free: true
  },
  groq: {
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1/chat/completions",
    envKey: "GROQ_API_KEY",
    model: "deepseek-r1-distill-llama-70b",
    local: false,
    free: true
  },
  deepseek: {
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/chat/completions",
    envKey: "DEEPSEEK_API_KEY",
    model: "deepseek-chat",
    local: false,
    free: false
  },
  ollama: {
    label: "Ollama",
    baseUrl: "http://127.0.0.1:11434/v1/chat/completions",
    envKey: "OLLAMA_API_KEY",
    model: "deepseek-r1:7b",
    local: true,
    free: true
  },
  lmstudio: {
    label: "LM Studio",
    baseUrl: "http://127.0.0.1:1234/v1/chat/completions",
    envKey: "LMSTUDIO_API_KEY",
    model: "deepseek-r1-distill-qwen-7b",
    local: true,
    free: true
  },
  custom: {
    label: "Custom endpoint",
    baseUrl: "",
    envKey: "OPENAI_API_KEY",
    model: "deepseek-chat",
    local: false,
    free: false
  }
};
var HOSTED = ["openrouter", "gemini", "groq", "deepseek", "custom"];
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
      free: false,
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
    free: defaults.free,
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
        free: true,
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
    const body = {
      model: provider.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 4096,
      stream: Boolean(options.onChunk),
      ...options.onChunk ? { stream_options: { include_usage: true } } : {}
    };
    if (options.tools?.length) {
      body.tools = options.tools;
      body.tool_choice = "auto";
    }
    const response = await this.post(provider, body, options.signal);
    if (response.status === 400 && options.tools?.length) {
      const detail = await response.text().catch(() => "");
      if (/tool|function/i.test(detail)) {
        const retryBody = { ...body };
        delete retryBody.tools;
        delete retryBody.tool_choice;
        const retry = await this.post(provider, retryBody, options.signal);
        return this.read(retry, options, false);
      }
      const error = new Error(detail.slice(0, 300) || "HTTP 400");
      error.status = 400;
      throw error;
    }
    return this.read(response, options, Boolean(options.tools?.length));
  }
  post(provider, body, signal) {
    const headers = {
      "Content-Type": "application/json",
      ...provider.headers
    };
    if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;
    return fetch(provider.baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: linkSignals(signal, 18e4)
    });
  }
  async read(response, options, allowTools) {
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const error = new Error(detail.slice(0, 300) || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const contentType = response.headers.get("content-type") ?? "";
    const isStream = contentType.includes("event-stream");
    if (!options.onChunk || !response.body || !isStream) {
      const json = await response.json();
      const message = json.choices?.[0]?.message ?? {};
      if (options.onChunk && message.content) options.onChunk(message.content);
      return {
        text: message.content ?? "",
        toolCalls: allowTools ? readToolCalls(message) : [],
        usage: readUsage(json.usage)
      };
    }
    let text = "";
    let reasoning = "";
    let usage;
    const partial = [];
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
          const delta = json.choices?.[0]?.delta ?? {};
          const content = delta.content ?? "";
          const thought = delta.reasoning_content ?? "";
          if (thought) {
            reasoning += thought;
            options.onThinking?.(thought);
          }
          if (content) {
            text += content;
            options.onChunk(content);
          }
          for (const call of delta.tool_calls ?? []) {
            const index = Number(call.index ?? 0);
            partial[index] ??= { id: "", name: "", arguments: "" };
            if (call.id) partial[index].id = call.id;
            if (call.function?.name) partial[index].name = call.function.name;
            if (call.function?.arguments) partial[index].arguments += call.function.arguments;
          }
        } catch {
        }
      }
    }
    return {
      text: text || reasoning,
      toolCalls: allowTools ? partial.filter((call) => call.name) : [],
      usage
    };
  }
};
function readToolCalls(message) {
  const calls = message?.tool_calls;
  if (!Array.isArray(calls)) return [];
  return calls.filter((call) => call?.function?.name).map((call, index) => ({
    id: call.id ?? `call_${index}`,
    name: call.function.name,
    arguments: call.function.arguments ?? "{}"
  }));
}
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
import fs10 from "node:fs";
import path10 from "node:path";
import { execSync } from "node:child_process";

// src/agent/coding-agent.ts
import fs7 from "node:fs";
import path7 from "node:path";
import { exec as exec2 } from "node:child_process";
import { promisify as promisify2 } from "node:util";

// src/memory.ts
import fs4 from "node:fs";
import path3 from "node:path";

// src/memory-store.ts
import fs3 from "node:fs";
import os2 from "node:os";
import path2 from "node:path";
import crypto from "node:crypto";
var DIR = path2.join(os2.homedir(), ".eschaton", "memory");
var MAX_LINES = 200;
function recordEpisode(cwd, episode) {
  try {
    fs3.mkdirSync(DIR, { recursive: true });
    const file = fileFor(cwd);
    fs3.appendFileSync(file, `${JSON.stringify(episode)}
`, "utf-8");
    prune(file);
  } catch {
  }
}
function recentEpisodes(cwd, limit = 6) {
  try {
    const lines = fs3.readFileSync(fileFor(cwd), "utf-8").split("\n").filter(Boolean);
    return lines.slice(-limit).map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter((episode) => Boolean(episode?.prompt));
  } catch {
    return [];
  }
}
function formatEpisodes(episodes) {
  if (!episodes.length) return "";
  const lines = episodes.map((episode) => {
    const date = episode.at.slice(0, 16).replace("T", " ");
    const files = episode.files.length ? ` (${episode.files.slice(0, 4).join(", ")})` : "";
    return `- ${date} ${episode.prompt.slice(0, 180)}${files}`;
  });
  return `

Recent work in this directory:
${lines.join("\n")}`;
}
function fileFor(cwd) {
  const hash = crypto.createHash("sha1").update(path2.resolve(cwd)).digest("hex").slice(0, 12);
  return path2.join(DIR, `${hash}.jsonl`);
}
function prune(file) {
  try {
    const lines = fs3.readFileSync(file, "utf-8").split("\n").filter(Boolean);
    if (lines.length <= MAX_LINES) return;
    fs3.writeFileSync(file, `${lines.slice(-MAX_LINES).join("\n")}
`, "utf-8");
  } catch {
  }
}

// src/memory.ts
var CANDIDATES = ["ESCHATON.md", "AGENTS.md", "CLAUDE.md"];
var MAX_BYTES = 16e3;
function loadMemory(cwd) {
  const found = [];
  for (const name of CANDIDATES) {
    const file = path3.join(cwd, name);
    try {
      if (!fs4.existsSync(file)) continue;
      const raw = fs4.readFileSync(file, "utf-8");
      found.push({ source: name, content: raw.slice(0, MAX_BYTES) });
    } catch {
    }
  }
  return found;
}
function memoryBlock(cwd) {
  const files = loadMemory(cwd);
  const episodes = formatEpisodes(recentEpisodes(cwd));
  if (!files.length && !episodes) return "";
  const parts = files.map(
    (file) => `--- ${file.source} ---
${file.content.trim()}
--- end of ${file.source} ---`
  );
  const instructions = files.length ? `

Project instructions, written by the user. Follow them.
${parts.join("\n\n")}` : "";
  return `${instructions}${episodes}`;
}

// src/permissions.ts
import fs5 from "node:fs";
import os3 from "node:os";
import path4 from "node:path";
var GLOBAL_FILE = path4.join(os3.homedir(), ".eschaton", "permissions.json");
function projectFile(cwd) {
  return path4.join(cwd, ".eschaton", "permissions.json");
}
function loadPolicy(cwd) {
  const policy = { allow: [], deny: [] };
  for (const file of [GLOBAL_FILE, projectFile(cwd)]) {
    const raw = readJson(file);
    if (!raw) continue;
    if (Array.isArray(raw.allow)) policy.allow.push(...raw.allow.map(String));
    if (Array.isArray(raw.deny)) policy.deny.push(...raw.deny.map(String));
  }
  return policy;
}
function subject(tool, args) {
  if (tool === "run_command") return String(args.command ?? "");
  if (tool === "read_file" || tool === "write_file" || tool === "edit_file") return String(args.filePath ?? "");
  if (tool === "list_dir") return String(args.dirPath ?? ".");
  if (tool === "search_code") return String(args.pattern ?? "");
  return "";
}
function match(rule, tool, args) {
  const separator = rule.indexOf(":");
  const ruleTool = separator >= 0 ? rule.slice(0, separator) : rule;
  const pattern = separator >= 0 ? rule.slice(separator + 1) : "*";
  if (ruleTool !== "*" && ruleTool !== tool) return false;
  if (!pattern || pattern === "*") return true;
  const value = subject(tool, args);
  if (pattern.endsWith("*")) return value.startsWith(pattern.slice(0, -1));
  return value === pattern;
}
function decide(policy, tool, args) {
  for (const rule of policy.deny) {
    if (match(rule, tool, args)) return "deny";
  }
  for (const rule of policy.allow) {
    if (match(rule, tool, args)) return "allow";
  }
  return "ask";
}
function suggestRule(tool, args) {
  const value = subject(tool, args);
  if (tool === "run_command") {
    const first = value.trim().split(/\s+/).slice(0, 2).join(" ");
    return first ? `run_command:${first}*` : "run_command:*";
  }
  if (tool === "write_file" || tool === "edit_file") {
    const dir = value.includes("/") ? value.slice(0, value.lastIndexOf("/") + 1) : "";
    return dir ? `${tool}:${dir}*` : `${tool}:*`;
  }
  return `${tool}:*`;
}
function addRule(cwd, rule) {
  const file = projectFile(cwd);
  const policy = loadPolicy(cwd);
  if (policy.allow.includes(rule)) return;
  const own = readFile(file);
  own.allow.push(rule);
  fs5.mkdirSync(path4.dirname(file), { recursive: true });
  fs5.writeFileSync(file, JSON.stringify(own, null, 2), "utf-8");
}
function readFile(file) {
  const raw = readJson(file);
  return {
    allow: Array.isArray(raw?.allow) ? raw.allow.map(String) : [],
    deny: Array.isArray(raw?.deny) ? raw.deny.map(String) : []
  };
}

// src/hooks.ts
import path5 from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
var execAsync = promisify(exec);
function loadHooks(cwd) {
  const raw = readJson(path5.join(cwd, ".eschaton", "hooks.json"));
  return {
    preTool: typeof raw?.preTool === "string" ? raw.preTool : void 0,
    postTool: typeof raw?.postTool === "string" ? raw.postTool : void 0
  };
}
async function runHook(command, cwd, env, timeoutMs = 3e4) {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, ...env },
      shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh"
    });
    return { ok: true, output: [stdout, stderr].filter(Boolean).join("\n").trim() };
  } catch (err) {
    return { ok: false, output: [err?.stdout, err?.stderr, err?.message].filter(Boolean).join("\n") };
  }
}

// src/todos.ts
var TODO_TOOL = {
  type: "function",
  function: {
    name: "todo_write",
    description: "Create or update the task list for multi-step work. Call it at the start of a complex task and after finishing each step.",
    parameters: {
      type: "object",
      properties: {
        todos: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string" },
              status: { type: "string", enum: ["pending", "in_progress", "done"] }
            },
            required: ["text", "status"]
          }
        }
      },
      required: ["todos"]
    }
  }
};
function normalizeTodos(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item) => item && typeof item.text === "string").map((item) => ({
    text: String(item.text).slice(0, 200),
    status: item.status === "done" || item.status === "in_progress" ? item.status : "pending"
  }));
}
function formatTodo(todo) {
  const box = todo.status === "done" ? "[x]" : todo.status === "in_progress" ? "[~]" : "[ ]";
  return `${box} ${todo.text}`;
}

// src/skills.ts
import fs6 from "node:fs";
import os4 from "node:os";
import path6 from "node:path";
import { fileURLToPath } from "node:url";
var ALWAYS = /* @__PURE__ */ new Set(["using-superpowers", "karpathy-guidelines", "ponytail"]);
function bundledSkillRoot() {
  const here = path6.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path6.join(here, "skills"),
    path6.join(here, "..", "skills"),
    path6.join(here, "..", "..", "skills")
  ];
  return candidates.find((candidate) => fs6.existsSync(candidate)) ?? candidates[0];
}
function skillRoots(cwd) {
  return [bundledSkillRoot(), path6.join(cwd, ".eschaton", "skills"), path6.join(os4.homedir(), ".eschaton", "skills")];
}
function loadSkills(cwd) {
  const found = /* @__PURE__ */ new Map();
  for (const root of skillRoots(cwd)) {
    if (!fs6.existsSync(root)) continue;
    for (const file of findSkillFiles(root, 0)) {
      const skill = parseSkill(file);
      if (skill && !found.has(skill.name)) found.set(skill.name, skill);
    }
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}
function findSkill(skills, name) {
  return skills.find((skill) => skill.name === name);
}
function skillPrompt(skills) {
  if (!skills.length) return "";
  const always = skills.filter((skill) => skill.always);
  const rest = skills.filter((skill) => !skill.always);
  const lines = [
    "",
    "## Skills",
    "",
    "Before answering, check this list. If a skill matches the task, call use_skill with its name and follow it. This is mandatory, not optional.",
    ""
  ];
  for (const skill of rest) {
    lines.push(`- ${skill.name}: ${skill.description}`);
  }
  for (const skill of always) {
    lines.push("", `### Always-on skill: ${skill.name}`, "", skill.body.trim().slice(0, 12e3));
  }
  return lines.join("\n");
}
function findSkillFiles(dir, depth) {
  if (depth > 4) return [];
  let entries;
  try {
    entries = fs6.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    const full = path6.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findSkillFiles(full, depth + 1));
    } else if (entry.name === "SKILL.md" || entry.name === "skill.md") {
      files.push(full);
    }
  }
  return files;
}
function parseSkill(file) {
  let raw;
  try {
    raw = fs6.readFileSync(file, "utf-8").replace(/^\uFEFF/, "");
  } catch {
    return null;
  }
  const match2 = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match2) return null;
  const meta = {};
  const lines = match2[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const pair = lines[i].match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!pair) continue;
    const key = pair[1];
    let value = pair[2].trim();
    if (value === ">" || value === "|") {
      const folded = [];
      while (i + 1 < lines.length && /^\s+/.test(lines[i + 1])) {
        folded.push(lines[++i].trim());
      }
      value = value === ">" ? folded.join(" ") : folded.join("\n");
    }
    meta[key] = value.replace(/^["']|["']$/g, "").trim();
  }
  const name = (meta.name ?? path6.basename(path6.dirname(file))).trim();
  if (!name) return null;
  return {
    name,
    description: (meta.description ?? "").slice(0, 400),
    body: match2[2] ?? "",
    source: file,
    always: meta.always === "true" || ALWAYS.has(name)
  };
}

// src/agent/coding-agent.ts
var execAsync2 = promisify2(exec2);
var MODES = ["Build", "Plan", "Review", "Fast"];
var SKILL_TOOL = {
  type: "function",
  function: {
    name: "use_skill",
    description: "Load the full instructions of a skill from the catalog before doing a task it applies to.",
    parameters: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"]
    }
  }
};
var TASK_TOOL = {
  type: "function",
  function: {
    name: "task",
    description: "Run a focused read-only subagent with its own context and return its findings. Use it to explore a large area or check several files without filling this conversation.",
    parameters: {
      type: "object",
      properties: {
        description: { type: "string", description: "Short label, shown to the user" },
        prompt: { type: "string", description: "What the subagent should find out" }
      },
      required: ["description", "prompt"]
    }
  }
};
var READ_ONLY_MODES = ["Plan", "Review"];
var MODE_RULES = {
  Build: "Implement the change: read files, edit them, run the project tests, then report what changed.",
  Plan: "Read-only. Do not edit files or run commands. Reply with a concrete plan: files to touch, order of work, risks.",
  Review: "Read-only. Do not edit files or run commands. Report bugs, unsafe assumptions and missing tests with paths and line numbers.",
  Fast: "Answer directly with as few tool calls as possible."
};
var TOOLS = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a text file with line numbers.",
      parameters: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Path relative to the workspace" },
          startLine: { type: "number", description: "First line, 1-based" },
          endLine: { type: "number", description: "Last line, inclusive" }
        },
        required: ["filePath"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create a file or replace its whole content.",
      parameters: {
        type: "object",
        properties: {
          filePath: { type: "string" },
          content: { type: "string" }
        },
        required: ["filePath", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "Replace one exact substring in a file. Read the file first and copy the text exactly.",
      parameters: {
        type: "object",
        properties: {
          filePath: { type: "string" },
          target: { type: "string", description: "Exact text to replace, including indentation" },
          replacement: { type: "string" }
        },
        required: ["filePath", "target", "replacement"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Run a shell command in the workspace and return stdout and stderr.",
      parameters: {
        type: "object",
        properties: { command: { type: "string" } },
        required: ["command"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "List a directory.",
      parameters: {
        type: "object",
        properties: { dirPath: { type: "string" } }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_code",
      description: "Find files containing a literal string.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string" },
          dirPath: { type: "string" }
        },
        required: ["pattern"]
      }
    }
  }
];
function systemPrompt(cwd, mode, skills) {
  return `You are Eschaton Code, a coding agent working in the user's terminal.

Working directory: ${cwd}
Platform: ${process.platform}
Mode: ${mode}. ${MODE_RULES[mode]}

Rules:
- Read a file before editing it. Copy the target text exactly, including indentation.
- Paths are relative to the working directory.
- Run the project's own test or build command after changing code, if one exists.
- Never invent file contents. If something is unknown, read it.
- For multi-step work, call todo_write first and update it as you go.
- Call task to hand a focused read-only investigation to a subagent.
- Keep answers short. The terminal is not a document editor.${memoryBlock(cwd)}${skillPrompt(skills)}`;
}
var CodingAgent = class _CodingAgent {
  pool;
  history = [];
  cwd;
  mode;
  undoStack = [];
  options;
  tools;
  handlers;
  todos = [];
  skills;
  changedFiles = [];
  constructor(pool, cwd = process.cwd(), mode = "Build", options = {}) {
    this.pool = pool;
    this.cwd = cwd;
    this.mode = mode;
    this.options = options;
    this.skills = loadSkills(cwd);
    this.tools = [
      ...TOOLS,
      TODO_TOOL,
      TASK_TOOL,
      ...this.skills.length ? [SKILL_TOOL] : [],
      ...options.extraTools ?? []
    ];
    this.handlers = {
      ...options.extraHandlers ?? {},
      use_skill: async (args) => {
        const skill = findSkill(this.skills, String(args.name ?? ""));
        return skill ? skill.body : `Unknown skill "${args.name}". Available: ${this.skills.map((item) => item.name).join(", ")}`;
      },
      todo_write: async (args) => {
        this.todos = normalizeTodos(args.todos);
        this.options.onTodos?.(this.todos);
        return this.todos.length ? this.todos.map(formatTodo).join("\n") : "Task list cleared.";
      },
      task: async (args) => this.runSubagent(String(args.prompt ?? ""), String(args.description ?? "subagent"))
    };
    this.resetHistory();
  }
  getTodos() {
    return this.todos;
  }
  getSkills() {
    return this.skills;
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
    this.history = [{ role: "system", content: systemPrompt(this.cwd, this.mode, this.skills) }];
  }
  async run(prompt, callbacks = {}, options = {}) {
    this.history.push({ role: "user", content: prompt });
    const usage = { promptTokens: 0, completionTokens: 0 };
    let provider;
    const maxSteps = options.maxSteps ?? 30;
    for (let step = 1; step <= maxSteps; step++) {
      let buffered = "";
      let muted = false;
      const forward = (chunk) => {
        if (!callbacks.onToken || muted) return;
        buffered += chunk;
        if (buffered.length > 8) {
          callbacks.onToken(buffered.slice(0, -8));
          buffered = buffered.slice(-8);
        }
      };
      const response = await this.pool.generate({
        messages: this.history,
        tools: this.tools,
        signal: options.signal,
        onChunk: callbacks.onToken ? forward : void 0,
        onThinking: callbacks.onThinking
      });
      provider = response.provider;
      accumulate(usage, response.usage);
      if (response.toolCalls.length) {
        muted = true;
        this.history.push({
          role: "assistant",
          content: response.text,
          tool_calls: response.toolCalls.map((call) => ({
            id: call.id,
            type: "function",
            function: { name: call.name, arguments: call.arguments }
          }))
        });
        for (const call of response.toolCalls) {
          const parsed = parseArguments(call);
          const result = await this.execute(call.name, parsed, callbacks, options);
          callbacks.onToolEnd?.(result);
          this.history.push({
            role: "tool",
            tool_call_id: call.id,
            content: truncate(result.output, 3e4)
          });
        }
        this.compactHistory();
        continue;
      }
      if (!muted && buffered) callbacks.onToken?.(buffered);
      this.history.push({ role: "assistant", content: response.text });
      const legacy = parseLegacyToolCall(response.text);
      if (legacy) {
        const result = await this.execute(legacy.name, legacy.args, callbacks, options);
        callbacks.onToolEnd?.(result);
        this.history.push({ role: "user", content: `Result of ${legacy.name}:
${truncate(result.output, 3e4)}` });
        this.compactHistory();
        continue;
      }
      this.record(prompt, response.text);
      return { text: response.text, steps: step, usage, provider };
    }
    this.record(prompt, `stopped after ${maxSteps} steps`);
    return {
      text: `Stopped after ${maxSteps} steps. Ask again to continue from here.`,
      steps: maxSteps,
      usage,
      provider
    };
  }
  undoLast() {
    const entry = this.undoStack.pop();
    if (!entry) return void 0;
    const file = path7.resolve(this.cwd, entry.path);
    if (entry.before === void 0) {
      fs7.rmSync(file, { force: true });
    } else {
      fs7.mkdirSync(path7.dirname(file), { recursive: true });
      fs7.writeFileSync(file, entry.before, "utf-8");
    }
    return entry;
  }
  async compact() {
    if (this.history.length <= 2) return "Nothing to compact.";
    const transcript = this.history.filter((message) => message.role !== "system").map((message) => `${message.role}: ${message.content}`).join("\n\n").slice(-6e4);
    const response = await this.pool.generate({
      messages: [
        {
          role: "system",
          content: "Summarize this coding session for a fresh context window. Keep: the goal, decisions, files changed, commands that matter, and open questions. Drop small talk. Write compact prose, max 400 words."
        },
        { role: "user", content: transcript }
      ]
    });
    const summary = response.text.trim();
    this.history = [
      { role: "system", content: systemPrompt(this.cwd, this.mode, this.skills) },
      { role: "user", content: `Session so far (summary):
${summary}` },
      { role: "assistant", content: "Understood. Ready to continue." }
    ];
    return summary;
  }
  async execute(tool, args, callbacks, options) {
    if (READ_ONLY_MODES.includes(this.mode) && ["write_file", "edit_file", "run_command"].includes(tool)) {
      return {
        tool,
        isError: true,
        output: `Blocked: ${this.mode} mode is read-only. Switch to Build to change files or run commands.`
      };
    }
    const decision = this.options.policy ? decide(this.options.policy, tool, args) : "ask";
    const preview = this.describe(tool, args);
    callbacks.onToolStart?.({ id: "", name: tool, arguments: JSON.stringify(args) }, preview);
    if (decision === "deny") {
      return { tool, isError: true, output: `Blocked by a permission rule for ${tool}.`, preview };
    }
    if (preview.needsApproval && decision === "ask" && options.approve) {
      const allowed = await options.approve({ id: "", name: tool, arguments: JSON.stringify(args) }, preview);
      if (!allowed) {
        return { tool, isError: true, output: "Denied by the user. Do not retry; ask what to do instead.", preview };
      }
    }
    const env = {
      ESCHATON_TOOL: tool,
      ESCHATON_TOOL_ARGS: JSON.stringify(args).slice(0, 4e3),
      ESCHATON_CWD: this.cwd
    };
    if (this.options.hooks?.preTool) {
      const hook = await runHook(this.options.hooks.preTool, this.cwd, env);
      if (!hook.ok) {
        return {
          tool,
          isError: true,
          output: `Blocked by the preTool hook:
${hook.output || "non-zero exit"}`,
          preview
        };
      }
    }
    if (tool === "write_file" || tool === "edit_file") {
      this.remember(args.filePath);
    }
    try {
      let output = await this.runTool(tool, args);
      if ((tool === "write_file" || tool === "edit_file") && args.filePath && !this.changedFiles.includes(args.filePath)) {
        this.changedFiles.push(String(args.filePath));
      }
      if (this.options.hooks?.postTool) {
        const hook = await runHook(this.options.hooks.postTool, this.cwd, env);
        if (!hook.ok) output += `

postTool hook failed:
${hook.output}`;
      }
      return { tool, isError: false, output, preview };
    } catch (err) {
      return { tool, isError: true, output: `${tool} failed: ${err.message}`, preview };
    }
  }
  record(prompt, outcome) {
    if (this.options.recordMemory === false) return;
    recordEpisode(this.cwd, {
      at: (/* @__PURE__ */ new Date()).toISOString(),
      prompt: prompt.slice(0, 400),
      files: [...this.changedFiles],
      outcome: outcome.slice(0, 300)
    });
    this.changedFiles = [];
  }
  async runSubagent(prompt, description) {
    if (!prompt.trim()) return "task prompt is empty";
    const subagent = new _CodingAgent(this.pool, this.cwd, "Plan", {
      extraTools: this.options.extraTools,
      extraHandlers: this.options.extraHandlers,
      recordMemory: false
    });
    const result = await subagent.run(
      `Investigate and report. Do not change files.

${prompt}`,
      {},
      { maxSteps: 12 }
    );
    return `Subagent "${description}" finished:
${truncate(result.text, 8e3)}`;
  }
  remember(filePath) {
    const file = path7.resolve(this.cwd, filePath);
    const before = fs7.existsSync(file) ? fs7.readFileSync(file, "utf-8") : void 0;
    this.undoStack.push({ path: filePath, before });
    if (this.undoStack.length > 50) this.undoStack.shift();
  }
  describe(tool, args) {
    if (tool === "write_file") {
      const target = path7.resolve(this.cwd, args.filePath ?? "");
      const before = fs7.existsSync(target) ? fs7.readFileSync(target, "utf-8") : void 0;
      return { kind: "write", path: args.filePath, before, after: String(args.content ?? ""), needsApproval: true };
    }
    if (tool === "edit_file") {
      const target = path7.resolve(this.cwd, args.filePath ?? "");
      const before = fs7.existsSync(target) ? fs7.readFileSync(target, "utf-8") : void 0;
      const needle = String(args.target ?? "");
      const after = before?.includes(needle) ? before.replace(needle, String(args.replacement ?? "")) : void 0;
      return { kind: "edit", path: args.filePath, before, after, needsApproval: true };
    }
    if (tool === "run_command") return { kind: "command", command: String(args.command ?? ""), needsApproval: true };
    if (tool === "read_file") return { kind: "read", path: args.filePath, needsApproval: false };
    if (tool === "list_dir") return { kind: "list", path: args.dirPath ?? ".", needsApproval: false };
    if (tool === "search_code") return { kind: "search", detail: String(args.pattern ?? ""), needsApproval: false };
    if (tool === "todo_write" || tool === "task") return { kind: "tool", detail: tool, needsApproval: false };
    return { kind: "tool", detail: tool, needsApproval: true };
  }
  async runTool(tool, args) {
    switch (tool) {
      case "read_file": {
        const file = path7.resolve(this.cwd, args.filePath);
        if (!fs7.existsSync(file)) return `File not found: ${args.filePath}`;
        const lines = fs7.readFileSync(file, "utf-8").split("\n");
        const start = Math.max(1, Number(args.startLine) || 1);
        const end = Math.min(lines.length, Number(args.endLine) || lines.length);
        return lines.slice(start - 1, end).map((line, i) => `${start + i}: ${line}`).join("\n");
      }
      case "write_file": {
        const file = path7.resolve(this.cwd, args.filePath);
        fs7.mkdirSync(path7.dirname(file), { recursive: true });
        fs7.writeFileSync(file, args.content ?? "", "utf-8");
        return `Wrote ${Buffer.byteLength(args.content ?? "")} bytes to ${args.filePath}`;
      }
      case "edit_file": {
        const file = path7.resolve(this.cwd, args.filePath);
        if (!fs7.existsSync(file)) return `File not found: ${args.filePath}`;
        const content = fs7.readFileSync(file, "utf-8");
        const target = args.target ?? "";
        if (!target) return "target is empty";
        if (!content.includes(target)) {
          return `Target string not found in ${args.filePath}. Read the file again and copy the exact text.`;
        }
        fs7.writeFileSync(file, content.replace(target, args.replacement ?? ""), "utf-8");
        return `Edited ${args.filePath}`;
      }
      case "run_command": {
        const command = args.command ?? "";
        if (!command) return "command is empty";
        try {
          const { stdout, stderr } = await execAsync2(command, {
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
        const dir = path7.resolve(this.cwd, args.dirPath || ".");
        if (!fs7.existsSync(dir)) return `Directory not found: ${args.dirPath || "."}`;
        return fs7.readdirSync(dir, { withFileTypes: true }).map((entry) => `${entry.isDirectory() ? "dir  " : "file "} ${entry.name}`).join("\n") || "(empty)";
      }
      case "search_code": {
        const pattern = args.pattern ?? "";
        if (!pattern) return "pattern is empty";
        const root = path7.resolve(this.cwd, args.dirPath || ".");
        const hits = [];
        const skip = /* @__PURE__ */ new Set(["node_modules", ".git", "dist", "build", ".next"]);
        const walk = (dir) => {
          if (hits.length >= 50) return;
          for (const entry of fs7.readdirSync(dir, { withFileTypes: true })) {
            if (hits.length >= 50) return;
            if (skip.has(entry.name)) continue;
            const full = path7.join(dir, entry.name);
            if (entry.isDirectory()) {
              walk(full);
              continue;
            }
            try {
              if (fs7.statSync(full).size > 512 * 1024) continue;
              if (fs7.readFileSync(full, "utf-8").includes(pattern)) hits.push(path7.relative(root, full));
            } catch {
            }
          }
        };
        walk(root);
        return hits.join("\n") || "No matches.";
      }
      default: {
        const handler = this.handlers[tool];
        if (handler) return handler(args);
        return `Unknown tool: ${tool}`;
      }
    }
  }
  compactHistory(maxChars = 12e4) {
    const size = () => this.history.reduce((total2, message) => total2 + (message.content?.length ?? 0), 0);
    if (size() <= maxChars) return;
    const [system, ...rest] = this.history;
    const kept = [];
    let total = system?.content.length ?? 0;
    for (let i = rest.length - 1; i >= 0; i--) {
      const message = rest[i];
      if (total + (message.content?.length ?? 0) > maxChars && kept.length >= 4) break;
      kept.unshift(message);
      total += message.content?.length ?? 0;
    }
    this.history = system ? [system, ...kept] : kept;
  }
};
function parseArguments(call) {
  try {
    const parsed = JSON.parse(call.arguments || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function parseLegacyToolCall(content) {
  const block = content.match(/```(?:tool:json|tool|json)\s*([\s\S]*?)```/);
  const candidates = block?.[1] ? [block[1]] : [];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate.trim());
      if (parsed?.tool && parsed?.args) return { name: parsed.tool, args: parsed.args };
    } catch {
    }
  }
  return null;
}
function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max)}
\u2026 truncated` : text;
}
function accumulate(target, next) {
  if (!next) return;
  target.promptTokens = (target.promptTokens ?? 0) + (next.promptTokens ?? 0);
  target.completionTokens = (target.completionTokens ?? 0) + (next.completionTokens ?? 0);
}

// src/session.ts
import fs8 from "node:fs";
import os5 from "node:os";
import path8 from "node:path";
var SESSION_DIR = path8.join(os5.homedir(), ".eschaton", "sessions");
function saveSession(session) {
  fs8.mkdirSync(SESSION_DIR, { recursive: true });
  const record = {
    id: session.id ?? newId(),
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    cwd: session.cwd,
    mode: session.mode,
    model: session.model,
    messages: session.messages
  };
  fs8.writeFileSync(path8.join(SESSION_DIR, `${record.id}.json`), JSON.stringify(record, null, 2), "utf-8");
  prune2();
  return record;
}
function loadSession(id) {
  try {
    const raw = fs8.readFileSync(path8.join(SESSION_DIR, `${id}.json`), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function latestSession(cwd = process.cwd()) {
  const sessions = listSessions().filter((session) => path8.resolve(session.cwd) === path8.resolve(cwd));
  return sessions[0] ?? null;
}
function listSessions() {
  try {
    return fs8.readdirSync(SESSION_DIR).filter((name) => name.endsWith(".json")).map((name) => {
      try {
        return JSON.parse(fs8.readFileSync(path8.join(SESSION_DIR, name), "utf-8"));
      } catch {
        return null;
      }
    }).filter((session) => Boolean(session)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}
function prune2(keep = 50) {
  const sessions = listSessions();
  for (const session of sessions.slice(keep)) {
    try {
      fs8.unlinkSync(path8.join(SESSION_DIR, `${session.id}.json`));
    } catch {
    }
  }
}
function newId() {
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${stamp}-${suffix}`;
}

// src/commands.ts
import fs9 from "node:fs";
import path9 from "node:path";
var COMMAND_DIR = path9.join(".eschaton", "commands");
function loadCommands(cwd) {
  const dir = path9.join(cwd, COMMAND_DIR);
  if (!fs9.existsSync(dir)) return [];
  const commands = [];
  for (const entry of fs9.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    try {
      const source = path9.join(COMMAND_DIR, entry.name);
      const body = fs9.readFileSync(path9.join(dir, entry.name), "utf-8");
      const firstLine2 = body.split("\n").map((line) => line.trim()).find((line) => line && !line.startsWith("#")) ?? "";
      commands.push({
        name: entry.name.replace(/\.md$/, ""),
        description: firstLine2.slice(0, 100),
        body,
        source
      });
    } catch {
    }
  }
  return commands.sort((a, b) => a.name.localeCompare(b.name));
}
function expandCommand(command, argument) {
  const body = command.body.replace(/^\s*#[^\n]*\n/, "");
  return body.includes("$ARGUMENTS") ? body.replaceAll("$ARGUMENTS", argument) : `${body}

${argument}`.trim();
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
  if (preview.kind === "tool") return c.gray(`tool ${preview.detail}`);
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
  totalUsage = { promptTokens: 0, completionTokens: 0 };
  turns = 0;
  constructor(pool, options) {
    this.pool = pool;
    this.options = options;
    this.agent = new CodingAgent(pool, options.cwd, options.mode ?? "Build", {
      ...options.agentOptions,
      onTodos: (todos) => this.renderTodos(todos)
    });
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
    if (text.startsWith("!")) {
      this.runShell(text.slice(1).trim());
      this.rl?.prompt();
      return;
    }
    if (!text.startsWith("/")) {
      await this.runTask(this.expandFileRefs(text));
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
      this.turns++;
      this.totalUsage.promptTokens = (this.totalUsage.promptTokens ?? 0) + (result.usage.promptTokens ?? 0);
      this.totalUsage.completionTokens = (this.totalUsage.completionTokens ?? 0) + (result.usage.completionTokens ?? 0);
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
  ${toolLine(call.name, detailOf(preview))}
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
    if (result.preview?.kind === "tool") {
      if (result.tool === "todo_write") return;
      for (const line of truncateLines(result.output, 8)) process2.stdout.write(`  ${c.dim(line)}
`);
      return;
    }
    process2.stdout.write(`  ${okLine("applied")}
`);
  }
  async confirm(call, _preview) {
    if (this.allowAll) return true;
    const answer = (await this.ask(`  ${c.yellow("allow?")} ${c.dim("[y]es  [n]o  [a]lways")} `)).toLowerCase();
    if (answer === "a" || answer === "always") {
      this.allowAll = true;
      try {
        const rule = suggestRule(call.name, JSON.parse(call.arguments || "{}"));
        addRule(this.options.cwd, rule);
        process2.stdout.write(c.dim(`  saved rule ${rule}
`));
      } catch {
      }
      return true;
    }
    return answer === "" || answer === "y" || answer === "yes";
  }
  renderTodos(todos) {
    if (!todos.length) return;
    process2.stdout.write("\n");
    for (const todo of todos) {
      const box = todo.status === "done" ? c.green("[x]") : todo.status === "in_progress" ? c.yellow("[~]") : c.dim("[ ]");
      process2.stdout.write(`  ${box} ${todo.text}
`);
    }
  }
  /**
   * Asks on the existing interface. The run loop is busy while this happens, so
   * the reply is not mistaken for a new prompt.
   */
  ask(question) {
    const rl = this.rl;
    if (!rl) return Promise.resolve("");
    return new Promise((resolve) => {
      rl.question(question, (answer) => resolve(answer.trim()));
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
      case "undo":
        this.undo();
        return;
      case "diff":
        this.showDiff();
        return;
      case "cost":
        this.showCost();
        return;
      case "sessions":
        this.showSessions();
        return;
      case "resume":
        this.resume(argument);
        return;
      case "compact":
        await this.compact();
        return;
      case "init":
        await this.runTask(
          "Create an AGENTS.md in the project root describing how to build, test and navigate this repository. Read the README, package.json or equivalent first. Keep it under 60 lines."
        );
        return;
      case "commands":
        this.listCommands();
        return;
      case "todos":
        if (!this.agent.getTodos().length) process2.stdout.write(c.dim("  no tasks") + "\n");
        else {
          this.renderTodos(this.agent.getTodos());
          process2.stdout.write("\n");
        }
        return;
      case "permissions":
        this.showPermissions();
        return;
      case "skills":
        this.showSkills();
        return;
      default: {
        const custom = loadCommands(this.options.cwd).find((item) => item.name === command);
        if (custom) {
          await this.runTask(expandCommand(custom, argument));
          return;
        }
        process2.stdout.write(c.dim(`  unknown command /${command}, try /help`) + "\n");
      }
    }
  }
  runShell(command) {
    if (!command) return;
    try {
      const output = execSync(command, {
        cwd: this.options.cwd,
        encoding: "utf-8",
        timeout: 6e4,
        maxBuffer: 4 * 1024 * 1024
      });
      process2.stdout.write(output.trimEnd() + "\n");
    } catch (err) {
      if (err?.stdout) process2.stdout.write(String(err.stdout));
      if (err?.stderr) process2.stdout.write(c.red(String(err.stderr)));
      if (!err?.stdout && !err?.stderr) process2.stdout.write(c.red(String(err?.message ?? err)) + "\n");
    }
  }
  expandFileRefs(text) {
    const matches = [...text.matchAll(/(?:^|\s)@([\w./\\-]+)/g)];
    if (!matches.length) return text;
    const blocks = [];
    let budget = 4e4;
    for (const match2 of matches.slice(0, 5)) {
      const relative = match2[1];
      const file = path10.resolve(this.options.cwd, relative);
      try {
        if (budget <= 0) break;
        const content = fs10.readFileSync(file, "utf-8");
        const slice = content.slice(0, Math.min(budget, 2e4));
        budget -= slice.length;
        blocks.push(`
<file path="${relative}">
${slice}
</file>`);
      } catch {
      }
    }
    return blocks.length ? `${text}
${blocks.join("\n")}` : text;
  }
  showSkills() {
    const skills = this.agent.getSkills();
    if (!skills.length) {
      process2.stdout.write(c.dim("  no skills found. add .eschaton/skills/<name>/SKILL.md") + "\n");
      return;
    }
    process2.stdout.write("\n");
    for (const skill of skills) {
      const marker = skill.always ? c.green("*") : " ";
      process2.stdout.write(`  ${marker} ${c.cyan(skill.name.padEnd(28))} ${c.dim(skill.description.slice(0, 70))}
`);
    }
    process2.stdout.write("\n" + c.dim(`  ${skills.length} skills, * means always loaded`) + "\n");
  }
  showPermissions() {
    const policy = loadPolicy(this.options.cwd);
    const file = `${this.options.cwd}/.eschaton/permissions.json`;
    process2.stdout.write("\n");
    process2.stdout.write(`  ${c.dim("allow")} ${policy.allow.length ? policy.allow.join(", ") : c.dim("none")}
`);
    process2.stdout.write(`  ${c.dim("deny ")} ${policy.deny.length ? policy.deny.join(", ") : c.dim("none")}
`);
    process2.stdout.write(`  ${c.dim(`file  ${file}`)}

`);
  }
  listCommands() {
    const commands = loadCommands(this.options.cwd);
    if (!commands.length) {
      process2.stdout.write(c.dim("  no custom commands. add .eschaton/commands/<name>.md") + "\n");
      return;
    }
    process2.stdout.write("\n");
    for (const command of commands) {
      process2.stdout.write(`  ${c.cyan(`/${command.name}`.padEnd(18))} ${c.dim(command.description)}
`);
    }
    process2.stdout.write("\n");
  }
  undo() {
    const entry = this.agent.undoLast();
    if (!entry) {
      process2.stdout.write(c.dim("  nothing to undo") + "\n");
      return;
    }
    process2.stdout.write(`  ${c.green(sym.ok)} restored ${c.bold(entry.path)}
`);
  }
  showDiff() {
    try {
      const stat = execSync("git diff --stat", { cwd: this.options.cwd, encoding: "utf-8" });
      const diff = execSync("git diff", { cwd: this.options.cwd, encoding: "utf-8", maxBuffer: 4 * 1024 * 1024 });
      if (!stat.trim()) {
        process2.stdout.write(c.dim("  working tree is clean") + "\n");
        return;
      }
      process2.stdout.write("\n" + c.dim(stat.trimEnd()) + "\n\n");
      for (const line of diff.split("\n").slice(0, 200)) {
        const painted = line.startsWith("+") ? c.green(line) : line.startsWith("-") ? c.red(line) : line.startsWith("@@") ? c.cyan(line) : c.dim(line);
        process2.stdout.write(`  ${painted}
`);
      }
      process2.stdout.write("\n");
    } catch {
      process2.stdout.write(c.dim("  not a git repository") + "\n");
    }
  }
  showCost() {
    const prompt = this.totalUsage.promptTokens ?? 0;
    const completion = this.totalUsage.completionTokens ?? 0;
    process2.stdout.write(
      c.dim(`  ${this.turns} turn${this.turns === 1 ? "" : "s"} ${sym.dot} ${prompt} in ${sym.dot} ${completion} out`) + "\n"
    );
  }
  showSessions() {
    const sessions = listSessions().filter((session) => session.cwd === this.options.cwd).slice(0, 10);
    if (!sessions.length) {
      process2.stdout.write(c.dim("  no sessions for this directory") + "\n");
      return;
    }
    process2.stdout.write("\n");
    sessions.forEach((session, index) => {
      const messages = session.messages.filter((message) => message.role === "user").length;
      const current = session.id === this.sessionId ? c.cyan("*") : " ";
      process2.stdout.write(
        `  ${current} ${index + 1}. ${new Date(session.createdAt).toLocaleString()} ${c.dim(`${messages} messages ${sym.dot} ${session.mode}`)}
`
      );
    });
    process2.stdout.write("\n" + c.dim("  /resume <number> to load one") + "\n");
  }
  resume(argument) {
    const sessions = listSessions().filter((session2) => session2.cwd === this.options.cwd);
    const index = Number(argument) - 1;
    const session = sessions[index];
    if (!session) {
      process2.stdout.write(c.dim("  usage: /resume <number from /sessions>") + "\n");
      return;
    }
    this.sessionId = session.id;
    this.agent.setMode(session.mode ?? "Build");
    this.agent.setHistory(session.messages);
    this.setPrompt();
    process2.stdout.write(`  ${c.green(sym.ok)} resumed ${new Date(session.createdAt).toLocaleString()}
`);
  }
  async compact() {
    this.startSpinner();
    try {
      const summary = await this.agent.compact();
      this.stopSpinner();
      process2.stdout.write(c.dim(`  compacted to ${summary.length} characters`) + "\n");
    } catch (err) {
      this.stopSpinner();
      process2.stdout.write(`  ${c.red("error")} ${err?.message ?? err}
`);
    }
    this.persist();
  }
  setMode(argument) {
    const wanted = argument.toLowerCase();
    if (!wanted) {
      const next = MODES[(MODES.indexOf(this.agent.getMode()) + 1) % MODES.length];
      this.agent.setMode(next);
    } else {
      const match2 = MODES.find((mode) => mode.toLowerCase() === wanted);
      if (!match2) {
        process2.stdout.write(c.dim("  modes: build, plan, review, fast") + "\n");
        return;
      }
      this.agent.setMode(match2);
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
      ["/init", "write an AGENTS.md for this project"],
      ["/commands", "list custom commands from .eschaton/commands"],
      ["/todos", "show the task list"],
      ["/permissions", "show allow and deny rules"],
      ["/skills", "list loaded skills"],
      ["/diff", "show the working tree diff"],
      ["/undo", "revert the last file the agent changed"],
      ["/compact", "summarize the conversation to free context"],
      ["/cost", "tokens used in this session"],
      ["/sessions", "list saved sessions for this directory"],
      ["/resume <n>", "load a saved session"],
      ["/clear", "forget the conversation"],
      ["/exit", "leave"]
    ];
    process2.stdout.write("\n");
    for (const [command, description] of rows) {
      process2.stdout.write(`  ${c.cyan(command.padEnd(16))} ${c.dim(description)}
`);
    }
    process2.stdout.write(
      "\n" + c.dim("  Anything else is sent to the agent. End a line with \\ to continue on the next line.") + "\n" + c.dim("  @path adds a file to the prompt, !command runs a shell command.") + "\n" + c.dim("  Tool calls that write files or run commands ask for confirmation first.") + "\n\n"
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
import fs11 from "node:fs";
import path11 from "node:path";
import { execFile, spawn } from "node:child_process";
import { fileURLToPath as fileURLToPath2 } from "node:url";
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
  const root = path11.resolve(options.cwd);
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
  function runGit(args) {
    return new Promise((resolve) => {
      execFile(
        "git",
        args,
        { cwd: root, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
        (error, stdout, stderr) => {
          const code = error ? typeof error.code === "number" ? error.code : 1 : 0;
          resolve({ code, out: String(stdout ?? ""), err: String(stderr ?? "") });
        }
      );
    });
  }
  async function handle(req, res) {
    const url2 = new URL(req.url ?? "/", "http://127.0.0.1");
    const route = url2.pathname;
    if (route === "/api/state") {
      return sendJson(res, 200, {
        cwd: root,
        name: path11.basename(root),
        model: pool.active()?.model ?? null,
        provider: pool.active()?.label ?? null,
        providers: pool.list().map((provider) => ({
          id: provider.id,
          label: provider.label,
          model: provider.model,
          local: provider.local
        })),
        sessions: listSessions().filter((session) => path11.resolve(session.cwd) === root).slice(0, 20).map((session) => ({
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
      const entries = fs11.readdirSync(target, { withFileTypes: true }).filter((entry) => !entry.name.startsWith(".")).map((entry) => ({
        name: entry.name,
        path: path11.relative(root, path11.join(target, entry.name)).replace(/\\/g, "/"),
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
      if (!fs11.existsSync(target) || fs11.statSync(target).isDirectory()) {
        return sendJson(res, 404, { error: "file not found" });
      }
      if (fs11.statSync(target).size > MAX_FILE_BYTES) return sendJson(res, 413, { error: "file is too large" });
      return sendJson(res, 200, { path: relative, content: fs11.readFileSync(target, "utf-8") });
    }
    if (route === "/api/file" && req.method === "PUT") {
      const body = await readJson2(req);
      const target = safePath(root, body.path);
      if (!target) return sendJson(res, 400, { error: "path outside the workspace" });
      fs11.mkdirSync(path11.dirname(target), { recursive: true });
      fs11.writeFileSync(target, body.content ?? "", "utf-8");
      return sendJson(res, 200, { ok: true });
    }
    if (route === "/api/file" && req.method === "POST") {
      const body = await readJson2(req);
      const target = safePath(root, body.path);
      if (!target) return sendJson(res, 400, { error: "path outside the workspace" });
      if (fs11.existsSync(target)) return sendJson(res, 409, { error: "already exists" });
      if (body.dir) {
        fs11.mkdirSync(target, { recursive: true });
      } else {
        fs11.mkdirSync(path11.dirname(target), { recursive: true });
        fs11.writeFileSync(target, "", "utf-8");
      }
      return sendJson(res, 200, { ok: true });
    }
    if (route === "/api/file" && req.method === "DELETE") {
      const target = safePath(root, url2.searchParams.get("path") ?? "");
      if (!target || target === root) return sendJson(res, 400, { error: "path outside the workspace" });
      if (!fs11.existsSync(target)) return sendJson(res, 404, { error: "not found" });
      fs11.rmSync(target, { recursive: true, force: true });
      return sendJson(res, 200, { ok: true });
    }
    if (route === "/api/rename" && req.method === "POST") {
      const body = await readJson2(req);
      const from = safePath(root, body.from);
      const to = safePath(root, body.to);
      if (!from || !to) return sendJson(res, 400, { error: "path outside the workspace" });
      if (!fs11.existsSync(from)) return sendJson(res, 404, { error: "not found" });
      if (fs11.existsSync(to)) return sendJson(res, 409, { error: "target already exists" });
      fs11.mkdirSync(path11.dirname(to), { recursive: true });
      fs11.renameSync(from, to);
      return sendJson(res, 200, { ok: true });
    }
    if (route === "/api/search") {
      const query = (url2.searchParams.get("q") ?? "").trim();
      if (!query) return sendJson(res, 200, { results: [] });
      const results = [];
      const files = [];
      walk(root, files);
      for (const relative of files) {
        if (results.length >= 200) break;
        const file = path11.join(root, relative);
        try {
          if (fs11.statSync(file).size > 512 * 1024) continue;
          const content = fs11.readFileSync(file, "utf-8");
          if (content.includes("\0")) continue;
          content.split("\n").forEach((text, index) => {
            if (results.length < 200 && text.toLowerCase().includes(query.toLowerCase())) {
              results.push({ path: relative, line: index + 1, text: text.trim().slice(0, 200) });
            }
          });
        } catch {
        }
      }
      return sendJson(res, 200, { results });
    }
    if (route === "/api/git/status") {
      const { code, out } = await runGit(["status", "--porcelain=v1", "-b"]);
      if (code !== 0) return sendJson(res, 200, { isRepo: false });
      const lines = out.split("\n").filter(Boolean);
      const header = lines.shift() ?? "";
      const branch = header.replace(/^##\s*/, "").split("...")[0]?.split(" ")[0] ?? "HEAD";
      const ahead = Number(header.match(/ahead (\d+)/)?.[1] ?? 0);
      const behind = Number(header.match(/behind (\d+)/)?.[1] ?? 0);
      const files = lines.map((line) => {
        const index = line[0] ?? " ";
        const work = line[1] ?? " ";
        const file = line.slice(3).trim();
        const status = index !== " " && index !== "?" ? index : work;
        return { path: file, status, staged: index !== " " && index !== "?" };
      });
      return sendJson(res, 200, { isRepo: true, branch, ahead, behind, files });
    }
    if (route === "/api/git/diff") {
      const file = url2.searchParams.get("path") ?? "";
      const staged = url2.searchParams.get("staged") === "1";
      const args = staged ? ["diff", "--cached", "--", file] : ["diff", "--", file];
      const { out } = await runGit(args);
      return sendJson(res, 200, { diff: out });
    }
    if (route === "/api/git/stage" && req.method === "POST") {
      const body = await readJson2(req);
      const args = body.staged ? ["add", "--", body.path] : ["restore", "--staged", "--", body.path];
      const { code, err } = await runGit(args);
      return sendJson(res, code === 0 ? 200 : 500, { ok: code === 0, error: err });
    }
    if (route === "/api/git/commit" && req.method === "POST") {
      const body = await readJson2(req);
      if (!body.message?.trim()) return sendJson(res, 400, { error: "empty message" });
      const { code, out, err } = await runGit(["commit", "-m", body.message]);
      return sendJson(res, code === 0 ? 200 : 500, { ok: code === 0, output: out + err });
    }
    if (route === "/api/git/branches") {
      const { out } = await runGit(["branch", "--format=%(refname:short)"]);
      return sendJson(res, 200, { branches: out.split("\n").filter(Boolean) });
    }
    if (route === "/api/git/sync" && req.method === "POST") {
      const pull = await runGit(["pull", "--rebase", "--autostash"]);
      const push = await runGit(["push"]);
      return sendJson(res, 200, { output: [pull.out, pull.err, push.out, push.err].filter(Boolean).join("\n") });
    }
    if (route === "/api/model" && req.method === "POST") {
      const body = await readJson2(req);
      pool.setModel(body.model);
      return sendJson(res, 200, { model: pool.active()?.model });
    }
    if (route === "/api/exec" && req.method === "POST") {
      const body = await readJson2(req);
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
      const body = await readJson2(req);
      return chat(res, body);
    }
    if (route === "/api/approve" && req.method === "POST") {
      const body = await readJson2(req);
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
          onToolStart: (call, preview) => emit(res, { type: "tool", name: call.name, preview: publicPreview(preview) }),
          onToolEnd: (toolResult) => emit(res, {
            type: "tool_end",
            name: toolResult.tool,
            isError: toolResult.isError,
            output: toolResult.output.slice(0, 2e3)
          })
        },
        {
          signal: controller.signal,
          approve: body.autoApprove ? void 0 : (call, preview) => askApproval(res, approvals, call.name, publicPreview(preview))
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
    const target = path11.join(publicDir, clean);
    if (!target.startsWith(publicDir) || !fs11.existsSync(target) || fs11.statSync(target).isDirectory()) {
      return sendJson(res, 404, { error: "not found" });
    }
    res.writeHead(200, { "Content-Type": MIME[path11.extname(target)] ?? "application/octet-stream" });
    fs11.createReadStream(target).pipe(res);
  }
  function walk(dir, out) {
    if (out.length >= MAX_FILES) return;
    for (const entry of fs11.readdirSync(dir, { withFileTypes: true })) {
      if (out.length >= MAX_FILES) return;
      if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
      const full = path11.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else out.push(path11.relative(root, full).replace(/\\/g, "/"));
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
  const target = path11.resolve(root, relative);
  const normalizedRoot = root.endsWith(path11.sep) ? root : root + path11.sep;
  return target === root || target.startsWith(normalizedRoot) ? target : null;
}
function findPublicDir() {
  const here = path11.dirname(fileURLToPath2(import.meta.url));
  const candidates = [path11.join(here, "public"), path11.join(here, "../public"), path11.join(here, "web")];
  for (const candidate of candidates) {
    if (fs11.existsSync(path11.join(candidate, "index.html"))) return candidate;
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
function readJson2(req) {
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

// src/mcp.ts
import os6 from "node:os";
import path12 from "node:path";
import { spawn as spawn2 } from "node:child_process";
var GLOBAL_FILE2 = path12.join(os6.homedir(), ".eschaton", "mcp.json");
var McpConnection = class {
  child;
  nextId = 1;
  pending = /* @__PURE__ */ new Map();
  buffer = "";
  stderr = "";
  closed = false;
  constructor(command, args, cwd, env = {}) {
    const line = [command, ...args].join(" ");
    this.child = spawn2(line, {
      cwd,
      shell: true,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...env }
    });
    this.child.stdout?.on("data", (chunk) => this.onData(String(chunk)));
    this.child.stderr?.on("data", (chunk) => {
      this.stderr = (this.stderr + String(chunk)).slice(-2e3);
    });
    this.child.on("close", () => {
      this.closed = true;
      for (const [, item] of this.pending) item.reject(new Error(`MCP server exited. ${this.stderr}`.trim()));
      this.pending.clear();
    });
  }
  onData(chunk) {
    this.buffer += chunk;
    let newline = this.buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      newline = this.buffer.indexOf("\n");
      if (!line) continue;
      try {
        const message = JSON.parse(line);
        if (typeof message.id === "number" && this.pending.has(message.id)) {
          const item = this.pending.get(message.id);
          this.pending.delete(message.id);
          if (message.error) item.reject(new Error(message.error.message ?? "MCP error"));
          else item.resolve(message.result);
        }
      } catch {
      }
    }
  }
  request(method, params, timeoutMs = 2e4) {
    if (this.closed) return Promise.reject(new Error("MCP server is not running"));
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP ${method} timed out. ${this.stderr}`.trim()));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        }
      });
      this.child.stdin?.write(`${payload}
`);
    });
  }
  notify(method, params) {
    this.child.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}
`);
  }
  close() {
    try {
      this.child.kill();
    } catch {
    }
  }
};
function loadConfig(cwd) {
  const servers = {};
  for (const file of [GLOBAL_FILE2, path12.join(cwd, ".eschaton", "mcp.json")]) {
    const raw = readJson(file);
    if (!raw?.servers || typeof raw.servers !== "object") continue;
    for (const [name, config] of Object.entries(raw.servers)) {
      if (!config?.command) continue;
      servers[name] = {
        command: String(config.command),
        args: Array.isArray(config.args) ? config.args.map(String) : [],
        env: config.env && typeof config.env === "object" ? config.env : void 0
      };
    }
  }
  return servers;
}
async function connectMcp(cwd) {
  const bundle = { tools: [], handlers: {}, servers: [], close: () => {
  } };
  const connections = [];
  const configs = loadConfig(cwd);
  bundle.close = () => connections.forEach((connection) => connection.close());
  for (const [name, config] of Object.entries(configs)) {
    const connection = new McpConnection(config.command, config.args ?? [], cwd, config.env);
    connections.push(connection);
    try {
      await connection.request("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "eschaton-code", version: "3.3.0" }
      });
      connection.notify("notifications/initialized");
      const listing = await connection.request("tools/list", {});
      const tools = Array.isArray(listing?.tools) ? listing.tools : [];
      for (const tool of tools) {
        const original = tool.name;
        const exposed = `mcp__${sanitize(name)}__${sanitize(original)}`;
        bundle.tools.push({
          type: "function",
          function: {
            name: exposed,
            description: `[${name}] ${tool.description ?? original}`,
            parameters: tool.inputSchema ?? { type: "object", properties: {} }
          }
        });
        bundle.handlers[exposed] = async (args) => {
          const result = await connection.request("tools/call", { name: original, arguments: args }, 12e4);
          const content = Array.isArray(result?.content) ? result.content : [];
          const text = content.map((item) => item?.type === "text" ? item.text : item?.type ? `[${item.type}]` : "").filter(Boolean).join("\n");
          if (result?.isError) throw new Error(text || "MCP tool failed");
          return text || "(no output)";
        };
      }
      bundle.servers.push({ name, tools: tools.length });
    } catch (err) {
      connection.close();
      bundle.servers.push({ name, tools: 0, error: String(err?.message ?? err) });
    }
  }
  return bundle;
}
function sanitize(name) {
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

// src/cli.ts
var VERSION = "3.4.0";
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
  (none)                    start the terminal agent in this directory
  ide [--port 4123]         open the browser IDE instead
  chat                      start the terminal agent (same as no command)
  -p, --print "<prompt>"    run one prompt, print the answer and exit
  doctor                    show detected models and settings
  setup                     show how to connect a model
  login <provider> <key>    save a key: deepseek, openrouter, groq, custom

Options:
  --port <n>                IDE port (default ${DEFAULT_PORT})
  --no-open                 do not open a browser
  -m, --model <name>        override the model for this session
  --mode <name>             build, plan, review or fast
  --yes                     allow edits and commands without asking (-p only)
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
async function runPrint(prompt, argv) {
  const model = flag(argv, "-m", "--model");
  const mode = parseMode(flag(argv, "--mode"));
  const yes = argv.includes("--yes");
  const pool = new ProviderPool(providersFromSettings());
  if (model) pool.setModel(model);
  await pool.detectLocal();
  if (!pool.list().length) {
    process3.stdout.write(setupText());
    return 1;
  }
  const mcp = await connectMcp(process3.cwd());
  process3.on("exit", () => mcp.close());
  const agent = new CodingAgent(pool, process3.cwd(), mode ?? "Build", {
    policy: loadPolicy(process3.cwd()),
    hooks: loadHooks(process3.cwd()),
    extraTools: mcp.tools,
    extraHandlers: mcp.handlers
  });
  let wrote = false;
  try {
    const result = await agent.run(
      prompt,
      {
        onToken: (token) => {
          wrote = true;
          process3.stdout.write(token);
        }
      },
      {
        approve: async () => yes
      }
    );
    if (!wrote && result.text) process3.stdout.write(result.text);
    process3.stdout.write("\n");
    return 0;
  } catch (err) {
    if (wrote) process3.stdout.write("\n");
    process3.stderr.write(`eschaton: ${err?.message ?? err}
`);
    return 1;
  }
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
  const mcp = await connectMcp(process3.cwd());
  process3.on("exit", () => mcp.close());
  if (mcp.servers.length) {
    const summary = mcp.servers.map((server) => server.error ? `${server.name}: ${server.error}` : `${server.name} (${server.tools})`).join(" \xB7 ");
    process3.stdout.write(`${c.dim("  mcp     ")} ${summary}
`);
  }
  const ui = new TerminalUI(pool, {
    version: VERSION,
    cwd: process3.cwd(),
    mode,
    resume,
    agentOptions: {
      policy: loadPolicy(process3.cwd()),
      hooks: loadHooks(process3.cwd()),
      extraTools: mcp.tools,
      extraHandlers: mcp.handlers
    }
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
  const printIndex = argv.findIndex((arg) => arg === "-p" || arg === "--print");
  if (printIndex >= 0) {
    const prompt = argv[printIndex + 1];
    if (!prompt) {
      process3.stderr.write('usage: eschaton -p "<prompt>"\n');
      return 1;
    }
    return runPrint(prompt, argv);
  }
  if (command === "setup") {
    process3.stdout.write(setupText());
    return 0;
  }
  if (command === "ide" || argv.includes("--ide")) {
    return runIde(command === "ide" ? argv.slice(1) : argv);
  }
  return runChat(argv);
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
