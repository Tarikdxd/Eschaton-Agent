/**
 * Coding agent.
 *
 * Runs a ReAct loop against the provider pool: the model answers, optionally
 * requests one tool call, and the result is fed back until it stops calling
 * tools or the step limit is reached.
 */

import fs from 'node:fs'
import path from 'node:path'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { ProviderPool, type ChatMessage, type Usage } from '../llm/providers.js'

const execAsync = promisify(exec)

export type Mode = 'Build' | 'Plan' | 'Review' | 'Fast'

export const MODES: Mode[] = ['Build', 'Plan', 'Review', 'Fast']

export interface ToolCall {
  tool: string
  args: Record<string, any>
}

export interface ToolPreview {
  kind: 'read' | 'write' | 'edit' | 'command' | 'list' | 'search'
  path?: string
  command?: string
  before?: string
  after?: string
  detail?: string
  /** Commands and file writes need confirmation. */
  needsApproval: boolean
}

export interface ToolResult {
  tool: string
  output: string
  isError: boolean
  preview?: ToolPreview
}

export interface AgentCallbacks {
  onToken?: (token: string) => void
  onThinking?: (thought: string) => void
  onToolStart?: (call: ToolCall, preview: ToolPreview) => void
  onToolEnd?: (result: ToolResult) => void
}

export interface RunOptions {
  signal?: AbortSignal
  /** Return false to block a tool call. Receives the preview that was shown. */
  approve?: (call: ToolCall, preview: ToolPreview) => Promise<boolean>
  maxSteps?: number
}

export interface RunResult {
  text: string
  steps: number
  usage: Usage
  provider?: string
}

const READ_ONLY_MODES: Mode[] = ['Plan', 'Review']

const MODE_RULES: Record<Mode, string> = {
  Build:
    'Implement the change: read the files you need, edit them, run the build or tests, then report what changed.',
  Plan:
    'Read-only. Do not edit files and do not run commands. Inspect the code and reply with a concrete plan: files to touch, order of work, risks.',
  Review:
    'Read-only. Do not edit files and do not run commands. Read the relevant code and report bugs, unsafe assumptions and missing tests, quoting paths and line numbers.',
  Fast: 'Answer directly with as few tool calls as possible. A short explanation beats a full implementation.',
}

function systemPrompt(cwd: string, mode: Mode): string {
  return `You are Eschaton Code, a coding agent working in the user's terminal.

Working directory: ${cwd}
Platform: ${process.platform}
Mode: ${mode}. ${MODE_RULES[mode]}

Tools:
1. read_file(filePath, startLine?, endLine?)
2. write_file(filePath, content)
3. edit_file(filePath, target, replacement) — replaces one exact substring
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
- When the task is done, answer normally without a tool block.`
}

export class CodingAgent {
  private pool: ProviderPool
  private history: ChatMessage[] = []
  private cwd: string
  private mode: Mode

  constructor(pool: ProviderPool, cwd: string = process.cwd(), mode: Mode = 'Build') {
    this.pool = pool
    this.cwd = cwd
    this.mode = mode
    this.resetHistory()
  }

  public getMode(): Mode {
    return this.mode
  }

  public setMode(mode: Mode): void {
    if (mode === this.mode) return
    this.mode = mode
    this.resetHistory()
  }

  public getHistory(): ChatMessage[] {
    return this.history
  }

  public setHistory(messages: ChatMessage[]): void {
    this.history = messages.length ? [...messages] : []
    if (!this.history.length || this.history[0]?.role !== 'system') this.resetHistory()
  }

  public resetHistory(): void {
    this.history = [{ role: 'system', content: systemPrompt(this.cwd, this.mode) }]
  }

