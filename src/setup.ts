/**
 * First-run setup and the in-session settings wizard.
 *
 * Everything the README tells you to run as a separate command can be done
 * here: pick a provider, paste a key, choose a model, or point at a local
 * server. It writes the same ~/.eschaton/config.json.
 */

import readline from 'node:readline'
import process from 'node:process'
import { saveSettings, loadSettings, CONFIG_FILE, type Settings } from './config.js'
import { listLocalModels } from './llm/providers.js'
import { c, sym } from './ui/theme.js'

interface Choice {
  id: string
  label: string
  detail: string
  keyHint?: string
  baseUrl?: string
  model: string
}

const CHOICES: Choice[] = [
  {
    id: 'openrouter',
    label: 'OpenRouter',
    detail: 'free DeepSeek and Qwen models',
    keyHint: 'sk-or-...',
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'deepseek/deepseek-chat-v3-0324:free',
  },
  {
    id: 'gemini',
    label: 'Google',
    detail: 'Gemini Flash free tier',
    keyHint: 'AIza...',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    model: 'gemini-2.5-flash',
  },
  {
    id: 'groq',
    label: 'Groq',
    detail: 'free Llama and DeepSeek distills',
    keyHint: 'gsk_...',
    baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'deepseek-r1-distill-llama-70b',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    detail: 'paid, own key',
    keyHint: 'sk-...',
    baseUrl: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-chat',
  },
  {
    id: 'ollama',
    label: 'Ollama',
    detail: 'local model, no key, no account',
    model: 'deepseek-r1:7b',
  },
  {
    id: 'custom',
    label: 'Custom endpoint',
    detail: 'any OpenAI-compatible API',
    model: 'deepseek-chat',
  },
]

export interface SetupResult {
  settings: Settings
  local: boolean
}

export interface Prompter {
  ask: (question: string) => Promise<string>
  askHidden: (question: string) => Promise<string>
}

/** Interactive setup. Returns null when the user backs out. */
export async function runSetup(prompter?: Prompter): Promise<SetupResult | null> {
  const rl = prompter ? null : readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })

  const ask =
    prompter?.ask ??
    ((question: string): Promise<string> =>
      new Promise((resolve) => rl!.question(question, (answer) => resolve(answer.trim()))))
  const askHidden = prompter?.askHidden ?? ((question: string) => hidden(rl!, question))

  try {
    process.stdout.write(`\n  ${c.bold('Set up a model')}\n\n`)

    CHOICES.forEach((choice, index) => {
      process.stdout.write(
        `  ${c.cyan(String(index + 1))}. ${choice.label.padEnd(18)} ${c.dim(choice.detail)}\n`,
      )
    })
    process.stdout.write(`\n  ${c.dim('q to cancel')}\n\n`)

    const pick = (await ask(`  ${c.gray(sym.prompt)} `)).toLowerCase()
    if (pick === 'q' || pick === '') return null

    const choice = CHOICES[Number(pick) - 1]
    if (!choice) {
      process.stdout.write(c.red('  unknown choice') + '\n')
      return null
    }

    if (choice.id === 'ollama') {
      process.stdout.write(c.dim('  looking for a local Ollama...') + '\n')
      const models = await listLocalModels('http://127.0.0.1:11434/v1/chat/completions', 1500)

      if (!models.length) {
        process.stdout.write(
          `\n  ${c.yellow('Ollama is not running.')} Start it and pull a model:\n\n` +
            `    ollama pull deepseek-r1:7b\n\n  then run ${c.cyan('eschaton')} again.\n\n`,
        )
        return null
      }

      const preferred = models.find((name) => name.toLowerCase().includes('deepseek')) ?? models[0]!
      const model = (await ask(`  model ${c.dim(`[${preferred}]`)} ${c.gray(sym.prompt)} `)) || preferred

      const settings: Settings = { provider: 'ollama', model }
      saveSettings(settings)
      process.stdout.write(`\n  ${c.green(sym.ok)} local model ${c.bold(model)}\n\n`)
      return { settings, local: true }
    }

    let baseUrl = choice.baseUrl
    if (choice.id === 'custom') {
      const url = await ask(`  base URL ${c.dim('(https://host/v1)')} ${c.gray(sym.prompt)} `)
      if (!url) return null
      baseUrl = url.replace(/\/$/, '')
    }

    const key = await askHidden(`  ${choice.label} key ${c.dim(choice.keyHint ?? '')} ${c.gray(sym.prompt)} `)
    if (!key) {
      process.stdout.write(c.dim('  cancelled') + '\n')
      return null
    }

    const model = (await ask(`  model ${c.dim(`[${choice.model}]`)} ${c.gray(sym.prompt)} `)) || choice.model

    process.stdout.write(c.dim('  checking the key...') + '\n')
    const ok = await verifyKey(baseUrl!, key, model)

    if (!ok) {
      const again = (await ask(`  ${c.yellow('the key was rejected.')} save anyway? [y/N] `)).toLowerCase()
      if (again !== 'y') return null
    }

    const settings: Settings = {
      provider: choice.id,
      apiKey: key,
      model,
      ...(choice.id === 'custom' ? { baseUrl } : {}),
    }

    saveSettings(settings)
    process.stdout.write(
      `\n  ${c.green(sym.ok)} ${choice.label} ${c.dim(sym.dot)} ${model}\n` +
        `  ${c.dim(`saved to ${CONFIG_FILE}`)}\n\n`,
    )

    return { settings, local: false }
  } finally {
    rl?.close()
  }
}

async function verifyKey(baseUrl: string, apiKey: string, model: string): Promise<boolean> {
  try {
    // A one-token completion is the only honest check; /models is public on
    // several providers and accepts any key.
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        stream: false,
      }),
      signal: AbortSignal.timeout(20_000),
    })

    if (response.status === 401 || response.status === 403) return false
    return true
  } catch {
    return true
  }
}

/** Reads a secret without echoing it. Falls back to a normal prompt when piped. */
function hidden(rl: readline.Interface, question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    return new Promise((resolve) => rl.question(question, (answer) => resolve(answer.trim())))
  }

  rl.pause()
  process.stdout.write(question)

  return new Promise((resolve) => {
    const stdin = process.stdin
    const wasRaw = stdin.isRaw

    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')

    let value = ''

    const finish = (result: string) => {
      stdin.setRawMode(wasRaw)
      stdin.pause()
      stdin.removeListener('data', onData)
      rl.resume()
      process.stdout.write('\n')
      resolve(result)
    }

    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') return finish(value)
        if (char === '\u0003') return finish('')
        if (char === '\u007f' || char === '\b') {
          if (value) {
            value = value.slice(0, -1)
            process.stdout.write('\b \b')
          }
          continue
        }
        if (char >= ' ') {
          value += char
          process.stdout.write('*')
        }
      }
    }

    stdin.on('data', onData)
  })
}

export function currentSettings(): Settings {
  return loadSettings()
}
