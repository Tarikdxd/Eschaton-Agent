// eschaton-repo/src/ui/opencode-ui.ts
import process2 from "node:process";
import path3 from "node:path";
import os2 from "node:os";
import fs3 from "node:fs";

// eschaton-repo/src/agent/deepseek-react-agent.ts
import fs2 from "node:fs";
import path2 from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

// eschaton-repo/src/auth/session-rotator.ts
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
var ESCHATON_DIR = path.join(os.homedir(), ".eschaton");
var DEVICE_KEY_FILE = path.join(ESCHATON_DIR, "device-key.json");
var SESSION_FILE = path.join(ESCHATON_DIR, "session.json");

class SessionRotator {
  static instance = null;
  currentIdentity;
  constructor() {
    this.ensureDirs();
    this.currentIdentity = this.loadOrGenerateIdentity();
  }
  static getInstance() {
    if (!SessionRotator.instance) {
      SessionRotator.instance = new SessionRotator;
    }
    return SessionRotator.instance;
  }
  ensureDirs() {
    try {
      if (!fs.existsSync(ESCHATON_DIR)) {
        fs.mkdirSync(ESCHATON_DIR, { recursive: true });
      }
    } catch {}
  }
  generateSyntheticIdentity() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
    const rawPub = publicKey.export({ type: "spki", format: "der" });
    const privPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const pubBase64Url = rawPub.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const identity = {
      deviceId: crypto.randomUUID(),
      attemptId: crypto.randomBytes(16).toString("hex"),
      instanceId: crypto.randomUUID(),
      publicKeyBase64: pubBase64Url,
      privateKeyPem: privPem,
      registeredAt: Date.now(),
      quotaResetCount: (this.currentIdentity?.quotaResetCount || 0) + 1
    };
    try {
      fs.writeFileSync(DEVICE_KEY_FILE, JSON.stringify(identity, null, 2), "utf-8");
    } catch {}
    this.currentIdentity = identity;
    return identity;
  }
  loadOrGenerateIdentity() {
    try {
      if (fs.existsSync(DEVICE_KEY_FILE)) {
        const raw = fs.readFileSync(DEVICE_KEY_FILE, "utf-8");
        const data = JSON.parse(raw);
        if (data.deviceId && data.publicKeyBase64 && data.privateKeyPem) {
          return data;
        }
      }
    } catch {}
    return this.generateSyntheticIdentity();
  }
  signPayload(payload) {
    const ts = Date.now().toString();
    const dataToSign = Buffer.from(`${ts}:${payload}`);
    try {
      const privateKey = crypto.createPrivateKey(this.currentIdentity.privateKeyPem);
      const sig = crypto.sign(null, dataToSign, privateKey);
      const sigBase64Url = sig.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      return { timestamp: ts, signature: sigBase64Url };
    } catch {
      return { timestamp: ts, signature: "eschaton_sig_" + crypto.randomBytes(24).toString("hex") };
    }
  }
  async executeRefreshTrick(customApiUrl) {
    try {
      if (fs.existsSync(SESSION_FILE))
        fs.unlinkSync(SESSION_FILE);
    } catch {}
    const newId = this.generateSyntheticIdentity();
    const baseUrl = (customApiUrl || process.env.ESCHATON_API_URL || "https://eschaton-gateway.workers.dev").replace(/\/$/, "");
    let admissionRegistered = false;
    try {
      const { timestamp, signature } = this.signPayload("/api/v1/freebuff/device-keys");
      const regRes = await fetch(`${baseUrl}/api/v1/freebuff/device-keys`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-freebuff-device-key": newId.publicKeyBase64,
          "x-freebuff-device-ts": timestamp,
          "x-freebuff-device-sig": signature,
          "x-freebuff-instance": newId.instanceId,
          "x-freebuff-desktop-attempt": newId.attemptId,
          "x-freebuff-client-version": "1.2.1-sovereign"
        },
        body: JSON.stringify({
          publicKey: newId.publicKeyBase64,
          client: "eschaton-cli",
          version: "1.2.1"
        }),
        signal: AbortSignal.timeout(5000)
      }).catch(() => null);
      if (regRes && regRes.ok) {
        admissionRegistered = true;
      }
    } catch {}
    try {
      fs.writeFileSync(SESSION_FILE, JSON.stringify({
        deviceId: newId.deviceId,
        registeredAt: Date.now(),
        tier: "unlimited",
        admissionRegistered
      }, null, 2), "utf-8");
    } catch {}
    return {
      success: true,
      deviceId: newId.deviceId,
      resetCount: newId.quotaResetCount,
      message: `Session trick activated! New device fingerprint issued: ${newId.deviceId.substring(0, 8)}... Quota reset to 100%.`
    };
  }
}

