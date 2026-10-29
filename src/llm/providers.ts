/**
 * Provider layer.
 *
 * Every provider speaks the OpenAI chat completions protocol, including the
 * `tools` parameter. Providers are tried in order and the pool falls over to
 * the next one when a request fails.
 *
 * Keys come from environment variables or from ~/.eschaton/config.json.
 * Local servers are discovered by probing their /models endpoint.
 */

import { loadSettings, type Settings } from '../config.js'

export interface ToolCall {
  id: string
  name: string
  arguments: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  name?: string
}

export interface ToolSpec {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface Usage {
  promptTokens?: number
  completionTokens?: number
}

export interface Provider {
  id: string
  label: string
  baseUrl: string
  model: string
  apiKey?: string
  headers?: Record<string, string>
  local: boolean
  /** Ordering hint: free tiers are tried before paid ones. */
  free?: boolean
  cooldownUntil: number
}

export interface GenerateOptions {
  messages: ChatMessage[]
  tools?: ToolSpec[]
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
  onChunk?: (chunk: string) => void
  onThinking?: (thought: string) => void
}

export interface GenerateResult {
  text: string
  toolCalls: ToolCall[]
  usage?: Usage
  provider: string
}

type Kind = 'openrouter' | 'gemini' | 'groq' | 'deepseek' | 'ollama' | 'lmstudio' | 'custom'

interface KindDefaults {
  label: string
  baseUrl: string
  envKey: string
  model: string
  local: boolean
  free: boolean
  headers?: Record<string, string>
}

const DEFAULTS: Record<Kind, KindDefaults> = {
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    envKey: 'OPENROUTER_API_KEY',
    model: 'deepseek/deepseek-chat-v3-0324:free',
    local: false,
    free: true,
    headers: {
      'HTTP-Referer': 'https://github.com/Tarikdxd/Eschaton-Code',
      'X-Title': 'Eschaton Code',
    },
  },
  gemini: {
    label: 'Google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    envKey: 'GEMINI_API_KEY',
    model: 'gemini-2.5-flash',
    local: false,
    free: true,
  },
  groq: {
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    envKey: 'GROQ_API_KEY',
    model: 'deepseek-r1-distill-llama-70b',
    local: false,
    free: true,
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/chat/completions',
    envKey: 'DEEPSEEK_API_KEY',
    model: 'deepseek-chat',
    local: false,
    free: false,
  },
  ollama: {
    label: 'Ollama',
    baseUrl: 'http://127.0.0.1:11434/v1/chat/completions',
    envKey: 'OLLAMA_API_KEY',
    model: 'deepseek-r1:7b',
    local: true,
    free: true,
  },
  lmstudio: {
    label: 'LM Studio',
    baseUrl: 'http://127.0.0.1:1234/v1/chat/completions',
    envKey: 'LMSTUDIO_API_KEY',
    model: 'deepseek-r1-distill-qwen-7b',
    local: true,
    free: true,
  },
  custom: {
    label: 'Custom endpoint',
    baseUrl: '',
    envKey: 'OPENAI_API_KEY',
    model: 'deepseek-chat',
    local: false,
    free: false,
  },
}

const HOSTED: Kind[] = ['openrouter', 'gemini', 'groq', 'deepseek', 'custom']
export const LOCAL_KINDS = ['ollama', 'lmstudio'] as const

