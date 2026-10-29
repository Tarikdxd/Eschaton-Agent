/**
 * Coding agent.
 *
 * Runs a ReAct loop against the provider pool: the model answers, optionally
 * asks for a tool call, and the result is fed back until it stops calling tools
 * or the step limit is reached.
 */

import fs from 'node:fs'
import path from 'node:path'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { ProviderPool, type ChatMessage } from '../llm/providers.js'

const execAsync = promisify(exec)

export type Mode = 'Build' | 'Plan' | 'Review' | 'Fast'

export interface ToolCall {
  tool: string
  args: Record<string, any>
}

export interface ToolResult {
  tool: string
  output: string
  isError: boolean
}

export interface AgentCallbacks {
  onToken?: (token: string) => void
  onThinking?: (thought: string) => void
  onToolStart?: (call: ToolCall) => void
  onToolEnd?: (result: ToolResult) => void
}

const MODE_RULES: Record<Mode, string> = {
  Build:
    'Implement the change. Read the files you need, edit them, run the build or tests, and report what you changed.',
  Plan:
    'Do not edit files. Inspect the code as needed and reply with a concrete plan: files to touch, order of work, and risks.',
  Review:
    'Do not edit files. Read the relevant code and report bugs, unsafe assumptions and missing tests. Quote file paths and line numbers.',
  Fast:
    'Answer directly with as few tool calls as possible. Prefer a short explanation over a full implementation.',
}

function systemPrompt(cwd: string, mode: Mode): string {
  return `You are Eschaton Code, a coding agent running in the user's terminal.

Working directory: ${cwd}
Mode: ${mode}. ${MODE_RULES[mode]}

Tools:
1. read_file(filePath, startLine?, endLine?)
2. write_file(filePath, content)
3. edit_file(filePath, target, replacement) — replaces an exact substring
4. run_command(command)
5. list_dir(dirPath?)
6. search_code(pattern, dirPath?)

To call a tool, reply with a single fenced block:

\`\`\`tool:json
{"tool": "read_file", "args": {"filePath": "src/index.ts", "startLine": 1, "endLine": 40}}
\`\`\`

Call one tool per reply. Paths are relative to the working directory. Read a file before
editing it. When the task is done, reply with the final answer and no tool block.`
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

  public setMode(mode: Mode): void {
    if (mode === this.mode) return
    this.mode = mode
    this.resetHistory()
  }

  public getMode(): Mode {
    return this.mode
  }

  public resetHistory(): void {
    this.history = [{ role: 'system', content: systemPrompt(this.cwd, this.mode) }]
  }

  public async run(userPrompt: string, callbacks: AgentCallbacks = {}, maxSteps = 25): Promise<string> {
    this.history.push({ role: 'user', content: userPrompt })

    for (let step = 0; step < maxSteps; step++) {
      const reply = await this.pool.generate({
        messages: this.history,
        onChunk: callbacks.onToken,
        onThinking: callbacks.onThinking,
      })

      this.history.push({ role: 'assistant', content: reply })

      const call = this.parseToolCall(reply)
      if (!call) return reply

      callbacks.onToolStart?.(call)
      const result = await this.executeTool(call)
      callbacks.onToolEnd?.(result)

      this.history.push({
        role: 'user',
        content: `Result of ${call.tool}:\n${result.output}`,
      })
    }

    return `Stopped after ${maxSteps} steps. Ask again to continue from here.`
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
        // Not JSON, try the next candidate.
      }
    }

    const inline = content.match(/\{"tool"\s*:\s*"[^"]+"[\s\S]*?"args"\s*:\s*\{[\s\S]*?\}\s*\}/)
    if (inline) {
      try {
        const parsed = JSON.parse(inline[0])
        if (parsed?.tool && parsed?.args) return parsed as ToolCall
      } catch {
        // Malformed inline JSON.
      }
    }

    return null
  }

  private async executeTool(call: ToolCall): Promise<ToolResult> {
    const { tool, args } = call

    try {
      switch (tool) {
        case 'read_file': {
          const file = path.resolve(this.cwd, args.filePath)
          if (!fs.existsSync(file)) return { tool, isError: true, output: `File not found: ${args.filePath}` }

          const lines = fs.readFileSync(file, 'utf-8').split('\n')
          const start = Math.max(1, Number(args.startLine) || 1)
          const end = Math.min(lines.length, Number(args.endLine) || lines.length)
          const body = lines
            .slice(start - 1, end)
            .map((line, i) => `${start + i}: ${line}`)
            .join('\n')

          return { tool, isError: false, output: body }
        }

        case 'write_file': {
          const file = path.resolve(this.cwd, args.filePath)
          fs.mkdirSync(path.dirname(file), { recursive: true })
          fs.writeFileSync(file, args.content ?? '', 'utf-8')
          const bytes = Buffer.byteLength(args.content ?? '')
          return { tool, isError: false, output: `Wrote ${bytes} bytes to ${args.filePath}` }
        }

        case 'edit_file': {
          const file = path.resolve(this.cwd, args.filePath)
          if (!fs.existsSync(file)) return { tool, isError: true, output: `File not found: ${args.filePath}` }

          const content = fs.readFileSync(file, 'utf-8')
          const target: string = args.target ?? ''
          if (!target) return { tool, isError: true, output: 'target is empty' }
          if (!content.includes(target)) {
            return {
              tool,
              isError: true,
              output: `Target string not found in ${args.filePath}. Read the file again and copy the exact text.`,
            }
          }

          fs.writeFileSync(file, content.replace(target, args.replacement ?? ''), 'utf-8')
          return { tool, isError: false, output: `Edited ${args.filePath}` }
        }

        case 'run_command': {
          const command: string = args.command ?? ''
          if (!command) return { tool, isError: true, output: 'command is empty' }

          try {
            const { stdout, stderr } = await execAsync(command, {
              cwd: this.cwd,
              timeout: 120_000,
              maxBuffer: 4 * 1024 * 1024,
              shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
            })
            const output = [stdout, stderr].filter(Boolean).join('\n').trim()
            return { tool, isError: false, output: output || '(no output)' }
          } catch (err: any) {
            return { tool, isError: true, output: `${err.message}\n${err.stderr ?? ''}`.trim() }
          }
        }

        case 'list_dir': {
          const dir = path.resolve(this.cwd, args.dirPath || '.')
          if (!fs.existsSync(dir)) return { tool, isError: true, output: `Directory not found: ${args.dirPath || '.'}` }

          const entries = fs
            .readdirSync(dir, { withFileTypes: true })
            .map((entry) => `${entry.isDirectory() ? 'dir  ' : 'file '} ${entry.name}`)
            .join('\n')

          return { tool, isError: false, output: entries || '(empty)' }
        }

        case 'search_code': {
          const pattern: string = args.pattern ?? ''
          if (!pattern) return { tool, isError: true, output: 'pattern is empty' }

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
                if (fs.readFileSync(full, 'utf-8').includes(pattern)) {
                  hits.push(path.relative(root, full))
                }
              } catch {
                // Binary or unreadable file.
              }
            }
          }

          walk(root)
          return { tool, isError: false, output: hits.join('\n') || 'No matches.' }
        }

        default:
          return { tool, isError: true, output: `Unknown tool: ${tool}` }
      }
    } catch (err: any) {
      return { tool, isError: true, output: `${tool} failed: ${err.message}` }
    }
  }
}
