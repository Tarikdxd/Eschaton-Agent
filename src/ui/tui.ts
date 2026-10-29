import readline from 'node:readline'
import process from 'node:process'
import {
  CodingAgent,
  MODES,
  type Mode,
  type ToolCall,
  type ToolPreview,
  type ToolResult,
} from '../agent/coding-agent.js'
import { ProviderPool } from '../llm/providers.js'
import { latestSession, loadSession, saveSession } from '../session.js'
import { c, sym } from './theme.js'
import {
  failLine,
  formatDuration,
  formatTokens,
  okLine,
  previewHeader,
  renderDiff,
  toolLine,
  truncateLines,
} from './render.js'

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export interface TerminalOptions {
  version: string
  cwd: string
  mode?: Mode
  sessionId?: string
  resume?: boolean
}

export class TerminalUI {
  private rl: readline.Interface | null = null
  private agent: CodingAgent
  private pool: ProviderPool
  private options: TerminalOptions

  private busy = false
  private allowAll = false
  private abort: AbortController | null = null
  private spinner: NodeJS.Timeout | null = null
  private spinnerFrame = 0
  private streamed = false
  private pending: string[] = []
  private lastSigint = 0
  private sessionId: string
  private resumedCount = 0

  constructor(pool: ProviderPool, options: TerminalOptions) {
    this.pool = pool
    this.options = options
    this.agent = new CodingAgent(pool, options.cwd, options.mode ?? 'Build')
    this.sessionId = options.sessionId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

    if (options.resume) {
      const session = options.sessionId ? loadSession(options.sessionId) : latestSession(options.cwd)
      if (session) {
        this.sessionId = session.id
        this.agent.setMode((session.mode as Mode) ?? 'Build')
        this.agent.setHistory(session.messages)
        this.resumedCount = session.messages.filter((message) => message.role === 'user').length
      }
    }
  }