  public async run(prompt: string, callbacks: AgentCallbacks = {}, options: RunOptions = {}): Promise<RunResult> {
    this.history.push({ role: 'user', content: prompt })

    const usage: Usage = { promptTokens: 0, completionTokens: 0 }
    let provider: string | undefined
    const maxSteps = options.maxSteps ?? 25

    for (let step = 1; step <= maxSteps; step++) {
      // Tool blocks are protocol, not prose. Forward the answer up to the block
      // and drop the JSON so the user never sees it.
      let buffered = ''
      let muted = false
      const forward = (chunk: string) => {
        if (!callbacks.onToken || muted) return
        buffered += chunk

        const marker = buffered.indexOf('```tool')
        if (marker >= 0) {
          if (marker > 0) callbacks.onToken(buffered.slice(0, marker))
          buffered = ''
          muted = true
          return
        }

        if (buffered.length > 8) {
          callbacks.onToken(buffered.slice(0, -8))
          buffered = buffered.slice(-8)
        }
      }

      const response = await this.pool.generate({
        messages: this.history,
        signal: options.signal,
        onChunk: forward,
        onThinking: callbacks.onThinking,
      })

      if (!muted && buffered) callbacks.onToken?.(buffered)

      provider = response.provider
      accumulate(usage, response.usage)
      this.history.push({ role: 'assistant', content: response.text })

      const call = this.parseToolCall(response.text)
      if (!call) {
        return { text: response.text, steps: step, usage, provider }
      }

      const result = await this.execute(call, callbacks, options)
      callbacks.onToolEnd?.(result)

      this.history.push({
        role: 'user',
        content: `Result of ${call.tool}:\n${result.output}`,
      })

      this.compactHistory()
    }

    return {
      text: `Stopped after ${maxSteps} steps. Ask again to continue from here.`,
      steps: maxSteps,
      usage,
      provider,
    }
  }

  private async execute(call: ToolCall, callbacks: AgentCallbacks, options: RunOptions): Promise<ToolResult> {
    const { tool, args } = call

    if (READ_ONLY_MODES.includes(this.mode) && ['write_file', 'edit_file', 'run_command'].includes(tool)) {
      return {
        tool,
        isError: true,
        output: `Blocked: ${this.mode} mode is read-only. Switch to Build to change files or run commands.`,
      }
    }

    const preview = this.describe(tool, args)
    callbacks.onToolStart?.(call, preview)

    if (preview.needsApproval && options.approve) {
      const allowed = await options.approve(call, preview)
      if (!allowed) {
        return { tool, isError: true, output: 'Denied by the user. Do not retry this call; ask what to do instead.', preview }
      }
    }

    try {
      const output = await this.runTool(tool, args)
      return { tool, isError: false, output, preview }
    } catch (err: any) {
      return { tool, isError: true, output: `${tool} failed: ${err.message}`, preview }
    }
  }

  private describe(tool: string, args: Record<string, any>): ToolPreview {
    if (tool === 'write_file') {
      const target = path.resolve(this.cwd, args.filePath ?? '')
      const before = fs.existsSync(target) ? readText(target) : undefined
      return { kind: 'write', path: args.filePath, before, after: String(args.content ?? ''), needsApproval: true }
    }

    if (tool === 'edit_file') {
      const target = path.resolve(this.cwd, args.filePath ?? '')
      const before = fs.existsSync(target) ? readText(target) : undefined
      const target_ = String(args.target ?? '')
      const after = before?.includes(target_) ? before.replace(target_, String(args.replacement ?? '')) : undefined
      return { kind: 'edit', path: args.filePath, before, after, needsApproval: true }
    }

    if (tool === 'run_command') {
      return { kind: 'command', command: String(args.command ?? ''), needsApproval: true }
    }

    if (tool === 'read_file') return { kind: 'read', path: args.filePath, needsApproval: false }
    if (tool === 'list_dir') return { kind: 'list', path: args.dirPath ?? '.', needsApproval: false }
    return { kind: 'search', detail: String(args.pattern ?? ''), needsApproval: false }
  }