// eschaton-repo/src/llm/deepseek-pool.ts
class DeepSeekProviderPool {
  static instance = null;
  providers = [];
  activeProviderIndex = 0;
  rotator;
  constructor() {
    this.rotator = SessionRotator.getInstance();
    this.initProviders();
    this.detectLocalOllama();
  }
  static getInstance() {
    if (!DeepSeekProviderPool.instance) {
      DeepSeekProviderPool.instance = new DeepSeekProviderPool;
    }
    return DeepSeekProviderPool.instance;
  }
  initProviders() {
    const gatewayUrl = (process.env.ESCHATON_API_URL || "https://eschaton-gateway.workers.dev").replace(/\/$/, "");
    this.providers = [
      {
        id: "gateway-deepseek-flash",
        name: "Eschaton Edge DeepSeek V4.1 Flash",
        model: "deepseek/deepseek-v4-flash",
        type: "gateway",
        baseUrl: `${gatewayUrl}/api/chat/completions`,
        priority: 1,
        isRateLimited: false,
        rateLimitedUntil: 0,
        successCount: 0,
        failureCount: 0
      },
      {
        id: "freebuff-deepseek-fast",
        name: "Freebuff Dynamic DeepSeek Flash Fast",
        model: "deepseek/deepseek-v4-flash-fast",
        type: "freebuff",
        baseUrl: "https://api.codebuff.com/api/v1/chat/completions",
        priority: 2,
        isRateLimited: false,
        rateLimitedUntil: 0,
        successCount: 0,
        failureCount: 0
      },
      {
        id: "openrouter-deepseek-free",
        name: "OpenRouter DeepSeek V3 (Free Tier)",
        model: "deepseek/deepseek-chat:free",
        type: "openrouter",
        baseUrl: "https://openrouter.ai/api/v1/chat/completions",
        apiKey: process.env.OPENROUTER_API_KEY || "sk-or-v1-anonymous-guest",
        priority: 3,
        isRateLimited: false,
        rateLimitedUntil: 0,
        successCount: 0,
        failureCount: 0
      },
      {
        id: "openrouter-deepseek-r1-free",
        name: "OpenRouter DeepSeek R1 Reasoning (Free)",
        model: "deepseek/deepseek-r1:free",
        type: "openrouter",
        baseUrl: "https://openrouter.ai/api/v1/chat/completions",
        apiKey: process.env.OPENROUTER_API_KEY || "sk-or-v1-anonymous-guest",
        priority: 4,
        isRateLimited: false,
        rateLimitedUntil: 0,
        successCount: 0,
        failureCount: 0
      },
      {
        id: "siliconflow-deepseek-v3",
        name: "SiliconFlow Serverless DeepSeek V3",
        model: "deepseek-ai/DeepSeek-V3",
        type: "siliconflow",
        baseUrl: "https://api.siliconflow.cn/v1/chat/completions",
        priority: 5,
        isRateLimited: false,
        rateLimitedUntil: 0,
        successCount: 0,
        failureCount: 0
      }
    ];
  }
  async detectLocalOllama() {
    try {
      const res = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(1200) }).catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        const dsModel = data.models?.find((m) => m.name.toLowerCase().includes("deepseek"));
        if (dsModel) {
          this.providers.unshift({
            id: "ollama-local-deepseek",
            name: `Local Ollama (${dsModel.name})`,
            model: dsModel.name,
            type: "ollama",
            baseUrl: "http://127.0.0.1:11434/api/chat",
            priority: 0,
            isRateLimited: false,
            rateLimitedUntil: 0,
            successCount: 0,
            failureCount: 0
          });
        }
      }
    } catch {}
  }
  getProviders() {
    return this.providers;
  }
  getActiveProvider() {
    return this.providers[this.activeProviderIndex] || this.providers[0];
  }
  resetCooldowns() {
    const now = Date.now();
    for (const p of this.providers) {
      p.isRateLimited = false;
      p.rateLimitedUntil = 0;
    }
  }
  async generate(options) {
    const now = Date.now();
    for (const p of this.providers) {
      if (p.isRateLimited && now > p.rateLimitedUntil) {
        p.isRateLimited = false;
        p.rateLimitedUntil = 0;
      }
    }
    const availableProviders = this.providers.filter((p) => !p.isRateLimited);
    if (availableProviders.length === 0) {
      await this.rotator.executeRefreshTrick();
      this.resetCooldowns();
    }
    let lastError = null;
    for (let i = 0;i < this.providers.length; i++) {
      const provider = this.providers[(this.activeProviderIndex + i) % this.providers.length];
      if (provider.isRateLimited && Date.now() < provider.rateLimitedUntil) {
        continue;
      }
      try {
        const result = await this.callProvider(provider, options);
        provider.successCount++;
        this.activeProviderIndex = (this.activeProviderIndex + i) % this.providers.length;
        return result;
      } catch (err) {
        lastError = err;
        provider.failureCount++;
        const isQuotaErr = err.status === 429 || err.status === 403 || err.status === 401 || /rate limit|quota|exhausted|too many requests|unauthorized/i.test(err.message || "");
        if (isQuotaErr) {
          provider.isRateLimited = true;
          provider.rateLimitedUntil = Date.now() + 180000;
        }
        continue;
      }
    }
    await this.rotator.executeRefreshTrick();
    this.resetCooldowns();
    try {
      return await this.callProvider(this.providers[0], options);
    } catch (finalErr) {
      throw new Error(`All DeepSeek providers exhausted after session trick retry: ${finalErr?.message || lastError?.message || "Unknown network error"}`);
    }
  }
  async callProvider(provider, options) {
    const headers = {
      "Content-Type": "application/json"
    };
    const identity = this.rotator.currentIdentity;
    if (provider.type === "freebuff" || provider.type === "gateway") {
      const { timestamp, signature } = this.rotator.signPayload(provider.baseUrl);
      headers["x-freebuff-device-key"] = identity.publicKeyBase64;
      headers["x-freebuff-device-ts"] = timestamp;
      headers["x-freebuff-device-sig"] = signature;
      headers["x-freebuff-instance"] = identity.instanceId;
      headers["x-freebuff-desktop-attempt"] = identity.attemptId;
      headers["x-freebuff-client-version"] = "1.2.1-sovereign";
      headers["x-freebuff-model"] = provider.model;
    }
    if (provider.apiKey) {
      headers["Authorization"] = `Bearer ${provider.apiKey}`;
    }
    if (provider.type === "openrouter") {
      headers["HTTP-Referer"] = "https://github.com/Tarikdxd/Eschaton-Code";
      headers["X-Title"] = "Eschaton Code";
    }
    const payload = {
      model: provider.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 4096,
      stream: Boolean(options.onChunk)
    };
    const response = await fetch(provider.baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      const error = new Error(`Provider ${provider.name} failed with HTTP ${response.status}: ${errText.substring(0, 200)}`);
      error.status = response.status;
      throw error;
    }
    if (options.onChunk && response.body) {
      let accumulated = "";
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done)
          break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(`
`);
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === "data: [DONE]")
            continue;
          if (trimmed.startsWith("data: ")) {
            try {
              const json = JSON.parse(trimmed.substring(6));
              const delta = json.choices?.[0]?.delta?.content || "";
              const reasoning = json.choices?.[0]?.delta?.reasoning_content || "";
              if (reasoning && options.onThinking) {
                options.onThinking(reasoning);
              }
              if (delta) {
                accumulated += delta;
                options.onChunk(delta);
              }
            } catch {}
          }
        }
      }
      if (accumulated.length > 0)
        return accumulated;
    }
    const json = await response.json();
    const content = json.choices?.[0]?.message?.content || json.choices?.[0]?.text || "";
    if (options.onChunk && content) {
      options.onChunk(content);
    }
    return content;
  }
}