  public async start(): Promise<void> {
    this.printBanner()

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
      historySize: 500,
    })

    this.setPrompt()
    this.rl.prompt()

    this.rl.on('line', (line) => {
      void this.onLine(line)
    })

    this.rl.on('SIGINT', () => this.onSigint())

    this.rl.on('close', () => {
      process.stdout.write('\n')
      process.exit(0)
    })

    await new Promise<void>((resolve) => this.rl?.on('close', resolve))
  }

  private printBanner(): void {
    const provider = this.pool.active()
    const lines = [
      '',
      `  ${c.bold('eschaton')} ${c.dim(this.options.version)}`,
      `  ${c.dim('model  ')} ${provider ? `${provider.label} ${c.dim(sym.dot)} ${provider.model}` : c.red('none configured')}`,
      `  ${c.dim('folder ')} ${this.options.cwd}`,
      `  ${c.dim('mode   ')} ${this.modeLabel()}`,
      '',
    ]

    if (this.resumedCount) lines.push(`  ${c.dim(`resumed ${this.resumedCount} message${this.resumedCount === 1 ? '' : 's'}`)}`, '')

    lines.push(
      `  ${c.dim('/help for commands')} ${c.dim(sym.dot)} ${c.dim('Ctrl+C cancels')} ${c.dim(sym.dot)} ${c.dim('Ctrl+D exits')}`,
      '',
    )

    process.stdout.write(lines.join('\n'))
  }

  private modeLabel(): string {
    return c.magenta(this.agent.getMode())
  }

  private setPrompt(): void {
    this.rl?.setPrompt(`${this.modeLabel()} ${c.gray(sym.prompt)} `)
  }

  private async onLine(line: string): Promise<void> {
    if (this.busy) {
      this.rl?.prompt()
      return
    }

    const input = line.trimEnd()

    if (!input.trim()) {
      this.rl?.prompt()
      return
    }

    // A trailing backslash continues the prompt on the next line.
    if (input.endsWith('\\')) {
      this.pending.push(input.slice(0, -1))
      this.rl?.setPrompt(c.gray('… '))
      this.rl?.prompt()
      return
    }

    const text = [...this.pending, input].join('\n').trim()
    this.pending = []
    this.setPrompt()

    if (!text.startsWith('/')) {
      await this.runTask(text)
      return
    }

    await this.runCommand(text)
    this.rl?.prompt()
  }

  private async runTask(input: string): Promise<void> {
    this.busy = true
    this.allowAll = false
    this.streamed = false
    this.abort = new AbortController()
    const started = Date.now()

    this.startSpinner()
    process.stdout.write('\n')

    try {
      const result = await this.agent.run(
        input,
        {
          onToken: (token) => {
            if (!this.streamed) {
              this.stopSpinner()
              this.streamed = true
            }
            process.stdout.write(token)
          },
          onThinking: () => {
            // Reasoning streams are not printed live; the spinner covers the wait.
          },
          onToolStart: (call, preview) => this.onToolStart(call, preview),
          onToolEnd: (toolResult) => this.onToolEnd(toolResult),
        },
        {
          signal: this.abort.signal,
          approve: (call, preview) => this.confirm(call, preview),
        },
      )

      this.stopSpinner()
      if (this.streamed) process.stdout.write('\n')

      const tokens = formatTokens(result.usage.promptTokens, result.usage.completionTokens)
      const parts = [
        formatDuration(Date.now() - started),
        `${result.steps} step${result.steps === 1 ? '' : 's'}`,
        tokens,
        result.provider,
      ].filter(Boolean)

      process.stdout.write(c.dim(`  ${parts.join(` ${sym.dot} `)}`) + '\n\n')
      this.persist()
    } catch (err: any) {
      this.stopSpinner()
      if (this.streamed) process.stdout.write('\n')

      if (err?.message === 'cancelled') {
        process.stdout.write(c.dim('  cancelled') + '\n\n')
      } else {
        process.stdout.write(`  ${c.red('error')} ${err?.message ?? err}\n\n`)
      }
    } finally {
      this.busy = false
      this.abort = null
      this.rl?.prompt()
    }
  }

  private onToolStart(call: ToolCall, preview: ToolPreview): void {
    this.stopSpinner()
    if (this.streamed) {
      process.stdout.write('\n')
      this.streamed = false
    }

    process.stdout.write(`\n  ${toolLine(call.tool, detailOf(preview))}\n`)

    if (preview.needsApproval) {
      process.stdout.write(`${previewHeader(preview)}\n`)

      if ((preview.kind === 'write' || preview.kind === 'edit') && preview.after !== undefined) {
        const diff = renderDiff(preview.before ?? '', preview.after)
        for (const line of diff) process.stdout.write(`${line}\n`)
      }
    }
  }

  private onToolEnd(result: ToolResult): void {
    if (result.isError) {
      process.stdout.write(`  ${failLine(firstLine(result.output))}\n`)
      return
    }

    if (result.preview?.kind === 'command') {
      for (const line of truncateLines(result.output, 14)) {
        process.stdout.write(`  ${c.dim(line)}\n`)
      }
      return
    }

    if (result.preview?.kind === 'read') {
      const count = result.output.split('\n').length
      process.stdout.write(`  ${okLine(`${count} line${count === 1 ? '' : 's'}`)}\n`)
      return
    }

    if (result.preview?.kind === 'search') {
      const count = result.output === 'No matches.' ? 0 : result.output.split('\n').length
      process.stdout.write(`  ${okLine(`${count} match${count === 1 ? '' : 'es'}`)}\n`)
      return
    }

    if (result.preview?.kind === 'list') {
      process.stdout.write(`  ${okLine('listed')}\n`)
      return
    }

    process.stdout.write(`  ${okLine('applied')}\n`)
  }

  private async confirm(_call: ToolCall, _preview: ToolPreview): Promise<boolean> {
    if (this.allowAll) return true

    const answer = (await this.ask(`  ${c.yellow('allow?')} ${c.dim('[y]es  [n]o  [a]lways')} `)).toLowerCase()

    if (answer === 'a' || answer === 'always') {
      this.allowAll = true
      return true
    }

    return answer === '' || answer === 'y' || answer === 'yes'
  }

  /** Asks a question while the main interface is paused. */
  private ask(question: string): Promise<string> {
    const main = this.rl
    main?.pause()

    return new Promise((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
      let settled = false

      const finish = (answer: string) => {
        if (settled) return
        settled = true
        rl.close()
        main?.resume()
        main?.prompt()
        resolve(answer)
      }

      rl.on('SIGINT', () => finish('n'))
      rl.question(question, (answer) => finish(answer.trim()))
    })
  }

  private async runCommand(input: string): Promise<void> {
    const [command, ...rest] = input.slice(1).split(/\s+/)
    const argument = rest.join(' ').trim()

    switch (command) {
      case 'help':
        this.printHelp()
        return
      case 'exit':
      case 'quit':
        this.rl?.close()
        return
      case 'clear':
        this.agent.resetHistory()
        process.stdout.write(c.dim('  history cleared') + '\n')
        return
      case 'mode':
        this.setMode(argument)
        return
      case 'model':
        this.setModel(argument)
        return
      case 'provider':
      case 'providers':
        this.showProviders(argument)
        return
      case 'session':
        process.stdout.write(c.dim(`  session ${this.sessionId}`) + '\n')
        return
      default:
        process.stdout.write(c.dim(`  unknown command /${command}, try /help`) + '\n')
    }
  }

  private setMode(argument: string): void {
    const wanted = argument.toLowerCase()

    if (!wanted) {
      const next = MODES[(MODES.indexOf(this.agent.getMode()) + 1) % MODES.length]!
      this.agent.setMode(next)
    } else {
      const match = MODES.find((mode) => mode.toLowerCase() === wanted)
      if (!match) {
        process.stdout.write(c.dim('  modes: build, plan, review, fast') + '\n')
        return
      }
      this.agent.setMode(match)
    }

    this.setPrompt()
    process.stdout.write(`  ${c.dim('mode')} ${this.modeLabel()}\n`)
  }

  private setModel(argument: string): void {
    if (!argument) {
      process.stdout.write(`  ${c.dim('model')} ${this.pool.active()?.model ?? 'none'}\n`)
      return
    }

    this.pool.setModel(argument)
    process.stdout.write(`  ${c.dim('model')} ${argument}\n`)
  }

  private showProviders(argument: string): void {
    if (argument) {
      const index = Number(argument)
      const provider = this.pool.use(index - 1)
      process.stdout.write(
        provider ? `  ${c.dim('using')} ${provider.label} ${sym.dot} ${provider.model}\n` : c.dim('  invalid number') + '\n',
      )
      return
    }

    const active = this.pool.active()
    for (const [index, provider] of this.pool.list().entries()) {
      const marker = provider === active ? c.cyan('*') : ' '
      const key = provider.apiKey ? provider.apiKey.slice(0, 6) + '…' : 'local'
      process.stdout.write(
        `  ${marker} ${index + 1}. ${provider.label} ${c.dim(sym.dot)} ${provider.model} ${c.dim(`(${key})`)}\n`,
      )
    }
  }

  private printHelp(): void {
    const rows: Array<[string, string]> = [
      ['/help', 'this list'],
      ['/mode [name]', 'build, plan, review, fast (cycles when empty)'],
      ['/model [name]', 'show or set the model for the active provider'],
      ['/providers [n]', 'list providers, or switch to number n'],
      ['/session', 'show the current session id'],
      ['/clear', 'forget the conversation'],
      ['/exit', 'leave'],
    ]

    process.stdout.write('\n')
    for (const [command, description] of rows) {
      process.stdout.write(`  ${c.cyan(command.padEnd(16))} ${c.dim(description)}\n`)
    }
    process.stdout.write(
      '\n' +
        c.dim('  Anything else is sent to the agent. End a line with \\ to continue on the next line.') +
        '\n' +
        c.dim('  Tool calls that write files or run commands ask for confirmation first.') +
        '\n\n',
    )
  }

  private startSpinner(): void {
    if (!process.stdout.isTTY) return

    this.spinnerFrame = 0
    this.spinner = setInterval(() => {
      const frame = SPINNER[this.spinnerFrame++ % SPINNER.length]
      process.stdout.write(`\r\x1b[2K  ${c.cyan(frame)} ${c.dim('thinking')}`)
    }, 80)
  }

  private stopSpinner(): void {
    if (!this.spinner) return
    clearInterval(this.spinner)
    this.spinner = null
    process.stdout.write('\r\x1b[2K')
  }

  private onSigint(): void {
    if (this.busy) {
      this.abort?.abort()
      return
    }

    const now = Date.now()
    if (now - this.lastSigint < 1500) {
      this.rl?.close()
      return
    }

    this.lastSigint = now
    this.pending = []
    process.stdout.write('\n' + c.dim('  press Ctrl+C again to exit') + '\n')
    this.rl?.prompt()
  }

  private persist(): void {
    try {
      saveSession({
        id: this.sessionId,
        cwd: this.options.cwd,
        mode: this.agent.getMode(),
        model: this.pool.active()?.model,
        messages: this.agent.getHistory(),
      })
    } catch {
      // Saving is best effort.
    }
  }
}

function detailOf(preview: ToolPreview): string {
  if (preview.kind === 'command') return preview.command ?? ''
  if (preview.kind === 'search') return `"${preview.detail ?? ''}"`
  return preview.path ?? ''
}

function firstLine(text: string): string {
  return text.split('\n')[0]?.slice(0, 140) ?? ''
}



