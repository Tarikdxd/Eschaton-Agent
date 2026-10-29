import process from 'node:process'
import { ProviderPool, providersFromSettings } from './llm/providers.js'
import { loadSettings, saveSettings, CONFIG_FILE } from './config.js'
import { TerminalUI } from './ui/tui.js'

export const VERSION = '2.1.0'

const SETUP = `
Eschaton Code needs a model. Pick one:

  Local, free and private
    Ollama      ollama pull deepseek-r1:7b      https://ollama.com
    LM Studio   load a DeepSeek model and start the server   https://lmstudio.ai

  Hosted, with your own key
    export DEEPSEEK_API_KEY=...
    export OPENROUTER_API_KEY=...
    export GROQ_API_KEY=...
    export OPENAI_BASE_URL=... OPENAI_API_KEY=...   # any OpenAI-compatible endpoint

  Save a key once instead of exporting it:
    eschaton login openrouter sk-or-...

The settings file is ${CONFIG_FILE}
`

function printHelp(): void {
  process.stdout.write(
    `
Usage: eschaton [options] [command]

Commands:
  setup                     show how to connect a model
  login <provider> <key>    save a key to the settings file
                            providers: deepseek, openrouter, groq, custom

Options:
  -m, --model <name>        override the model for this session
  -h, --help                show this help
  -v, --version             print the version
`,
  )
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

async function main(): Promise<number> {
  const argv = process.argv.slice(2)

  if (argv.includes('-h') || argv.includes('--help') || argv[0] === 'help') {
    printHelp()
    return 0
  }

  if (argv.includes('-v') || argv.includes('--version') || argv[0] === 'version') {
    process.stdout.write(`eschaton ${VERSION}\n`)
    return 0
  }

  if (argv[0] === 'login') return runLogin(argv.slice(1))
  if (argv[0] === 'setup') {
    process.stdout.write(SETUP)
    return 0
  }

  const modelFlag = argv.indexOf('-m') >= 0 ? argv.indexOf('-m') : argv.indexOf('--model')
  const modelOverride = modelFlag >= 0 ? argv[modelFlag + 1] : undefined

  const pool = new ProviderPool(providersFromSettings())
  if (modelOverride) pool.setModel(modelOverride)
  await pool.detectLocal()

  if (!pool.list().length) {
    process.stdout.write(SETUP)
    return 1
  }

  const ui = new TerminalUI(pool, { version: VERSION, cwd: process.cwd() })
  await ui.start()
  return 0
}

main()
  .then((code) => {
    if (code !== 0) process.exitCode = code
  })
  .catch((err) => {
    process.stderr.write(`eschaton: ${err?.message ?? err}\n`)
    process.exitCode = 1
  })
