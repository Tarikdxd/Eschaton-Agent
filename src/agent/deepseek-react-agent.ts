/**
 * ⚡ ESCHATON CODE • DEEPSEEK REACT CODING AGENT
 * 
 * High-performance autonomous terminal coding agent powered by DeepSeek.
 * Features:
 *  - Native Tool Execution (File Read, Write, Edit, Bash Execution, Glob, Search)
 *  - Step-by-step reasoning and multi-turn problem solving
 *  - Seamless integration with DeepSeekProviderPool & silent failover
 */

import fs from 'node:fs'
import path from 'node:path'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { DeepSeekProviderPool, ChatMessage } from '../llm/deepseek-pool.js'

const execAsync = promisify(exec)

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

const SYSTEM_PROMPT = `You are Eschaton Code, an elite autonomous software engineering agent running inside the user's terminal.
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

When you have completed the user's task or answered their question, reply with your final explanation without invoking any more tools.`

export class DeepSeekReactAgent {
  private pool: DeepSeekProviderPool
  private conversationHistory: ChatMessage[] = []
  private cwd: string

  constructor(cwd: string = process.cwd()) {
    this.pool = DeepSeekProviderPool.getInstance()
    this.cwd = cwd
    this.resetHistory()
  }

  public resetHistory() {
    this.conversationHistory = [
      { role: 'system', content: SYSTEM_PROMPT }
    ]
  }

  public async runTask(userPrompt: string, callbacks: AgentCallbacks = {}): Promise<string> {
    this.conversationHistory.push({ role: 'user', content: userPrompt })

    let step = 0
    const maxSteps = 15

    while (step < maxSteps) {
      step++

      let currentTurnOutput = ''
      const promptToGenerate: ChatMessage[] = [...this.conversationHistory]

      try {
        currentTurnOutput = await this.pool.generate({
          messages: promptToGenerate,
          onChunk: (chunk) => {
            if (callbacks.onToken) callbacks.onToken(chunk)
          },
          onThinking: (thought) => {
            if (callbacks.onThinking) callbacks.onThinking(thought)
          }
        })
      } catch (err: any) {
        return `[Error from DeepSeek Provider]: ${err.message}`
      }

      this.conversationHistory.push({ role: 'assistant', content: currentTurnOutput })

      // Check if the assistant wants to call a tool
      const toolCall = this.parseToolCall(currentTurnOutput)
      if (!toolCall) {
        // No tool requested: Task completed!
        return currentTurnOutput
      }

      // Execute tool
      if (callbacks.onToolStart) {
        callbacks.onToolStart(toolCall)
      }

      const toolResult = await this.executeTool(toolCall)

      if (callbacks.onToolEnd) {
        callbacks.onToolEnd(toolResult)
      }

      // Feed tool result back into history
      this.conversationHistory.push({
        role: 'user',
        content: `Tool Result for \`${toolCall.tool}\`:\n${toolResult.output}`
      })
    }

    return 'Agent reached maximum step limit (15 steps).'
  }