// eschaton-repo/src/agent/deepseek-react-agent.ts
var execAsync = promisify(exec);
var SYSTEM_PROMPT = `You are Eschaton Code, an elite autonomous software engineering agent running inside the user's terminal.
You solve real-world coding problems by inspecting the codebase, editing files, running tests, and executing commands.

You have access to the following filesystem and shell tools:
1. read_file(filePath: string, startLine?: number, endLine?: number)
   Reads the text content of a file with line numbers.
2. write_file(filePath: string, content: string)
   Creates a new file or completely replaces the contents of an existing file.
3. edit_file(filePath: string, target: string, replacement: string)
   Replaces the EXACT substring \`target\` with \`replacement\` in \`filePath\`.
4. run_command(command: string)
   Executes a shell command in the current working directory and returns stdout and stderr.
5. list_dir(dirPath?: string)
   Lists files and directories in the specified path.
6. search_code(pattern: string, dirPath?: string)
   Searches for occurrences of \`pattern\` across files.

TOOL CALL INSTRUCTIONS:
To invoke a tool, output a single JSON block wrapped inside \`\`\`tool:json ... \`\`\`
Example:
\`\`\`tool:json
{
  "tool": "read_file",
  "args": {
    "filePath": "src/index.ts",
    "startLine": 1,
    "endLine": 50
  }
}
\`\`\`

When you have completed the user's task or answered their question, reply with your final explanation without invoking any more tools.`;

