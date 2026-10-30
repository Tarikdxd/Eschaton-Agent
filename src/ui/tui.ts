import readline from 'node:readline'
import process from 'node:process'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import {
  CodingAgent,
  MODES,
  type AgentOptions,
  type Mode,
  type ToolPreview,
  type ToolResult,
} from '../agent/coding-agent.js'
import { addRule, loadPolicy, suggestRule } from '../permissions.js'
import type { Todo } from '../todos.js'
import {
  ProviderPool,
  applySettings,
  providersFromSettings,
  type ToolCall,
  type Usage,
} from '../llm/providers.js'
import { runSetup } from '../setup.js'
import { latestSession, listSessions, loadSession, saveSession } from '../session.js'
import { expandCommand, loadCommands } from '../commands.js'
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
  agentOptions?: AgentOptions
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
  private totalUsage: Usage = { promptTokens: 0, completionTokens: 0 }
  private turns = 0

  constructor(pool: ProviderPool, options: TerminalOptions) {
    this.pool = pool
    this.options = options
    this.agent = new CodingAgent(pool, options.cwd, options.mode ?? 'Build', {
      ...options.agentOptions,
      onTodos: (todos) => this.renderTodos(todos),
    })
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

    if (text.startsWith('!')) {
      this.runShell(text.slice(1).trim())
      this.rl?.prompt()
      return
    }

    if (!text.startsWith('/')) {
      await this.runTask(this.expandFileRefs(text))
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

      this.turns++
      this.totalUsage.promptTokens = (this.totalUsage.promptTokens ?? 0) + (result.usage.promptTokens ?? 0)
      this.totalUsage.completionTokens = (this.totalUsage.completionTokens ?? 0) + (result.usage.completionTokens ?? 0)

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

    process.stdout.write(`\n  ${toolLine(call.name, detailOf(preview))}\n`)

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

    if (result.preview?.kind === 'tool') {
      if (result.tool === 'todo_write') return
      for (const line of truncateLines(result.output, 8)) process.stdout.write(`  ${c.dim(line)}\n`)
      return
    }

    process.stdout.write(`  ${okLine('applied')}\n`)
  }

  private async confirm(call: ToolCall, _preview: ToolPreview): Promise<boolean> {
    if (this.allowAll) return true

    const answer = (await this.ask(`  ${c.yellow('allow?')} ${c.dim('[y]es  [n]o  [a]lways')} `)).toLowerCase()

    if (answer === 'a' || answer === 'always') {
      this.allowAll = true

      try {
        const rule = suggestRule(call.name, JSON.parse(call.arguments || '{}'))
        addRule(this.options.cwd, rule)
        process.stdout.write(c.dim(`  saved rule ${rule}\n`))
      } catch {
        // The rule is a convenience; ignore malformed arguments.
      }

      return true
    }

    return answer === '' || answer === 'y' || answer === 'yes'
  }

  private renderTodos(todos: Todo[]): void {
    if (!todos.length) return

    process.stdout.write('\n')
    for (const todo of todos) {
      const box =
        todo.status === 'done' ? c.green('[x]') : todo.status === 'in_progress' ? c.yellow('[~]') : c.dim('[ ]')
      process.stdout.write(`  ${box} ${todo.text}\n`)
    }
  }

  /**
   * Asks on the existing interface. The run loop is busy while this happens, so
   * the reply is not mistaken for a new prompt.
   */
  private ask(question: string): Promise<string> {
    const rl = this.rl
    if (!rl) return Promise.resolve('')

    return new Promise((resolve) => {
      rl.question(question, (answer) => resolve(answer.trim()))
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
      case 'undo':
        this.undo()
        return
      case 'diff':
        this.showDiff()
        return
      case 'cost':
        this.showCost()
        return
      case 'sessions':
        this.showSessions()
        return
      case 'resume':
        this.resume(argument)
        return
      case 'compact':
        await this.compact()
        return
      case 'init':
        await this.runTask(
          'Create an AGENTS.md in the project root describing how to build, test and navigate this repository. Read the README, package.json or equivalent first. Keep it under 60 lines.',
        )
        return
      case 'commands':
        this.listCommands()
        return
      case 'todos':
        if (!this.agent.getTodos().length) process.stdout.write(c.dim('  no tasks') + '\n')
        else {
          this.renderTodos(this.agent.getTodos())
          process.stdout.write('\n')
        }
        return
      case 'permissions':
        this.showPermissions()
        return
      case 'skills':
        this.showSkills()
        return
      case 'setup':
      case 'config':
        await this.configure()
        return
      default: {
        const custom = loadCommands(this.options.cwd).find((item) => item.name === command)
        if (custom) {
          await this.runTask(expandCommand(custom, argument))
          return
        }
        process.stdout.write(c.dim(`  unknown command /${command}, try /help`) + '\n')
      }
    }
  }

  private runShell(command: string): void {
    if (!command) return

    try {
      const output = execSync(command, {
        cwd: this.options.cwd,
        encoding: 'utf-8',
        timeout: 60_000,
        maxBuffer: 4 * 1024 * 1024,
      })
      process.stdout.write(output.trimEnd() + '\n')
    } catch (err: any) {
      if (err?.stdout) process.stdout.write(String(err.stdout))
      if (err?.stderr) process.stdout.write(c.red(String(err.stderr)))
      if (!err?.stdout && !err?.stderr) process.stdout.write(c.red(String(err?.message ?? err)) + '\n')
    }
  }

  private expandFileRefs(text: string): string {
    const matches = [...text.matchAll(/(?:^|\s)@([\w./\\-]+)/g)]
    if (!matches.length) return text

    const blocks: string[] = []
    let budget = 40_000

    for (const match of matches.slice(0, 5)) {
      const relative = match[1]!
      const file = path.resolve(this.options.cwd, relative)

      try {
        if (budget <= 0) break
        const content = fs.readFileSync(file, 'utf-8')
        const slice = content.slice(0, Math.min(budget, 20_000))
        budget -= slice.length
        blocks.push(`\n<file path="${relative}">\n${slice}\n</file>`)
      } catch {
        // Missing files are left to the agent to discover.
      }
    }

    return blocks.length ? `${text}\n${blocks.join('\n')}` : text
  }

  private async configure(): Promise<void> {
    this.busy = true

    try {
      const result = await runSetup({
        ask: (question) => this.ask(question),
        askHidden: (question) => this.ask(`${question}${c.dim('(visible) ')}`),
      })

      if (!result) return

      const next = new ProviderPool(providersFromSettings(result.settings))
      await next.detectLocal()

      for (const provider of next.list()) this.pool.add(provider)
      applySettings(this.pool, result.settings)

      const active = this.pool.active()
      process.stdout.write(`  ${c.green(sym.ok)} using ${active?.label ?? '?'} ${c.dim(sym.dot)} ${active?.model ?? ''}\n`)
    } catch (err: any) {
      process.stdout.write(`  ${c.red('error')} ${err?.message ?? err}\n`)
    } finally {
      this.busy = false
      this.setPrompt()
      this.rl?.prompt()
    }
  }

  private showSkills(): void {
    const skills = this.agent.getSkills()
    if (!skills.length) {
      process.stdout.write(c.dim('  no skills found. add .eschaton/skills/<name>/SKILL.md') + '\n')
      return
    }

    process.stdout.write('\n')
    for (const skill of skills) {
      const marker = skill.always ? c.green('*') : ' '
      process.stdout.write(`  ${marker} ${c.cyan(skill.name.padEnd(28))} ${c.dim(skill.description.slice(0, 70))}\n`)
    }
    process.stdout.write('\n' + c.dim(`  ${skills.length} skills, * means always loaded`) + '\n')
  }

  private showPermissions(): void {
    const policy = loadPolicy(this.options.cwd)
    const file = `${this.options.cwd}/.eschaton/permissions.json`

    process.stdout.write('\n')
    process.stdout.write(`  ${c.dim('allow')} ${policy.allow.length ? policy.allow.join(', ') : c.dim('none')}\n`)
    process.stdout.write(`  ${c.dim('deny ')} ${policy.deny.length ? policy.deny.join(', ') : c.dim('none')}\n`)
    process.stdout.write(`  ${c.dim(`file  ${file}`)}\n\n`)
  }

  private listCommands(): void {
    const commands = loadCommands(this.options.cwd)
    if (!commands.length) {
      process.stdout.write(c.dim('  no custom commands. add .eschaton/commands/<name>.md') + '\n')
      return
    }

    process.stdout.write('\n')
    for (const command of commands) {
      process.stdout.write(`  ${c.cyan(`/${command.name}`.padEnd(18))} ${c.dim(command.description)}\n`)
    }
    process.stdout.write('\n')
  }

  private undo(): void {
    const entry = this.agent.undoLast()
    if (!entry) {
      process.stdout.write(c.dim('  nothing to undo') + '\n')
      return
    }

    process.stdout.write(`  ${c.green(sym.ok)} restored ${c.bold(entry.path)}\n`)
  }

  private showDiff(): void {
    try {
      const stat = execSync('git diff --stat', { cwd: this.options.cwd, encoding: 'utf-8' })
      const diff = execSync('git diff', { cwd: this.options.cwd, encoding: 'utf-8', maxBuffer: 4 * 1024 * 1024 })

      if (!stat.trim()) {
        process.stdout.write(c.dim('  working tree is clean') + '\n')
        return
      }

      process.stdout.write('\n' + c.dim(stat.trimEnd()) + '\n\n')
      for (const line of diff.split('\n').slice(0, 200)) {
        const painted = line.startsWith('+')
          ? c.green(line)
          : line.startsWith('-')
            ? c.red(line)
            : line.startsWith('@@')
              ? c.cyan(line)
              : c.dim(line)
        process.stdout.write(`  ${painted}\n`)
      }
      process.stdout.write('\n')
    } catch {
      process.stdout.write(c.dim('  not a git repository') + '\n')
    }
  }

  private showCost(): void {
    const prompt = this.totalUsage.promptTokens ?? 0
    const completion = this.totalUsage.completionTokens ?? 0
    process.stdout.write(
      c.dim(`  ${this.turns} turn${this.turns === 1 ? '' : 's'} ${sym.dot} ${prompt} in ${sym.dot} ${completion} out`) + '\n',
    )
  }

  private showSessions(): void {
    const sessions = listSessions()
      .filter((session) => session.cwd === this.options.cwd)
      .slice(0, 10)

    if (!sessions.length) {
      process.stdout.write(c.dim('  no sessions for this directory') + '\n')
      return
    }

    process.stdout.write('\n')
    sessions.forEach((session, index) => {
      const messages = session.messages.filter((message) => message.role === 'user').length
      const current = session.id === this.sessionId ? c.cyan('*') : ' '
      process.stdout.write(
        `  ${current} ${index + 1}. ${new Date(session.createdAt).toLocaleString()} ${c.dim(`${messages} messages ${sym.dot} ${session.mode}`)}\n`,
      )
    })
    process.stdout.write('\n' + c.dim('  /resume <number> to load one') + '\n')
  }

  private resume(argument: string): void {
    const sessions = listSessions().filter((session) => session.cwd === this.options.cwd)
    const index = Number(argument) - 1
    const session = sessions[index]

    if (!session) {
      process.stdout.write(c.dim('  usage: /resume <number from /sessions>') + '\n')
      return
    }

    this.sessionId = session.id
    this.agent.setMode((session.mode as Mode) ?? 'Build')
    this.agent.setHistory(session.messages)
    this.setPrompt()

    process.stdout.write(`  ${c.green(sym.ok)} resumed ${new Date(session.createdAt).toLocaleString()}\n`)
  }

  private async compact(): Promise<void> {
    this.startSpinner()
    try {
      const summary = await this.agent.compact()
      this.stopSpinner()
      process.stdout.write(c.dim(`  compacted to ${summary.length} characters`) + '\n')
    } catch (err: any) {
      this.stopSpinner()
      process.stdout.write(`  ${c.red('error')} ${err?.message ?? err}\n`)
    }
    this.persist()
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
      ['/init', 'write an AGENTS.md for this project'],
      ['/commands', 'list custom commands from .eschaton/commands'],
      ['/todos', 'show the task list'],
      ['/permissions', 'show allow and deny rules'],
      ['/skills', 'list loaded skills'],
      ['/setup', 'change provider, key or model'],
      ['/diff', 'show the working tree diff'],
      ['/undo', 'revert the last file the agent changed'],
      ['/compact', 'summarize the conversation to free context'],
      ['/cost', 'tokens used in this session'],
      ['/sessions', 'list saved sessions for this directory'],
      ['/resume <n>', 'load a saved session'],
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
        c.dim('  @path adds a file to the prompt, !command runs a shell command.') +
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