  private async runTool(tool: string, args: Record<string, any>): Promise<string> {
    switch (tool) {
      case 'read_file': {
        const file = path.resolve(this.cwd, args.filePath)
        if (!fs.existsSync(file)) return `File not found: ${args.filePath}`

        const lines = readText(file).split('\n')
        const start = Math.max(1, Number(args.startLine) || 1)
        const end = Math.min(lines.length, Number(args.endLine) || lines.length)
        return lines
          .slice(start - 1, end)
          .map((line, i) => `${start + i}: ${line}`)
          .join('\n')
      }

      case 'write_file': {
        const file = path.resolve(this.cwd, args.filePath)
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, args.content ?? '', 'utf-8')
        return `Wrote ${Buffer.byteLength(args.content ?? '')} bytes to ${args.filePath}`
      }

      case 'edit_file': {
        const file = path.resolve(this.cwd, args.filePath)
        if (!fs.existsSync(file)) return `File not found: ${args.filePath}`

        const content = readText(file)
        const target: string = args.target ?? ''
        if (!target) return 'target is empty'
        if (!content.includes(target)) {
          return `Target string not found in ${args.filePath}. Read the file again and copy the exact text.`
        }

        fs.writeFileSync(file, content.replace(target, args.replacement ?? ''), 'utf-8')
        return `Edited ${args.filePath}`
      }

      case 'run_command': {
        const command: string = args.command ?? ''
        if (!command) return 'command is empty'

        try {
          const { stdout, stderr } = await execAsync(command, {
            cwd: this.cwd,
            timeout: 120_000,
            maxBuffer: 4 * 1024 * 1024,
            shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
          })
          return [stdout, stderr].filter(Boolean).join('\n').trim() || '(no output)'
        } catch (err: any) {
          return `exit code ${err.code ?? '?'}\n${err.stdout ?? ''}\n${err.stderr ?? ''}`.trim()
        }
      }

      case 'list_dir': {
        const dir = path.resolve(this.cwd, args.dirPath || '.')
        if (!fs.existsSync(dir)) return `Directory not found: ${args.dirPath || '.'}`
        return (
          fs
            .readdirSync(dir, { withFileTypes: true })
            .map((entry) => `${entry.isDirectory() ? 'dir  ' : 'file '} ${entry.name}`)
            .join('\n') || '(empty)'
        )
      }

      case 'search_code': {
        const pattern: string = args.pattern ?? ''
        if (!pattern) return 'pattern is empty'

        const root = path.resolve(this.cwd, args.dirPath || '.')
        const hits: string[] = []
        const skip = new Set(['node_modules', '.git', 'dist', 'build', '.next'])

        const walk = (dir: string) => {
          if (hits.length >= 50) return
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (hits.length >= 50) return
            if (skip.has(entry.name)) continue
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) {
              walk(full)
              continue
            }
            try {
              if (fs.statSync(full).size > 512 * 1024) continue
              if (readText(full).includes(pattern)) hits.push(path.relative(root, full))
            } catch {
              // Binary or unreadable file.
            }
          }
        }

        walk(root)
        return hits.join('\n') || 'No matches.'
      }

      default:
        return `Unknown tool: ${tool}`
    }
  }

  private parseToolCall(content: string): ToolCall | null {
    const block = content.match(/```(?:tool:json|tool|json)\s*([\s\S]*?)```/)
    const candidates = block?.[1] ? [block[1]] : []
    candidates.push(content)

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate.trim())
        if (parsed?.tool && parsed?.args) return parsed as ToolCall
      } catch {
        // Not JSON.
      }
    }

    const inline = content.match(/\{"tool"\s*:\s*"[^"]+"[\s\S]*?"args"\s*:\s*\{[\s\S]*?\}\s*\}/)
    if (inline) {
      try {
        const parsed = JSON.parse(inline[0])
        if (parsed?.tool && parsed?.args) return parsed as ToolCall
      } catch {
        // Malformed.
      }
    }

    return null
  }

  /** Keeps the system prompt and the most recent turns when the history grows. */
  private compactHistory(maxChars = 120_000): void {
    const size = () => this.history.reduce((total, message) => total + message.content.length, 0)
    if (size() <= maxChars) return

    const [system, ...rest] = this.history
    const kept: ChatMessage[] = []
    let total = system?.content.length ?? 0

    for (let i = rest.length - 1; i >= 0; i--) {
      const message = rest[i]!
      if (total + message.content.length > maxChars && kept.length >= 4) break
      kept.unshift(message)
      total += message.content.length
    }

    this.history = system ? [system, ...kept] : kept
  }
}

function readText(file: string): string {
  return fs.readFileSync(file, 'utf-8')
}

function accumulate(target: Usage, next?: Usage): void {
  if (!next) return
  target.promptTokens = (target.promptTokens ?? 0) + (next.promptTokens ?? 0)
  target.completionTokens = (target.completionTokens ?? 0) + (next.completionTokens ?? 0)
}