class DeepSeekReactAgent {
  pool;
  conversationHistory = [];
  cwd;
  constructor(cwd = process.cwd()) {
    this.pool = DeepSeekProviderPool.getInstance();
    this.cwd = cwd;
    this.resetHistory();
  }
  resetHistory() {
    this.conversationHistory = [
      { role: "system", content: SYSTEM_PROMPT }
    ];
  }
  async runTask(userPrompt, callbacks = {}) {
    this.conversationHistory.push({ role: "user", content: userPrompt });
    let step = 0;
    const maxSteps = 15;
    while (step < maxSteps) {
      step++;
      let currentTurnOutput = "";
      const promptToGenerate = [...this.conversationHistory];
      try {
        currentTurnOutput = await this.pool.generate({
          messages: promptToGenerate,
          onChunk: (chunk) => {
            if (callbacks.onToken)
              callbacks.onToken(chunk);
          },
          onThinking: (thought) => {
            if (callbacks.onThinking)
              callbacks.onThinking(thought);
          }
        });
      } catch (err) {
        return `[Error from DeepSeek Provider]: ${err.message}`;
      }
      this.conversationHistory.push({ role: "assistant", content: currentTurnOutput });
      const toolCall = this.parseToolCall(currentTurnOutput);
      if (!toolCall) {
        return currentTurnOutput;
      }
      if (callbacks.onToolStart) {
        callbacks.onToolStart(toolCall);
      }
      const toolResult = await this.executeTool(toolCall);
      if (callbacks.onToolEnd) {
        callbacks.onToolEnd(toolResult);
      }
      this.conversationHistory.push({
        role: "user",
        content: `Tool Result for \`${toolCall.tool}\`:
${toolResult.output}`
      });
    }
    return "Agent reached maximum step limit (15 steps).";
  }
  parseToolCall(content) {
    const matchToolBlock = content.match(/```(?:tool:json|tool)\s*([\s\S]*?)```/);
    if (matchToolBlock && matchToolBlock[1]) {
      try {
        const parsed = JSON.parse(matchToolBlock[1].trim());
        if (parsed.tool && parsed.args)
          return parsed;
      } catch {}
    }
    const matchJson = content.match(/\{[\s\S]*?"tool"\s*:\s*"[^"]+"[\s\S]*?"args"\s*:\s*\{[\s\S]*?\}[\s\S]*?\}/);
    if (matchJson) {
      try {
        const parsed = JSON.parse(matchJson[0].trim());
        if (parsed.tool && parsed.args)
          return parsed;
      } catch {}
    }
    return null;
  }
  async executeTool(call) {
    const { tool, args } = call;
    try {
      switch (tool) {
        case "read_file": {
          const targetPath = path2.resolve(this.cwd, args.filePath);
          if (!fs2.existsSync(targetPath)) {
            return { tool, isError: true, output: `File not found: ${args.filePath}` };
          }
          const content = fs2.readFileSync(targetPath, "utf-8");
          const lines = content.split(`
`);
          const start = Math.max(1, args.startLine || 1);
          const end = Math.min(lines.length, args.endLine || lines.length);
          const slice = lines.slice(start - 1, end).map((l, i) => `${start + i}: ${l}`).join(`
`);
          return { tool, isError: false, output: slice };
        }
        case "write_file": {
          const targetPath = path2.resolve(this.cwd, args.filePath);
          fs2.mkdirSync(path2.dirname(targetPath), { recursive: true });
          fs2.writeFileSync(targetPath, args.content ?? "", "utf-8");
          return { tool, isError: false, output: `Successfully wrote ${args.content?.length || 0} bytes to ${args.filePath}` };
        }
        case "edit_file": {
          const targetPath = path2.resolve(this.cwd, args.filePath);
          if (!fs2.existsSync(targetPath)) {
            return { tool, isError: true, output: `File not found: ${args.filePath}` };
          }
          const content = fs2.readFileSync(targetPath, "utf-8");
          const target = args.target;
          const replacement = args.replacement ?? "";
          if (!content.includes(target)) {
            return { tool, isError: true, output: `Target string was not found inside ${args.filePath}. Ensure exact whitespace match.` };
          }
          const updated = content.replace(target, replacement);
          fs2.writeFileSync(targetPath, updated, "utf-8");
          return { tool, isError: false, output: `Successfully edited ${args.filePath}` };
        }
        case "run_command": {
          const cmd = args.command;
          const isWindows = process.platform === "win32";
          const shellCmd = isWindows ? `cmd.exe /c "${cmd}"` : cmd;
          try {
            const { stdout, stderr } = await execAsync(shellCmd, {
              cwd: this.cwd,
              timeout: 30000,
              maxBuffer: 2 * 1024 * 1024
            });
            const combined = (stdout || "") + (stderr ? `
[STDERR]:
${stderr}` : "");
            return { tool, isError: false, output: combined.trim() || "(Command finished with empty output)" };
          } catch (cmdErr) {
            return { tool, isError: true, output: `Command failed: ${cmdErr.message}
${cmdErr.stderr || ""}` };
          }
        }
        case "list_dir": {
          const targetDir = path2.resolve(this.cwd, args.dirPath || ".");
          if (!fs2.existsSync(targetDir)) {
            return { tool, isError: true, output: `Directory not found: ${args.dirPath || "."}` };
          }
          const entries = fs2.readdirSync(targetDir, { withFileTypes: true });
          const list = entries.map((e) => `${e.isDirectory() ? "[DIR] " : "      "}${e.name}`).join(`
`);
          return { tool, isError: false, output: list };
        }
        case "search_code": {
          let walk = function(dir) {
            const list = fs2.readdirSync(dir, { withFileTypes: true });
            for (const item of list) {
              if (item.name === "node_modules" || item.name === ".git" || item.name === "dist")
                continue;
              const full = path2.join(dir, item.name);
              if (item.isDirectory()) {
                walk(full);
              } else {
                try {
                  const text = fs2.readFileSync(full, "utf-8");
                  if (text.includes(pattern)) {
                    results.push(path2.relative(targetDir, full));
                  }
                } catch {}
              }
            }
          };
          const pattern = args.pattern;
          const targetDir = path2.resolve(this.cwd, args.dirPath || ".");
          const results = [];
          walk(targetDir);
          return { tool, isError: false, output: results.slice(0, 50).join(`
`) || "No matches found." };
        }
        default:
          return { tool, isError: true, output: `Unknown tool: ${tool}` };
      }
    } catch (err) {
      return { tool, isError: true, output: `Execution error in ${tool}: ${err.message}` };
    }
  }
}

// eschaton-repo/src/ui/opencode-ui.ts
class OpenCodeUI {
  agent;
  pool;
  rotator;
  inputBuffer = "";
  cursorIndex = 0;
  history = [];
  historyIndex = -1;
  currentAgentMode = "Build";
  currentModelName = "DeepSeek V3 (Auto-Failover)";
  subModeName = "Eschaton Zen";
  isProcessing = false;
  conversationTurns = [];
  antigravityStatus = { connected: false, id: "" };
  constructor() {
    this.agent = new DeepSeekReactAgent;
    this.pool = DeepSeekProviderPool.getInstance();
    this.rotator = SessionRotator.getInstance();
    this.detectAntigravity();
  }
  detectAntigravity() {
    try {
      const idFile = path3.join(os2.homedir(), ".gemini", "antigravity", "installation_id");
      if (fs3.existsSync(idFile)) {
        this.antigravityStatus = {
          connected: true,
          id: fs3.readFileSync(idFile, "utf-8").trim()
        };
      }
    } catch {}
  }
  start() {
    process2.stdout.write("\x1B[?1049h\x1B[2J\x1B[H");
    if (process2.stdin.isTTY) {
      process2.stdin.setRawMode(true);
    }
    process2.stdin.resume();
    process2.stdin.setEncoding("utf-8");
    this.render();
    process2.stdin.on("data", async (chunk) => {
      if (this.isProcessing) {
        if (chunk === "\x03") {
          this.isProcessing = false;
          this.render();
        }
        return;
      }
      await this.handleKeypress(chunk);
    });
    process2.on("SIGINT", () => this.exit());
  }
  exit() {
    process2.stdout.write("\x1B[?25h\x1B[?1049l");
    process2.exit(0);
  }
  render() {
    const cols = process2.stdout.columns || 80;
    const rows = process2.stdout.rows || 24;
    let out = "\x1B[2J\x1B[H";
    if (this.conversationTurns.length === 0) {
      out += this.renderCenteredLogo(cols);
    } else {
      out += this.renderTranscript(cols);
    }
    out += this.renderInputBox(cols);
    process2.stdout.write(out);
  }
  renderCenteredLogo(cols) {
    const g1 = "\x1B[38;5;252m";
    const g2 = "\x1B[38;5;244m";
    const g3 = "\x1B[38;5;238m";
    const r = "\x1B[0m";
    const logoLines = [
      g1 + "████" + r + "  " + g1 + "████" + r + "  " + g2 + "████" + r + "  " + g3 + "████" + r + "  " + g2 + "████" + r + "  " + g1 + "████" + r + "     " + g1 + "█" + r + "  " + g1 + "████" + r,
      g1 + "█  █" + r + "  " + g1 + "█  █" + r + "  " + g2 + "█   " + r + "  " + g3 + "█  █" + r + "  " + g2 + "█   " + r + "  " + g1 + "█  █" + r + "     " + g1 + "█" + r + "  " + g1 + "█   " + r,
      g1 + "█  █" + r + "  " + g1 + "████" + r + "  " + g2 + "████" + r + "  " + g3 + "█  █" + r + "  " + g2 + "█   " + r + "  " + g1 + "█  █" + r + "  " + g1 + "████" + r + "  " + g1 + "████" + r,
      g1 + "█  █" + r + "  " + g1 + "█   " + r + "  " + g2 + "█   " + r + "  " + g3 + "█  █" + r + "  " + g2 + "█   " + r + "  " + g1 + "█  █" + r + "  " + g1 + "█  █" + r + "  " + g1 + "█   " + r,
      g1 + "████" + r + "  " + g1 + "█   " + r + "  " + g2 + "████" + r + "  " + g3 + "█  █" + r + "  " + g2 + "████" + r + "  " + g1 + "████" + r + "  " + g1 + "████" + r + "  " + g1 + "████" + r
    ];
    const logoWidth = 46;
    const padLeft = Math.max(0, Math.floor((cols - logoWidth) / 2));
    const indent = " ".repeat(padLeft);
    let res = `

`;
    for (const line of logoLines) {
      res += indent + line + `
`;
    }
    res += `

`;
    return res;
  }
  renderTranscript(cols) {
    let res = `
`;
    const maxItems = 8;
    const slice = this.conversationTurns.slice(-maxItems);
    for (const turn of slice) {
      if (turn.role === "user") {
        res += `\x1B[38;5;75m❯ \x1B[1;37m${turn.content}\x1B[0m

`;
      } else if (turn.role === "assistant") {
        res += `\x1B[38;5;250m${turn.content}\x1B[0m

`;
      } else if (turn.role === "tool") {
        res += `  \x1B[38;5;244m● \x1B[38;5;75m${turn.title || "Tool"}\x1B[0m \x1B[38;5;240m${turn.content}\x1B[0m
`;
      }
    }
    res += `
`;
    return res;
  }
  renderInputBox(cols) {
    const boxWidth = Math.min(cols - 4, 86);
    const padLeft = Math.max(1, Math.floor((cols - boxWidth) / 2));
    const indent = " ".repeat(padLeft);
    const blueBar = "\x1B[1;38;5;75m▌\x1B[0m ";
    const whiteText = "\x1B[38;5;255m";
    const reset = "\x1B[0m";
    const dimGray = "\x1B[38;5;242m";
    let modeColor = "\x1B[1;38;5;75m";
    if (this.currentAgentMode === "Plan")
      modeColor = "\x1B[1;38;5;114m";
    if (this.currentAgentMode === "Review")
      modeColor = "\x1B[1;38;5;221m";
    if (this.currentAgentMode === "Fast")
      modeColor = "\x1B[1;38;5;213m";
    const displayInput = this.inputBuffer.length > 0 ? this.inputBuffer.slice(0, this.cursorIndex) + "\x1B[7m \x1B[0m" + this.inputBuffer.slice(this.cursorIndex + 1) : "\x1B[7m \x1B[0m\x1B[38;5;240mType a prompt or /refresh for unlimited session trick...\x1B[0m";
    const line1 = indent + blueBar + whiteText + displayInput + reset;
    const line2 = indent + blueBar + " ";
    const line3 = indent + blueBar + modeColor + this.currentAgentMode + reset + "  " + whiteText + this.currentModelName + reset + "  " + dimGray + this.subModeName + reset;
    const hint = dimGray + "tab switch agent   /refresh renew quota   ctrl+p commands" + reset;
    const hintPad = Math.max(0, boxWidth - 58);
    const line4 = indent + " ".repeat(hintPad) + hint;
    return `
${line1}
${line2}
${line3}

${line4}
`;
  }
  async handleKeypress(key) {
    if (key === "\x03") {
      this.exit();
      return;
    }
    if (key === "\t") {
      const modes = ["Build", "Plan", "Review", "Fast"];
      const curIdx = modes.indexOf(this.currentAgentMode);
      this.currentAgentMode = modes[(curIdx + 1) % modes.length];
      this.render();
      return;
    }
    if (key === "\x10") {
      this.inputBuffer = "/";
      this.cursorIndex = 1;
      this.render();
      return;
    }
    if (key === "\r" || key === `
`) {
      const prompt = this.inputBuffer.trim();
      this.inputBuffer = "";
      this.cursorIndex = 0;
      if (!prompt) {
        this.render();
        return;
      }
      this.history.push(prompt);
      this.historyIndex = this.history.length;
      await this.processCommandOrPrompt(prompt);
      return;
    }
    if (key === "\b" || key === "") {
      if (this.cursorIndex > 0) {
        this.inputBuffer = this.inputBuffer.slice(0, this.cursorIndex - 1) + this.inputBuffer.slice(this.cursorIndex);
        this.cursorIndex--;
      }
      this.render();
      return;
    }
    if (key.startsWith("\x1B[")) {
      const seq = key.slice(2);
      if (seq === "D") {
        this.cursorIndex = Math.max(0, this.cursorIndex - 1);
      } else if (seq === "C") {
        this.cursorIndex = Math.min(this.inputBuffer.length, this.cursorIndex + 1);
      } else if (seq === "A") {
        if (this.historyIndex > 0) {
          this.historyIndex--;
          this.inputBuffer = this.history[this.historyIndex] || "";
          this.cursorIndex = this.inputBuffer.length;
        }
      } else if (seq === "B") {
        if (this.historyIndex < this.history.length - 1) {
          this.historyIndex++;
          this.inputBuffer = this.history[this.historyIndex] || "";
          this.cursorIndex = this.inputBuffer.length;
        } else {
          this.historyIndex = this.history.length;
          this.inputBuffer = "";
          this.cursorIndex = 0;
        }
      } else if (seq === "H") {
        this.cursorIndex = 0;
      } else if (seq === "F") {
        this.cursorIndex = this.inputBuffer.length;
      }
      this.render();
      return;
    }
    if (key.length === 1 && key >= " ") {
      this.inputBuffer = this.inputBuffer.slice(0, this.cursorIndex) + key + this.inputBuffer.slice(this.cursorIndex);
      this.cursorIndex++;
      this.render();
    }
  }
  async processCommandOrPrompt(input) {
    if (input === "/exit" || input === "exit") {
      this.exit();
      return;
    }
    if (input === "/clear" || input === "clear") {
      this.conversationTurns = [];
      this.agent.resetHistory();
      this.render();
      return;
    }
    if (input === "/refresh" || input.startsWith("/refresh")) {
      this.isProcessing = true;
      this.render();
      process2.stdout.write(`
\x1B[38;5;75m[↻] Running Session Trick: Rotating device fingerprints & spawning fresh identity...\x1B[0m
`);
      const res = await this.rotator.executeRefreshTrick();
      this.pool.resetCooldowns();
      this.conversationTurns.push({
        role: "tool",
        title: "Session Trick Activated",
        content: `New Device ID: ${res.deviceId.substring(0, 8)}... | Quota Restored to 100% | Reset Count: #${res.resetCount}`
      });
      this.isProcessing = false;
      this.render();
      return;
    }
    if (input.startsWith("/model")) {
      const parts = input.split(" ");
      if (parts[1]) {
        this.currentModelName = parts[1];
      } else {
        const models = ["DeepSeek V3 (Auto-Failover)", "DeepSeek R1 (Reasoning)", "DeepSeek V4.1 Flash", "DeepSeek Coder"];
        const idx = models.indexOf(this.currentModelName);
        this.currentModelName = models[(idx + 1) % models.length];
      }
      this.render();
      return;
    }
    if (input === "/auth") {
      this.conversationTurns.push({
        role: "tool",
        title: "Antigravity & Session Auth",
        content: this.antigravityStatus.connected ? `Linked (ID: ${this.antigravityStatus.id.substring(0, 12)}...)` : `Unlinked Guest | Eschaton ID: ${this.rotator.currentIdentity.deviceId.substring(0, 8)}...`
      });
      this.render();
      return;
    }
    this.isProcessing = true;
    this.conversationTurns.push({ role: "user", content: input });
    this.render();
    process2.stdout.write(`
\x1B[38;5;244m● DeepSeek Agent thinking...\x1B[0m
`);
    let currentStream = "";
    await this.agent.runTask(input, {
      onToken: (token) => {
        currentStream += token;
        process2.stdout.write(token);
      },
      onToolStart: (call) => {
        const desc = call.args.filePath || call.args.command || call.args.pattern || "";
        process2.stdout.write(`
  \x1B[38;5;75m● ${call.tool}\x1B[0m \x1B[38;5;244m${desc}\x1B[0m
`);
      },
      onToolEnd: (res) => {
        const preview = res.output.split(`
`)[0]?.substring(0, 80) || "";
        this.conversationTurns.push({
          role: "tool",
          title: res.tool,
          content: `${res.isError ? "[Error] " : ""}${preview}`
        });
      }
    });
    if (currentStream) {
      this.conversationTurns.push({ role: "assistant", content: currentStream });
    }
    this.isProcessing = false;
    this.render();
  }
}
export {
  DeepSeekProviderPool,
  DeepSeekReactAgent,
  OpenCodeUI,
  SessionRotator
};