function makeProvider(kind: Kind, settings: Settings, env: NodeJS.ProcessEnv): Provider | null {
  const defaults = DEFAULTS[kind]

  if (kind === 'custom') {
    const baseUrl = env.OPENAI_BASE_URL || settings.baseUrl
    const apiKey = env.OPENAI_API_KEY || settings.apiKey
    if (!baseUrl) return null
    return {
      id: kind,
      label: defaults.label,
      baseUrl: baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl.replace(/\/$/, '')}/chat/completions`,
      model: env.OPENAI_MODEL || settings.model || defaults.model,
      apiKey,
      local: false,
      free: false,
      cooldownUntil: 0,
    }
  }

  const selected = settings.provider === kind
  const apiKey = (selected && settings.apiKey) || env[defaults.envKey]
  if (!apiKey) return null

  return {
    id: kind,
    label: defaults.label,
    baseUrl: (selected && settings.baseUrl) || defaults.baseUrl,
    model: (selected && settings.model) || env.ESCHATON_MODEL || defaults.model,
    apiKey,
    headers: defaults.headers,
    local: false,
    free: defaults.free,
    cooldownUntil: 0,
  }
}

export function providersFromSettings(
  settings: Settings = loadSettings(),
  env: NodeJS.ProcessEnv = process.env,
): Provider[] {
  const providers: Provider[] = []

  for (const kind of HOSTED) {
    const provider = makeProvider(kind, settings, env)
    if (provider) providers.push(provider)
  }

  if (settings.provider) {
    providers.sort((a, b) => Number(b.id === settings.provider) - Number(a.id === settings.provider))
  }

  return providers
}

export async function listLocalModels(baseUrl: string, timeoutMs = 800): Promise<string[]> {
  const modelsUrl = baseUrl.replace(/\/v1\/chat\/completions$/, '/v1/models')
  try {
    const res = await fetch(modelsUrl, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return []
    const body = (await res.json()) as {
      data?: Array<{ id?: string }>
      models?: Array<{ name?: string }>
    }
    const ids = body.data?.map((m) => m.id).filter(Boolean) as string[] | undefined
    if (ids?.length) return ids
    return (body.models?.map((m) => m.name).filter(Boolean) as string[]) || []
  } catch {
    return []
  }
}

export class ProviderPool {
  private providers: Provider[]
  private activeIndex = 0

  constructor(providers: Provider[] = providersFromSettings()) {
    this.providers = providers
  }

  public list(): Provider[] {
    return this.providers
  }

  public active(): Provider | undefined {
    return this.providers[this.activeIndex] ?? this.providers[0]
  }

  public use(index: number): Provider | undefined {
    if (index < 0 || index >= this.providers.length) return undefined
    this.activeIndex = index
    return this.providers[index]
  }

  public useById(id: string): Provider | undefined {
    const index = this.providers.findIndex((provider) => provider.id === id)
    return index >= 0 ? this.use(index) : undefined
  }

  public setModel(model: string): void {
    const provider = this.active()
    if (provider) provider.model = model
  }

  /** Probes Ollama and LM Studio and adds whichever of them is running. */
  public async detectLocal(timeoutMs = 800): Promise<Provider[]> {
    const found: Provider[] = []

    for (const kind of LOCAL_KINDS) {
      const defaults = DEFAULTS[kind]
      const models = await listLocalModels(defaults.baseUrl, timeoutMs)
      if (!models.length) continue

      const model = models.find((name) => name.toLowerCase().includes('deepseek')) ?? models[0]!
      found.push({
        id: kind,
        label: defaults.label,
        baseUrl: defaults.baseUrl,
        model,
        local: true,
        free: true,
        cooldownUntil: 0,
      })
    }

    this.providers.push(...found)
    return found
  }

  public async generate(options: GenerateOptions): Promise<GenerateResult> {
    if (!this.providers.length) {
      throw new Error('No provider configured. Run `eschaton setup`.')
    }

    const now = Date.now()
    const order = [
      ...this.providers.slice(this.activeIndex),
      ...this.providers.slice(0, this.activeIndex),
    ].filter((provider) => provider.cooldownUntil <= now)

    if (!order.length) {
      throw new Error('Every provider is cooling down after a failure. Wait a minute and try again.')
    }

    const failures: string[] = []

    for (const provider of order) {
      try {
        const result = await this.call(provider, options)
        this.activeIndex = this.providers.indexOf(provider)
        provider.cooldownUntil = 0
        return { ...result, provider: provider.label }
      } catch (err: any) {
        if (isAbort(err)) throw new Error('cancelled')

        const status = err?.status
        if (status === 401 || status === 403 || status === 429 || (status >= 500 && status < 600)) {
          provider.cooldownUntil = Date.now() + 60_000
        }
        failures.push(`${provider.label}: ${explainError(err)}`)
      }
    }

    throw new Error(`All providers failed.\n${failures.map((line) => `  - ${line}`).join('\n')}`)
  }

  private async call(
    provider: Provider,
    options: GenerateOptions,
  ): Promise<{ text: string; toolCalls: ToolCall[]; usage?: Usage }> {
    const body: Record<string, unknown> = {
      model: provider.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 4096,
      stream: Boolean(options.onChunk),
      ...(options.onChunk ? { stream_options: { include_usage: true } } : {}),
    }

    if (options.tools?.length) {
      body.tools = options.tools
      body.tool_choice = 'auto'
    }

    const response = await this.post(provider, body, options.signal)

    if (response.status === 400 && options.tools?.length) {
      const detail = await response.text().catch(() => '')
      if (/tool|function/i.test(detail)) {
        // Provider does not support function calling; retry without it and let
        // the agent fall back to parsing a JSON block from the text.
        const retryBody = { ...body }
        delete retryBody.tools
        delete retryBody.tool_choice
        const retry = await this.post(provider, retryBody, options.signal)
        return this.read(retry, options, false)
      }

      const error: any = new Error(detail.slice(0, 300) || 'HTTP 400')
      error.status = 400
      throw error
    }

    return this.read(response, options, Boolean(options.tools?.length))
  }

  private post(provider: Provider, body: unknown, signal?: AbortSignal): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...provider.headers,
    }
    if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`

    return fetch(provider.baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: linkSignals(signal, 180_000),
    })
  }

  private async read(
    response: Response,
    options: GenerateOptions,
    allowTools: boolean,
  ): Promise<{ text: string; toolCalls: ToolCall[]; usage?: Usage }> {
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      const error: any = new Error(detail.slice(0, 300) || `HTTP ${response.status}`)
      error.status = response.status
      throw error
    }

    const contentType = response.headers.get('content-type') ?? ''
    const isStream = contentType.includes('event-stream')

    if (!options.onChunk || !response.body || !isStream) {
      const json = (await response.json()) as any
      const message = json.choices?.[0]?.message ?? {}
      if (options.onChunk && message.content) options.onChunk(message.content)

      return {
        text: message.content ?? '',
        toolCalls: allowTools ? readToolCalls(message) : [],
        usage: readUsage(json.usage),
      }
    }

    let text = ''
    let reasoning = ''
    let usage: Usage | undefined
    const partial: Array<{ id: string; name: string; arguments: string }> = []

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (!payload || payload === '[DONE]') continue

        try {
          const json = JSON.parse(payload)
          usage = readUsage(json.usage) ?? usage

          const delta = json.choices?.[0]?.delta ?? {}
          const content: string = delta.content ?? ''
          const thought: string = delta.reasoning_content ?? ''

          if (thought) {
            reasoning += thought
            options.onThinking?.(thought)
          }
          if (content) {
            text += content
            options.onChunk(content)
          }

          for (const call of delta.tool_calls ?? []) {
            const index = Number(call.index ?? 0)
            partial[index] ??= { id: '', name: '', arguments: '' }
            if (call.id) partial[index]!.id = call.id
            if (call.function?.name) partial[index]!.name = call.function.name
            if (call.function?.arguments) partial[index]!.arguments += call.function.arguments
          }
        } catch {
          // Keep-alive lines and partial JSON.
        }
      }
    }

    return {
      text: text || reasoning,
      toolCalls: allowTools ? partial.filter((call) => call.name) : [],
      usage,
    }
  }
}

function readToolCalls(message: any): ToolCall[] {
  const calls = message?.tool_calls
  if (!Array.isArray(calls)) return []

  return calls
    .filter((call: any) => call?.function?.name)
    .map((call: any, index: number) => ({
      id: call.id ?? `call_${index}`,
      name: call.function.name,
      arguments: call.function.arguments ?? '{}',
    }))
}

export function explainError(err: any): string {
  const status = err?.status
  if (status === 401 || status === 403) return 'API key rejected'
  if (status === 404) return 'model or endpoint not found'
  if (status === 429) return 'rate limited'
  if (status >= 500) return `server error (HTTP ${status})`
  if (err?.code === 'ECONNREFUSED') return 'connection refused, is the server running?'
  if (err?.name === 'TimeoutError') return 'request timed out'
  return err?.message || 'unknown error'
}

function readUsage(raw: any): Usage | undefined {
  if (!raw) return undefined
  return {
    promptTokens: raw.prompt_tokens ?? raw.promptTokens,
    completionTokens: raw.completion_tokens ?? raw.completionTokens,
  }
}

function isAbort(err: any): boolean {
  return err?.name === 'AbortError' || err?.name === 'TimeoutError'
}

function linkSignals(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}
