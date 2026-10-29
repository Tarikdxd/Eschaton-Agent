import process from 'node:process'
import { ProviderPool, providersFromSettings, listLocalModels, LOCAL_KINDS } from './llm/providers.js'
import { loadSettings, saveSettings, CONFIG_FILE, maskKey } from './config.js'
import { TerminalUI } from './ui/tui.js'
import { startIde } from './ide/server.js'
import { MODES, type Mode } from './agent/coding-agent.js'
import { c } from './ui/theme.js'

export const VERSION = '3.1.0'

const DEFAULT_PORT = 4123

function setupText(): string {
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
`
}

function printHelp(): void {
  process.stdout.write(`
Usage: eschaton [command] [options]

Commands:
  (none)                    start the terminal agent in this directory
  ide [--port 4123]         open the browser IDE instead
  chat                      start the terminal agent (same as no command)
  doctor                    show detected models and settings
  setup                     show how to connect a model
  login <provider> <key>    save a key: deepseek, openrouter, groq, custom

Options:
  --port <n>                IDE port (default ${DEFAULT_PORT})
  --no-open                 do not open a browser
  -m, --model <name>        override the model for this session
  --mode <name>             build, plan, review or fast
  -h, --help                show this help
  -v, --version             print the version
`)
}

function flag(argv: string[], ...names: string[]): string | undefined {
  for (const name of names) {
    const index = argv.indexOf(name)
    if (index >= 0 && argv[index + 1] && !argv[index + 1]!.startsWith('-')) return argv[index + 1]
  }
  return undefined
}

function runLogin(args: string[]): number {
  const [provider, key, model] = args
  const allowed = ['deepseek', 'openrouter', 'groq', 'custom']

  if (!provider || !key) {
    process.stderr.write('usage: eschaton login <provider> <key> [model]\n')
    return 1
  }

  if (!allowed.includes(provider)) {
    process.stderr.write(`unknown provider "${provider}". expected one of: ${allowed.join(', ')}\n`)
    return 1
  }

  const settings = loadSettings()
  saveSettings({ ...settings, provider, apiKey: key, ...(model ? { model } : {}) })
  process.stdout.write(`saved ${provider} key to ${CONFIG_FILE}\n`)
  return 0
}

async function runDoctor(): Promise<number> {
  const settings = loadSettings()
  const providers = providersFromSettings(settings)
  const pool = new ProviderPool(providers)
  const local = await pool.detectLocal(1200)

  const lines = [
    '',
    `  ${c.bold('Eschaton')} ${c.dim(VERSION)}`,
    `  node        ${process.version}`,
    `  config      ${CONFIG_FILE}`,
    `  saved key   ${maskKey(settings.apiKey)}${settings.provider ? c.dim(` (${settings.provider})`) : ''}`,
    '',
  ]

  if (providers.length) {
    lines.push(`  ${c.bold('hosted providers')}`)
    for (const provider of providers) {
      lines.push(`    ${c.cyan('*')} ${provider.label.padEnd(16)} ${provider.model} ${c.dim(maskKey(provider.apiKey))}`)
    }
  } else {
    lines.push(`  ${c.dim('no hosted provider configured')}`)
  }

  lines.push('', `  ${c.bold('local servers')}`)
  for (const kind of LOCAL_KINDS) {
    const models = await listLocalModels(
      kind === 'ollama' ? 'http://127.0.0.1:11434/v1/chat/completions' : 'http://127.0.0.1:1234/v1/chat/completions',
      700,
    )
    lines.push(`    ${models.length ? c.green('*') : c.dim('·')} ${kind.padEnd(10)} ${models[0] ?? c.dim('not running')}`)
  }

  lines.push('', `  ${c.dim(`active: ${local.length ? local[0]!.label : pool.active()?.label ?? 'none'}`)}`, '')
  process.stdout.write(lines.join('\n'))
  return 0
}

async function runIde(argv: string[]): Promise<number> {
  const port = Number(flag(argv, '--port') ?? DEFAULT_PORT)
  const model = flag(argv, '-m', '--model')
  const mode = parseMode(flag(argv, '--mode'))

  const pool = new ProviderPool(providersFromSettings())
  if (model) pool.setModel(model)

  const ide = await startIde({
    cwd: process.cwd(),
    port: Number.isFinite(port) ? port : DEFAULT_PORT,
    open: !argv.includes('--no-open'),
    model,
    mode,
  })

  const active = pool.active()
  process.stdout.write(
    [
      '',
      `  ${c.bold('Eschaton')} ${c.dim(VERSION)}`,
      `  ${c.dim('workspace')} ${process.cwd()}`,
      `  ${c.dim('url      ')} ${c.cyan(ide.url)}`,
      active ? `  ${c.dim('model    ')} ${active.label} ${c.dim('·')} ${active.model}` : `  ${c.dim('model    ')} none`,
      '',
      c.dim('  Ctrl+C stops the server.'),
      '',
    ].join('\n'),
  )

  await new Promise<void>((resolve) => {
    process.on('SIGINT', () => {
      void ide.close().then(resolve)
    })
  })

  return 0
}

async function runChat(argv: string[]): Promise<number> {
  const model = flag(argv, '-m', '--model')
  const mode = parseMode(flag(argv, '--mode'))
  const resume = argv.includes('--continue') || argv.includes('-c')

  const pool = new ProviderPool(providersFromSettings())
  if (model) pool.setModel(model)
  await pool.detectLocal()

  if (!pool.list().length) {
    process.stdout.write(setupText())
    return 1
  }

  const ui = new TerminalUI(pool, {
    version: VERSION,
    cwd: process.cwd(),
    mode,
    resume,
  })
  await ui.start()
  return 0
}

function parseMode(value: string | undefined): Mode | undefined {
  if (!value) return undefined
  return MODES.find((mode) => mode.toLowerCase() === value.toLowerCase())
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const command = argv[0]

  if (argv.includes('-h') || argv.includes('--help') || command === 'help') {
    printHelp()
    return 0
  }

  if (argv.includes('-v') || argv.includes('--version') || command === 'version') {
    process.stdout.write(`eschaton ${VERSION}\n`)
    return 0
  }

  if (command === 'login') return runLogin(argv.slice(1))
  if (command === 'doctor') return runDoctor()
  if (command === 'chats' || command === 'chat') return runChat(argv.slice(1))

  if (command === 'setup') {
    process.stdout.write(setupText())
    return 0
  }

  if (command === 'ide' || argv.includes('--ide')) {
    return runIde(command === 'ide' ? argv.slice(1) : argv)
  }

  return runChat(argv)
}

main()
  .then((code) => {
    if (code !== 0) process.exitCode = code
  })
  .catch((err) => {
    process.stderr.write(`eschaton: ${err?.message ?? err}\n`)
    process.exitCode = 1
  })
