/**
 * ⚡ ESCHATON CODE • OPENCODE PIXEL-PERFECT TUI
 * 
 * Pixel-perfect replica of the OpenCode terminal interface:
 *  - Centered OpenCode pixel block logo with anti-aliased shading
 *  - Iconic sleek input box with electric blue left vertical accent line
 *  - Tab agent mode switching (Build, Plan, Review, Fast)
 *  - Ctrl+P command palette & /refresh trick trigger
 *  - Real-time streaming response & tool execution cards
 */

import readline from 'node:readline'
import process from 'node:process'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { DeepSeekReactAgent, ToolCall, ToolResult } from '../agent/deepseek-react-agent.js'
import { DeepSeekProviderPool } from '../llm/deepseek-pool.js'
import { SessionRotator } from '../auth/session-rotator.js'

export { DeepSeekReactAgent, ToolCall, ToolResult } from '../agent/deepseek-react-agent.js'
export { DeepSeekProviderPool } from '../llm/deepseek-pool.js'
export { SessionRotator } from '../auth/session-rotator.js'

export class OpenCodeUI {
  private agent: DeepSeekReactAgent
  private pool: DeepSeekProviderPool
  private rotator: SessionRotator
  private inputBuffer: string = ''
  private cursorIndex: number = 0
  private history: string[] = []
  private historyIndex: number = -1
  private currentAgentMode: 'Build' | 'Plan' | 'Review' | 'Fast' = 'Build'
  private currentModelName: string = 'DeepSeek V3 (Auto-Failover)'
  private subModeName: string = 'Eschaton Zen'
  private isProcessing: boolean = false
  private conversationTurns: Array<{ role: 'user' | 'assistant' | 'tool'; content: string; title?: string }> = []
  private antigravityStatus: { connected: boolean; id: string } = { connected: false, id: '' }

  constructor() {
    this.agent = new DeepSeekReactAgent()
    this.pool = DeepSeekProviderPool.getInstance()
    this.rotator = SessionRotator.getInstance()
    this.detectAntigravity()
  }

  private detectAntigravity() {
    try {
      const idFile = path.join(os.homedir(), '.gemini', 'antigravity', 'installation_id')
      if (fs.existsSync(idFile)) {
        this.antigravityStatus = {
          connected: true,
          id: fs.readFileSync(idFile, 'utf-8').trim()
        }
      }
    } catch {}
  }

