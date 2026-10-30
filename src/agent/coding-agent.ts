/**
 * Coding agent.
 *
 * Uses the provider's native tool calling when available and falls back to a
 * JSON block in the reply for models that only support plain text.
 */

import fs from 'node:fs'
import path from 'node:path'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import {
  ProviderPool,
  type ChatMessage,
  type ToolCall,
  type ToolSpec,
  type Usage,
} from '../llm/providers.js'
import { memoryBlock } from '../memory.js'
import { decide, type Policy } from '../permissions.js'
import { runHook, type Hooks } from '../hooks.js'
import { formatTodo, normalizeTodos, TODO_TOOL, type Todo } from '../todos.js'
import { findSkill, loadSkills, skillPrompt, type Skill } from '../skills.js'
import { recordEpisode } from '../memory-store.js'

const execAsync = promisify(exec)

export type Mode = 'Build' | 'Plan' | 'Review' | 'Fast'

export const MODES: Mode[] = ['Build', 'Plan', 'Review', 'Fast']

export interface ToolPreview {
  kind: 'read' | 'write' | 'edit' | 'command' | 'list' | 'search' | 'tool'
  path?: string
  command?: string
  before?: string
  after?: string
  detail?: string
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
  approve?: (call: ToolCall, preview: ToolPreview) => Promise<boolean>
  maxSteps?: number
}

export interface RunResult {
  text: string
  steps: number
  usage: Usage
  provider?: string
}

export interface AgentOptions {
  policy?: Policy
  hooks?: Hooks
  extraTools?: ToolSpec[]
  extraHandlers?: Record<string, (args: Record<string, any>) => Promise<string>>
  onTodos?: (todos: Todo[]) => void
  /** Set to false for subagents so they do not write memory. */
  recordMemory?: boolean
}

const SKILL_TOOL: ToolSpec = {
  type: 'function',
  function: {
    name: 'use_skill',
    description: 'Load the full instructions of a skill from the catalog before doing a task it applies to.',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
  },
}

const TASK_TOOL: ToolSpec = {
  type: 'function',
  function: {
    name: 'task',
    description:
      'Run a focused read-only subagent with its own context and return its findings. Use it to explore a large area or check several files without filling this conversation.',
    parameters: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Short label, shown to the user' },
        prompt: { type: 'string', description: 'What the subagent should find out' },
      },
      required: ['description', 'prompt'],
    },
  },
}

const READ_ONLY_MODES: Mode[] = ['Plan', 'Review']

const MODE_RULES: Record<Mode, string> = {
  Build: 'Implement the change: read files, edit them, run the project tests, then report what changed.',
  Plan: 'Read-only. Do not edit files or run commands. Reply with a concrete plan: files to touch, order of work, risks.',
  Review: 'Read-only. Do not edit files or run commands. Report bugs, unsafe assumptions and missing tests with paths and line numbers.',
  Fast: 'Answer directly with as few tool calls as possible.',
}

const TOOLS: ToolSpec[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a text file with line numbers.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Path relative to the workspace' },
          startLine: { type: 'number', description: 'First line, 1-based' },
          endLine: { type: 'number', description: 'Last line, inclusive' },
        },
        required: ['filePath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create a file or replace its whole content.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['filePath', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Replace one exact substring in a file. Read the file first and copy the text exactly.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string' },
          target: { type: 'string', description: 'Exact text to replace, including indentation' },
          replacement: { type: 'string' },
        },
        required: ['filePath', 'target', 'replacement'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Run a shell command in the workspace and return stdout and stderr.',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: 'List a directory.',
      parameters: {
        type: 'object',
        properties: { dirPath: { type: 'string' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_code',
      description: 'Find files containing a literal string.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string' },
          dirPath: { type: 'string' },
        },
        required: ['pattern'],
      },
    },
  },
]

