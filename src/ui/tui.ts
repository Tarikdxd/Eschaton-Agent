import readline from 'node:readline'
import process from 'node:process'
import { ProviderPool } from '../llm/providers.js'
import { CodingAgent, type Mode, type ToolCall, type ToolResult } from '../agent/coding-agent.js'
import { maskKey } from '../config.js'

const MODES: Mode[] = ['Build', 'Plan', 'Review', 'Fast']

function color(code: string): (text: string) => string {
  if (!process.stdout.isTTY || process.env.NO_COLOR) return (text) => text
  return (text) => `\x1b[${code}m${text}\x1b[0m`
}

const dim = color('38;5;244')
const bold = color('1')
const blue = color('38;5;75')
const red = color('31')

export interface TerminalOptions {
  version: string
  cwd: string
}

export class TerminalUI {
  private rl: readline.Interface | null = null
  private agent: CodingAgent
  private pool: ProviderPool
  private options: TerminalOptions
  private busy = false

  constructor(pool: ProviderPool, options: TerminalOptions) {
    this.pool = pool
    this.options = options
    this.agent = new CodingAgent(pool, options.cwd)
  }

  public async start(): Promise<void> {
    this.printBanner()

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
      historySize: 200,
    })

    this.rl.setPrompt(this.prompt())
    this.rl.prompt()

    this.rl.on('line', async (line) => {
      const input = line.trim()

      if (this.busy) {
        this.rl?.prompt()
        return
      }

      if (!input) {
        this.rl?.prompt()
        return
      }

      this.busy = true
      try {
        await this.handle(input)
      } catch (err: any) {
        process.stdout.write(`\n${red('error')} ${err?.message ?? err}\n`)
      } finally {
        this.busy = false
        this.rl?.setPrompt(this.prompt())
        this.rl?.prompt()
      }
    })

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
      `${bold('Eschaton Code')} ${dim(this.options.version)}`,
      `${dim('directory')} ${this.options.cwd}`,
      provider
        ? `${dim('provider ')} ${provider.label} ${dim('·')} ${provider.model}${provider.apiKey ? dim(` · key ${maskKey(provider.apiKey)}`) : dim(' · local')}`
        : `${dim('provider ')} ${red('none configured')}`,
      `${dim('commands')} /help  /mode  /model  /providers  /clear  /exit`,
      '',
    ]
    process.stdout.write(lines.join('\n'))
  }

  private prompt(): string {
    return `${blue('›')} `
  }

  private async handle(input: string): Promise<void> {
    if (!input.startsWith('/')) {
      await this.runTask(input)
      return
    }

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
        process.stdout.write(`${dim('history cleared')}\n`)
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
      default:
        process.stdout.write(`${dim(`unknown command /${command}, try /help`)}\n`)
    }
  }

  private async runTask(input: string): Promise<void> {
    process.stdout.write('\n')
    let streamedAnything = false

    try {
      await this.agent.run(input, {
        onToken: (token) => {
          streamedAnything = true
          process.stdout.write(token)
        },
        onToolStart: (call: ToolCall) => {
          if (streamedAnything) process.stdout.write('\n')
          streamedAnything = false
          process.stdout.write(dim(`  ${call.tool} ${describeArgs(call)}\n`))
        },
        onToolEnd: (result: ToolResult) => {
          if (result.isError) process.stdout.write(red(`  ${firstLine(result.output)}\n`))
        },
      })
    } catch (err: any) {
      if (streamedAnything) process.stdout.write('\n')
      process.stdout.write(`${red('request failed')}\n${err?.message ?? err}\n`)
    }

    process.stdout.write('\n')
  }

  private setMode(argument: string): void {
    const wanted = argument.toLowerCase()

    if (!wanted) {
      const next = MODES[(MODES.indexOf(this.agent.getMode()) + 1) % MODES.length]!
      this.agent.setMode(next)
      process.stdout.write(`${dim('mode')} ${next}\n`)
      return
    }

    const match = MODES.find((mode) => mode.toLowerCase() === wanted)
    if (!match) {
      process.stdout.write(`${dim('modes: build, plan, review, fast')}\n`)
      return
    }

    this.agent.setMode(match)
    process.stdout.write(`${dim('mode')} ${match}\n`)
  }

  private setModel(argument: string): void {
    if (!argument) {
      const provider = this.pool.active()
      process.stdout.write(`${dim('model')} ${provider?.model ?? 'none'}\n`)
      return
    }

    this.pool.setModel(argument)
    process.stdout.write(`${dim('model')} ${argument}\n`)
  }

  private showProviders(argument: string): void {
    if (argument) {
      const index = Number(argument)
      const provider = this.pool.use(index - 1)
      process.stdout.write(
        provider ? `${dim('using')} ${provider.label} · ${provider.model}\n` : `${dim('invalid provider number')}\n`,
      )
      return
    }

    const active = this.pool.active()
    const rows = this.pool.list().map((provider, i) => {
      const marker = provider === active ? '*' : ' '
      const key = provider.apiKey ? maskKey(provider.apiKey) : 'local'
      return `${marker} ${i + 1}. ${provider.label} · ${provider.model} · ${key}`
    })

    process.stdout.write(`${rows.join('\n')}\n`)
  }

  private printHelp(): void {
    const lines = [
      '',
      '  /help              this list',
      '  /mode [name]       build, plan, review, fast (cycles when empty)',
      '  /model [name]      show or set the model for the active provider',
      '  /providers [n]     list providers, or switch to number n',
      '  /clear             forget the conversation',
      '  /exit              leave',
      '',
      '  Anything else is sent to the agent, which can read and edit files and run commands.',
      '',
    ]
    process.stdout.write(lines.join('\n'))
  }
}

function describeArgs(call: ToolCall): string {
  const value = call.args.filePath ?? call.args.command ?? call.args.pattern ?? call.args.dirPath ?? ''
  return String(value).slice(0, 80)
}

function firstLine(text: string): string {
  return text.split('\n')[0]?.slice(0, 120) ?? ''
}