  public start() {
    // Switch to alternate screen buffer & hide cursor
    process.stdout.write('\x1b[?1049h\x1b[2J\x1b[H')

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true)
    }
    process.stdin.resume()
    process.stdin.setEncoding('utf-8')

    this.render()

    process.stdin.on('data', async (chunk: string) => {
      if (this.isProcessing) {
        // Ctrl+C during processing: abort
        if (chunk === '\u0003') {
          this.isProcessing = false
          this.render()
        }
        return
      }

      await this.handleKeypress(chunk)
    })

    process.on('SIGINT', () => this.exit())
  }

  private exit() {
    // Restore normal screen buffer & cursor
    process.stdout.write('\x1b[?25h\x1b[?1049l')
    process.exit(0)
  }

  private render() {
    const cols = process.stdout.columns || 80
    const rows = process.stdout.rows || 24

    let out = '\x1b[2J\x1b[H' // Clear & home

    // 1. If no conversation yet: render centered OpenCode Logo
    if (this.conversationTurns.length === 0) {
      out += this.renderCenteredLogo(cols)
    } else {
      // 2. Render conversation transcript
      out += this.renderTranscript(cols)
    }

    // 3. Render OpenCode Sleek Input Container
    out += this.renderInputBox(cols)

    process.stdout.write(out)
  }

  private renderCenteredLogo(cols: number): string {
    const g1 = '\x1b[38;5;252m' // light silver
    const g2 = '\x1b[38;5;244m' // medium silver
    const g3 = '\x1b[38;5;238m' // dark slate
    const r = '\x1b[0m'

    const logoLines = [
      g1 + '████' + r + '  ' + g1 + '████' + r + '  ' + g2 + '████' + r + '  ' + g3 + '████' + r + '  ' + g2 + '████' + r + '  ' + g1 + '████' + r + '     ' + g1 + '█' + r + '  ' + g1 + '████' + r,
      g1 + '█  █' + r + '  ' + g1 + '█  █' + r + '  ' + g2 + '█   ' + r + '  ' + g3 + '█  █' + r + '  ' + g2 + '█   ' + r + '  ' + g1 + '█  █' + r + '     ' + g1 + '█' + r + '  ' + g1 + '█   ' + r,
      g1 + '█  █' + r + '  ' + g1 + '████' + r + '  ' + g2 + '████' + r + '  ' + g3 + '█  █' + r + '  ' + g2 + '█   ' + r + '  ' + g1 + '█  █' + r + '  ' + g1 + '████' + r + '  ' + g1 + '████' + r,
      g1 + '█  █' + r + '  ' + g1 + '█   ' + r + '  ' + g2 + '█   ' + r + '  ' + g3 + '█  █' + r + '  ' + g2 + '█   ' + r + '  ' + g1 + '█  █' + r + '  ' + g1 + '█  █' + r + '  ' + g1 + '█   ' + r,
      g1 + '████' + r + '  ' + g1 + '█   ' + r + '  ' + g2 + '████' + r + '  ' + g3 + '█  █' + r + '  ' + g2 + '████' + r + '  ' + g1 + '████' + r + '  ' + g1 + '████' + r + '  ' + g1 + '████' + r
    ]

    const logoWidth = 46
    const padLeft = Math.max(0, Math.floor((cols - logoWidth) / 2))
    const indent = ' '.repeat(padLeft)

    let res = '\n\n'
    for (const line of logoLines) {
      res += indent + line + '\n'
    }
    res += '\n\n'
    return res
  }

  private renderTranscript(cols: number): string {
    let res = '\n'
    const maxItems = 8
    const slice = this.conversationTurns.slice(-maxItems)

    for (const turn of slice) {
      if (turn.role === 'user') {
        res += `\x1b[38;5;75m❯ \x1b[1;37m${turn.content}\x1b[0m\n\n`
      } else if (turn.role === 'assistant') {
        res += `\x1b[38;5;250m${turn.content}\x1b[0m\n\n`
      } else if (turn.role === 'tool') {
        res += `  \x1b[38;5;244m● \x1b[38;5;75m${turn.title || 'Tool'}\x1b[0m \x1b[38;5;240m${turn.content}\x1b[0m\n`
      }
    }
    res += '\n'
    return res
  }

  private renderInputBox(cols: number): string {
    const boxWidth = Math.min(cols - 4, 86)
    const padLeft = Math.max(1, Math.floor((cols - boxWidth) / 2))
    const indent = ' '.repeat(padLeft)

    const blueBar = '\x1b[1;38;5;75m▌\x1b[0m '
    const whiteText = '\x1b[38;5;255m'
    const reset = '\x1b[0m'
    const dimGray = '\x1b[38;5;242m'

    // Mode colors
    let modeColor = '\x1b[1;38;5;75m' // Blue for Build
    if (this.currentAgentMode === 'Plan') modeColor = '\x1b[1;38;5;114m' // Green
    if (this.currentAgentMode === 'Review') modeColor = '\x1b[1;38;5;221m' // Yellow
    if (this.currentAgentMode === 'Fast') modeColor = '\x1b[1;38;5;213m' // Magenta

    // 1. Text line with cursor
    const displayInput = this.inputBuffer.length > 0 
      ? this.inputBuffer.slice(0, this.cursorIndex) + '\x1b[7m \x1b[0m' + this.inputBuffer.slice(this.cursorIndex + 1)
      : '\x1b[7m \x1b[0m\x1b[38;5;240mType a prompt or /refresh for unlimited session trick...\x1b[0m'

    const line1 = indent + blueBar + whiteText + displayInput + reset
    const line2 = indent + blueBar + ' '
    const line3 = indent + blueBar + modeColor + this.currentAgentMode + reset + '  ' + 
                  whiteText + this.currentModelName + reset + '  ' + 
                  dimGray + this.subModeName + reset

    const hint = dimGray + 'tab switch agent   /refresh renew quota   ctrl+p commands' + reset
    const hintPad = Math.max(0, boxWidth - 58)
    const line4 = indent + ' '.repeat(hintPad) + hint

    return `\n${line1}\n${line2}\n${line3}\n\n${line4}\n`
  }

  private async handleKeypress(key: string) {
    // Ctrl+C
    if (key === '\u0003') {
      this.exit()
      return
    }

    // Tab -> Cycle Agent Mode
    if (key === '\t') {
      const modes: Array<'Build' | 'Plan' | 'Review' | 'Fast'> = ['Build', 'Plan', 'Review', 'Fast']
      const curIdx = modes.indexOf(this.currentAgentMode)
      this.currentAgentMode = modes[(curIdx + 1) % modes.length]!
      this.render()
      return
    }

    // Ctrl+P -> Open command hint
    if (key === '\u0010') { // Ctrl+P
      this.inputBuffer = '/'
      this.cursorIndex = 1
      this.render()
      return
    }

    // Enter
    if (key === '\r' || key === '\n') {
      const prompt = this.inputBuffer.trim()
      this.inputBuffer = ''
      this.cursorIndex = 0

      if (!prompt) {
        this.render()
        return
      }

      this.history.push(prompt)
      this.historyIndex = this.history.length

      await this.processCommandOrPrompt(prompt)
      return
    }

    // Backspace
    if (key === '\u0008' || key === '\u007f') {
      if (this.cursorIndex > 0) {
        this.inputBuffer = this.inputBuffer.slice(0, this.cursorIndex - 1) + this.inputBuffer.slice(this.cursorIndex)
        this.cursorIndex--
      }
      this.render()
      return
    }

    // Escape sequences (arrows, home, end)
    if (key.startsWith('\u001b[')) {
      const seq = key.slice(2)
      if (seq === 'D') { // Left
        this.cursorIndex = Math.max(0, this.cursorIndex - 1)
      } else if (seq === 'C') { // Right
        this.cursorIndex = Math.min(this.inputBuffer.length, this.cursorIndex + 1)
      } else if (seq === 'A') { // Up (history)
        if (this.historyIndex > 0) {
          this.historyIndex--
          this.inputBuffer = this.history[this.historyIndex] || ''
          this.cursorIndex = this.inputBuffer.length
        }
      } else if (seq === 'B') { // Down (history)
        if (this.historyIndex < this.history.length - 1) {
          this.historyIndex++
          this.inputBuffer = this.history[this.historyIndex] || ''
          this.cursorIndex = this.inputBuffer.length
        } else {
          this.historyIndex = this.history.length
          this.inputBuffer = ''
          this.cursorIndex = 0
        }
      } else if (seq === 'H') { // Home
        this.cursorIndex = 0
      } else if (seq === 'F') { // End
        this.cursorIndex = this.inputBuffer.length
      }
      this.render()
      return
    }

    // Standard printable character
    if (key.length === 1 && key >= ' ') {
      this.inputBuffer = this.inputBuffer.slice(0, this.cursorIndex) + key + this.inputBuffer.slice(this.cursorIndex)
      this.cursorIndex++
      this.render()
    }
  }

  private async processCommandOrPrompt(input: string) {
    // 1. Built-in Slash Commands
    if (input === '/exit' || input === 'exit') {
      this.exit()
      return
    }

    if (input === '/clear' || input === 'clear') {
      this.conversationTurns = []
      this.agent.resetHistory()
      this.render()
      return
    }

    // /refresh trick: Regenerate device fingerprints & restore quota to 100%!
    if (input === '/refresh' || input.startsWith('/refresh')) {
      this.isProcessing = true
      this.render()
      process.stdout.write('\n\x1b[38;5;75m[↻] Running Session Trick: Rotating device fingerprints & spawning fresh identity...\x1b[0m\n')
      
      const res = await this.rotator.executeRefreshTrick()
      this.pool.resetCooldowns()
      
      this.conversationTurns.push({
        role: 'tool',
        title: 'Session Trick Activated',
        content: `New Device ID: ${res.deviceId.substring(0, 8)}... | Quota Restored to 100% | Reset Count: #${res.resetCount}`
      })
      this.isProcessing = false
      this.render()
      return
    }

    if (input.startsWith('/model')) {
      const parts = input.split(' ')
      if (parts[1]) {
        this.currentModelName = parts[1]
      } else {
        // Toggle DeepSeek models
        const models = ['DeepSeek V3 (Auto-Failover)', 'DeepSeek R1 (Reasoning)', 'DeepSeek V4.1 Flash', 'DeepSeek Coder']
        const idx = models.indexOf(this.currentModelName)
        this.currentModelName = models[(idx + 1) % models.length]!
      }
      this.render()
      return
    }

    if (input === '/auth') {
      this.conversationTurns.push({
        role: 'tool',
        title: 'Antigravity & Session Auth',
        content: this.antigravityStatus.connected 
          ? `Linked (ID: ${this.antigravityStatus.id.substring(0, 12)}...)` 
          : `Unlinked Guest | Eschaton ID: ${this.rotator.currentIdentity.deviceId.substring(0, 8)}...`
      })
      this.render()
      return
    }

    // 2. Regular User Task Prompt -> Run DeepSeek ReAct Agent
    this.isProcessing = true
    this.conversationTurns.push({ role: 'user', content: input })
    this.render()

    process.stdout.write(`\n\x1b[38;5;244m● DeepSeek Agent thinking...\x1b[0m\n`)

    let currentStream = ''

    await this.agent.runTask(input, {
      onToken: (token) => {
        currentStream += token
        process.stdout.write(token)
      },
      onToolStart: (call: ToolCall) => {
        const desc = call.args.filePath || call.args.command || call.args.pattern || ''
        process.stdout.write(`\n  \x1b[38;5;75m● ${call.tool}\x1b[0m \x1b[38;5;244m${desc}\x1b[0m\n`)
      },
      onToolEnd: (res: ToolResult) => {
        const preview = res.output.split('\n')[0]?.substring(0, 80) || ''
        this.conversationTurns.push({
          role: 'tool',
          title: res.tool,
          content: `${res.isError ? '[Error] ' : ''}${preview}`
        })
      }
    })

    if (currentStream) {
      this.conversationTurns.push({ role: 'assistant', content: currentStream })
    }

    this.isProcessing = false
    this.render()
  }
}