function systemPrompt(cwd: string, mode: Mode, skills: Skill[]): string {
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
- Keep answers short. The terminal is not a document editor.${memoryBlock(cwd)}${skillPrompt(skills)}`
}

interface UndoEntry {
  path: string
  before: string | undefined
}

export class CodingAgent {
  private pool: ProviderPool
  private history: ChatMessage[] = []
  private cwd: string
  private mode: Mode
  private undoStack: UndoEntry[] = []
  private options: AgentOptions
  private tools: ToolSpec[]
  private handlers: Record<string, (args: Record<string, any>) => Promise<string>>
  private todos: Todo[] = []
  private skills: Skill[]
  private changedFiles: string[] = []

  constructor(pool: ProviderPool, cwd: string = process.cwd(), mode: Mode = 'Build', options: AgentOptions = {}) {
    this.pool = pool
    this.cwd = cwd
    this.mode = mode
    this.options = options
    this.skills = loadSkills(cwd)
    this.tools = [
      ...TOOLS,
      TODO_TOOL,
      TASK_TOOL,
      ...(this.skills.length ? [SKILL_TOOL] : []),
      ...(options.extraTools ?? []),
    ]
    this.handlers = {
      ...(options.extraHandlers ?? {}),
      use_skill: async (args) => {
        const skill = findSkill(this.skills, String(args.name ?? ''))
        return skill
          ? skill.body
          : `Unknown skill "${args.name}". Available: ${this.skills.map((item) => item.name).join(', ')}`
      },
      todo_write: async (args) => {
        this.todos = normalizeTodos(args.todos)
        this.options.onTodos?.(this.todos)
        return this.todos.length ? this.todos.map(formatTodo).join('\n') : 'Task list cleared.'
      },
      task: async (args) => this.runSubagent(String(args.prompt ?? ''), String(args.description ?? 'subagent')),
    }
    this.resetHistory()
  }

  public getTodos(): Todo[] {
    return this.todos
  }

  public getSkills(): Skill[] {
    return this.skills
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
    this.history = [{ role: 'system', content: systemPrompt(this.cwd, this.mode, this.skills) }]
  }

  public async run(prompt: string, callbacks: AgentCallbacks = {}, options: RunOptions = {}): Promise<RunResult> {
    this.history.push({ role: 'user', content: prompt })

    const usage: Usage = { promptTokens: 0, completionTokens: 0 }
    let provider: string | undefined
    const maxSteps = options.maxSteps ?? 30

    for (let step = 1; step <= maxSteps; step++) {
      let buffered = ''
      let muted = false
      const forward = (chunk: string) => {
        if (!callbacks.onToken || muted) return
        buffered += chunk
        if (buffered.length > 8) {
          callbacks.onToken(buffered.slice(0, -8))
          buffered = buffered.slice(-8)
        }
      }

      const response = await this.pool.generate({
        messages: this.history,
        tools: this.tools,
        signal: options.signal,
        onChunk: callbacks.onToken ? forward : undefined,
        onThinking: callbacks.onThinking,
      })

      provider = response.provider
      accumulate(usage, response.usage)

      if (response.toolCalls.length) {
        muted = true
        this.history.push({
          role: 'assistant',
          content: response.text,
          tool_calls: response.toolCalls.map((call) => ({
            id: call.id,
            type: 'function' as const,
            function: { name: call.name, arguments: call.arguments },
          })),
        })

        for (const call of response.toolCalls) {
          const parsed = parseArguments(call)
          const result = await this.execute(call.name, parsed, callbacks, options)
          callbacks.onToolEnd?.(result)

          this.history.push({
            role: 'tool',
            tool_call_id: call.id,
            content: truncate(result.output, 30_000),
          })
        }

        this.compactHistory()
        continue
      }

      if (!muted && buffered) callbacks.onToken?.(buffered)
      this.history.push({ role: 'assistant', content: response.text })

      const legacy = parseLegacyToolCall(response.text)
      if (legacy) {
        const result = await this.execute(legacy.name, legacy.args, callbacks, options)
        callbacks.onToolEnd?.(result)
        this.history.push({ role: 'user', content: `Result of ${legacy.name}:\n${truncate(result.output, 30_000)}` })
        this.compactHistory()
        continue
      }

      this.record(prompt, response.text)
      return { text: response.text, steps: step, usage, provider }
    }

    this.record(prompt, `stopped after ${maxSteps} steps`)

    return {
      text: `Stopped after ${maxSteps} steps. Ask again to continue from here.`,
      steps: maxSteps,
      usage,
      provider,
    }
  }

  public undoLast(): UndoEntry | undefined {
    const entry = this.undoStack.pop()
    if (!entry) return undefined

    const file = path.resolve(this.cwd, entry.path)
    if (entry.before === undefined) {
      fs.rmSync(file, { force: true })
    } else {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, entry.before, 'utf-8')
    }

    return entry
  }

  public async compact(): Promise<string> {
    if (this.history.length <= 2) return 'Nothing to compact.'

    const transcript = this.history
      .filter((message) => message.role !== 'system')
      .map((message) => `${message.role}: ${message.content}`)
      .join('\n\n')
      .slice(-60_000)

    const response = await this.pool.generate({
      messages: [
        {
          role: 'system',
          content:
            'Summarize this coding session for a fresh context window. Keep: the goal, decisions, files changed, commands that matter, and open questions. Drop small talk. Write compact prose, max 400 words.',
        },
        { role: 'user', content: transcript },
      ],
    })

    const summary = response.text.trim()
    this.history = [
      { role: 'system', content: systemPrompt(this.cwd, this.mode, this.skills) },
      { role: 'user', content: `Session so far (summary):\n${summary}` },
      { role: 'assistant', content: 'Understood. Ready to continue.' },
    ]

    return summary
  }

  private async execute(
    tool: string,
    args: Record<string, any>,
    callbacks: AgentCallbacks,
    options: RunOptions,
  ): Promise<ToolResult> {
    if (READ_ONLY_MODES.includes(this.mode) && ['write_file', 'edit_file', 'run_command'].includes(tool)) {
      return {
        tool,
        isError: true,
        output: `Blocked: ${this.mode} mode is read-only. Switch to Build to change files or run commands.`,
      }
    }

    const decision = this.options.policy ? decide(this.options.policy, tool, args) : 'ask'
    const preview = this.describe(tool, args)
    callbacks.onToolStart?.({ id: '', name: tool, arguments: JSON.stringify(args) }, preview)

    if (decision === 'deny') {
      return { tool, isError: true, output: `Blocked by a permission rule for ${tool}.`, preview }
    }

    if (preview.needsApproval && decision === 'ask' && options.approve) {
      const allowed = await options.approve({ id: '', name: tool, arguments: JSON.stringify(args) }, preview)
      if (!allowed) {
        return { tool, isError: true, output: 'Denied by the user. Do not retry; ask what to do instead.', preview }
      }
    }

    const env = {
      ESCHATON_TOOL: tool,
      ESCHATON_TOOL_ARGS: JSON.stringify(args).slice(0, 4000),
      ESCHATON_CWD: this.cwd,
    }

    if (this.options.hooks?.preTool) {
      const hook = await runHook(this.options.hooks.preTool, this.cwd, env)
      if (!hook.ok) {
        return {
          tool,
          isError: true,
          output: `Blocked by the preTool hook:\n${hook.output || 'non-zero exit'}`,
          preview,
        }
      }
    }

    if (tool === 'write_file' || tool === 'edit_file') {
      this.remember(args.filePath)
    }

    try {
      let output = await this.runTool(tool, args)

      if ((tool === 'write_file' || tool === 'edit_file') && args.filePath && !this.changedFiles.includes(args.filePath)) {
        this.changedFiles.push(String(args.filePath))
      }

      if (this.options.hooks?.postTool) {
        const hook = await runHook(this.options.hooks.postTool, this.cwd, env)
        if (!hook.ok) output += `\n\npostTool hook failed:\n${hook.output}`
      }

      return { tool, isError: false, output, preview }
    } catch (err: any) {
      return { tool, isError: true, output: `${tool} failed: ${err.message}`, preview }
    }
  }

  private record(prompt: string, outcome: string): void {
    if (this.options.recordMemory === false) return

    recordEpisode(this.cwd, {
      at: new Date().toISOString(),
      prompt: prompt.slice(0, 400),
      files: [...this.changedFiles],
      outcome: outcome.slice(0, 300),
    })

    this.changedFiles = []
  }

  private async runSubagent(prompt: string, description: string): Promise<string> {
    if (!prompt.trim()) return 'task prompt is empty'

    const subagent = new CodingAgent(this.pool, this.cwd, 'Plan', {
      extraTools: this.options.extraTools,
      extraHandlers: this.options.extraHandlers,
      recordMemory: false,
    })

    const result = await subagent.run(
      `Investigate and report. Do not change files.\n\n${prompt}`,
      {},
      { maxSteps: 12 },
    )

    return `Subagent "${description}" finished:\n${truncate(result.text, 8000)}`
  }

  private remember(filePath: string): void {
    const file = path.resolve(this.cwd, filePath)
    const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : undefined
    this.undoStack.push({ path: filePath, before })
    if (this.undoStack.length > 50) this.undoStack.shift()
  }

  private describe(tool: string, args: Record<string, any>): ToolPreview {
    if (tool === 'write_file') {
      const target = path.resolve(this.cwd, args.filePath ?? '')
      const before = fs.existsSync(target) ? fs.readFileSync(target, 'utf-8') : undefined
      return { kind: 'write', path: args.filePath, before, after: String(args.content ?? ''), needsApproval: true }
    }

    if (tool === 'edit_file') {
      const target = path.resolve(this.cwd, args.filePath ?? '')
      const before = fs.existsSync(target) ? fs.readFileSync(target, 'utf-8') : undefined
      const needle = String(args.target ?? '')
      const after = before?.includes(needle) ? before.replace(needle, String(args.replacement ?? '')) : undefined
      return { kind: 'edit', path: args.filePath, before, after, needsApproval: true }
    }

    if (tool === 'run_command') return { kind: 'command', command: String(args.command ?? ''), needsApproval: true }
    if (tool === 'read_file') return { kind: 'read', path: args.filePath, needsApproval: false }
    if (tool === 'list_dir') return { kind: 'list', path: args.dirPath ?? '.', needsApproval: false }
    if (tool === 'search_code') return { kind: 'search', detail: String(args.pattern ?? ''), needsApproval: false }
    if (tool === 'todo_write' || tool === 'task') return { kind: 'tool', detail: tool, needsApproval: false }

    return { kind: 'tool', detail: tool, needsApproval: true }
  }

  private async runTool(tool: string, args: Record<string, any>): Promise<string> {
    switch (tool) {
      case 'read_file': {
        const file = path.resolve(this.cwd, args.filePath)
        if (!fs.existsSync(file)) return `File not found: ${args.filePath}`

        const lines = fs.readFileSync(file, 'utf-8').split('\n')
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

        const content = fs.readFileSync(file, 'utf-8')
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
              if (fs.readFileSync(full, 'utf-8').includes(pattern)) hits.push(path.relative(root, full))
            } catch {
              // Binary or unreadable file.
            }
          }
        }

        walk(root)
        return hits.join('\n') || 'No matches.'
      }

      default: {
        const handler = this.handlers[tool]
        if (handler) return handler(args)
        return `Unknown tool: ${tool}`
      }
    }
  }

  private compactHistory(maxChars = 120_000): void {
    const size = () => this.history.reduce((total, message) => total + (message.content?.length ?? 0), 0)
    if (size() <= maxChars) return

    const [system, ...rest] = this.history
    const kept: ChatMessage[] = []
    let total = system?.content.length ?? 0

    for (let i = rest.length - 1; i >= 0; i--) {
      const message = rest[i]!
      if (total + (message.content?.length ?? 0) > maxChars && kept.length >= 4) break
      kept.unshift(message)
      total += message.content?.length ?? 0
    }

    this.history = system ? [system, ...kept] : kept
  }
}

function parseArguments(call: ToolCall): Record<string, any> {
  try {
    const parsed = JSON.parse(call.arguments || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function parseLegacyToolCall(content: string): { name: string; args: Record<string, any> } | null {
  const block = content.match(/```(?:tool:json|tool|json)\s*([\s\S]*?)```/)
  const candidates = block?.[1] ? [block[1]] : []

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate.trim())
      if (parsed?.tool && parsed?.args) return { name: parsed.tool, args: parsed.args }
    } catch {
      // Not JSON.
    }
  }

  return null
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n… truncated` : text
}

function accumulate(target: Usage, next?: Usage): void {
  if (!next) return
  target.promptTokens = (target.promptTokens ?? 0) + (next.promptTokens ?? 0)
  target.completionTokens = (target.completionTokens ?? 0) + (next.completionTokens ?? 0)
}