  private parseToolCall(content: string): ToolCall | null {
    // 1. Look for ```tool:json ... ```
    const matchToolBlock = content.match(/```(?:tool:json|tool)\s*([\s\S]*?)```/)
    if (matchToolBlock && matchToolBlock[1]) {
      try {
        const parsed = JSON.parse(matchToolBlock[1].trim())
        if (parsed.tool && parsed.args) return parsed
      } catch {}
    }

    // 2. Look for standalone {"tool": ...}
    const matchJson = content.match(/\{[\s\S]*?"tool"\s*:\s*"[^"]+"[\s\S]*?"args"\s*:\s*\{[\s\S]*?\}[\s\S]*?\}/)
    if (matchJson) {
      try {
        const parsed = JSON.parse(matchJson[0].trim())
        if (parsed.tool && parsed.args) return parsed
      } catch {}
    }

    return null
  }

  private async executeTool(call: ToolCall): Promise<ToolResult> {
    const { tool, args } = call

    try {
      switch (tool) {
        case 'read_file': {
          const targetPath = path.resolve(this.cwd, args.filePath)
          if (!fs.existsSync(targetPath)) {
            return { tool, isError: true, output: `File not found: ${args.filePath}` }
          }
          const content = fs.readFileSync(targetPath, 'utf-8')
          const lines = content.split('\n')
          const start = Math.max(1, args.startLine || 1)
          const end = Math.min(lines.length, args.endLine || lines.length)
          const slice = lines.slice(start - 1, end).map((l, i) => `${start + i}: ${l}`).join('\n')
          return { tool, isError: false, output: slice }
        }

        case 'write_file': {
          const targetPath = path.resolve(this.cwd, args.filePath)
          fs.mkdirSync(path.dirname(targetPath), { recursive: true })
          fs.writeFileSync(targetPath, args.content ?? '', 'utf-8')
          return { tool, isError: false, output: `Successfully wrote ${args.content?.length || 0} bytes to ${args.filePath}` }
        }

        case 'edit_file': {
          const targetPath = path.resolve(this.cwd, args.filePath)
          if (!fs.existsSync(targetPath)) {
            return { tool, isError: true, output: `File not found: ${args.filePath}` }
          }
          const content = fs.readFileSync(targetPath, 'utf-8')
          const target = args.target
          const replacement = args.replacement ?? ''
          
          if (!content.includes(target)) {
            return { tool, isError: true, output: `Target string was not found inside ${args.filePath}. Ensure exact whitespace match.` }
          }
          const updated = content.replace(target, replacement)
          fs.writeFileSync(targetPath, updated, 'utf-8')
          return { tool, isError: false, output: `Successfully edited ${args.filePath}` }
        }

        case 'run_command': {
          const cmd = args.command
          const isWindows = process.platform === 'win32'
          const shellCmd = isWindows ? `cmd.exe /c "${cmd}"` : cmd
          
          try {
            const { stdout, stderr } = await execAsync(shellCmd, {
              cwd: this.cwd,
              timeout: 30_000,
              maxBuffer: 2 * 1024 * 1024
            })
            const combined = (stdout || '') + (stderr ? `\n[STDERR]:\n${stderr}` : '')
            return { tool, isError: false, output: combined.trim() || '(Command finished with empty output)' }
          } catch (cmdErr: any) {
            return { tool, isError: true, output: `Command failed: ${cmdErr.message}\n${cmdErr.stderr || ''}` }
          }
        }

        case 'list_dir': {
          const targetDir = path.resolve(this.cwd, args.dirPath || '.')
          if (!fs.existsSync(targetDir)) {
            return { tool, isError: true, output: `Directory not found: ${args.dirPath || '.'}` }
          }
          const entries = fs.readdirSync(targetDir, { withFileTypes: true })
          const list = entries.map(e => `${e.isDirectory() ? '[DIR] ' : '      '}${e.name}`).join('\n')
          return { tool, isError: false, output: list }
        }

        case 'search_code': {
          const pattern = args.pattern
          const targetDir = path.resolve(this.cwd, args.dirPath || '.')
          const results: string[] = []

          function walk(dir: string) {
            const list = fs.readdirSync(dir, { withFileTypes: true })
            for (const item of list) {
              if (item.name === 'node_modules' || item.name === '.git' || item.name === 'dist') continue
              const full = path.join(dir, item.name)
              if (item.isDirectory()) {
                walk(full)
              } else {
                try {
                  const text = fs.readFileSync(full, 'utf-8')
                  if (text.includes(pattern)) {
                    results.push(path.relative(targetDir, full))
                  }
                } catch {}
              }
            }
          }

          walk(targetDir)
          return { tool, isError: false, output: results.slice(0, 50).join('\n') || 'No matches found.' }
        }

        default:
          return { tool, isError: true, output: `Unknown tool: ${tool}` }
      }
    } catch (err: any) {
      return { tool, isError: true, output: `Execution error in ${tool}: ${err.message}` }
    }
  }
}
