/**
 * Minimal MCP client.
 *
 * Reads server definitions from ~/.eschaton/mcp.json and .eschaton/mcp.json:
 *
 *   { "servers": { "fs": { "command": "npx", "args": ["-y", "pkg", "."] } } }
 *
 * Speaks JSON-RPC 2.0 over stdio (newline delimited), lists tools and exposes
 * them to the agent as mcp__<server>__<tool>.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import type { ToolSpec } from './llm/providers.js'
import { readJson } from './json.js'

export interface McpServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
}

export interface McpSummary {
  name: string
  tools: number
  error?: string
}

export interface McpBundle {
  tools: ToolSpec[]
  handlers: Record<string, (args: Record<string, any>) => Promise<string>>
  servers: McpSummary[]
  close: () => void
}

const GLOBAL_FILE = path.join(os.homedir(), '.eschaton', 'mcp.json')

class McpConnection {
  private child: ChildProcess
  private nextId = 1
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>()
  private buffer = ''
  private stderr = ''
  public closed = false

  constructor(command: string, args: string[], cwd: string, env: Record<string, string> = {}) {
    const line = [command, ...args].join(' ')

    this.child = spawn(line, {
      cwd,
      shell: true,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    })

    this.child.stdout?.on('data', (chunk) => this.onData(String(chunk)))
    this.child.stderr?.on('data', (chunk) => {
      this.stderr = (this.stderr + String(chunk)).slice(-2000)
    })

    this.child.on('close', () => {
      this.closed = true
      for (const [, item] of this.pending) item.reject(new Error(`MCP server exited. ${this.stderr}`.trim()))
      this.pending.clear()
    })
  }

  private onData(chunk: string): void {
    this.buffer += chunk

    let newline = this.buffer.indexOf('\n')
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim()
      this.buffer = this.buffer.slice(newline + 1)
      newline = this.buffer.indexOf('\n')

      if (!line) continue

      try {
        const message = JSON.parse(line)
        if (typeof message.id === 'number' && this.pending.has(message.id)) {
          const item = this.pending.get(message.id)!
          this.pending.delete(message.id)
          if (message.error) item.reject(new Error(message.error.message ?? 'MCP error'))
          else item.resolve(message.result)
        }
      } catch {
        // Not a JSON-RPC line.
      }
    }
  }

  public request(method: string, params: unknown, timeoutMs = 20_000): Promise<any> {
    if (this.closed) return Promise.reject(new Error('MCP server is not running'))

    const id = this.nextId++
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params })

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`MCP ${method} timed out. ${this.stderr}`.trim()))
      }, timeoutMs)

      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        },
      })

      this.child.stdin?.write(`${payload}\n`)
    })
  }

  public notify(method: string, params?: unknown): void {
    this.child.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`)
  }

  public close(): void {
    try {
      this.child.kill()
    } catch {
      // Already gone.
    }
  }
}

function loadConfig(cwd: string): Record<string, McpServerConfig> {
  const servers: Record<string, McpServerConfig> = {}

  for (const file of [GLOBAL_FILE, path.join(cwd, '.eschaton', 'mcp.json')]) {
    const raw = readJson<any>(file)
    if (!raw?.servers || typeof raw.servers !== 'object') continue

    for (const [name, config] of Object.entries<any>(raw.servers)) {
      if (!config?.command) continue
      servers[name] = {
        command: String(config.command),
        args: Array.isArray(config.args) ? config.args.map(String) : [],
        env: config.env && typeof config.env === 'object' ? config.env : undefined,
      }
    }
  }

  // mcptoon is a local gateway: one compact endpoint for every MCP server the
  // user configured elsewhere. Attach it automatically when it is installed.
  if (process.env.ESCHATON_MCPTOON !== '0' && !servers.mcptoon && commandExists('mcptoon')) {
    servers.mcptoon = { command: 'mcptoon', args: ['serve'] }
  }

  return servers
}

function commandExists(command: string): boolean {
  const paths = (process.env.PATH ?? '').split(path.delimiter)
  const extensions = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : ['']

  return paths.some((dir) => extensions.some((extension) => fs.existsSync(path.join(dir, `${command}${extension}`))))
}

export async function connectMcp(cwd: string): Promise<McpBundle> {
  const bundle: McpBundle = { tools: [], handlers: {}, servers: [], close: () => {} }
  const connections: McpConnection[] = []
  const configs = loadConfig(cwd)

  bundle.close = () => connections.forEach((connection) => connection.close())

  for (const [name, config] of Object.entries(configs)) {
    const connection = new McpConnection(config.command, config.args ?? [], cwd, config.env)
    connections.push(connection)

    try {
      await connection.request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'eschaton-code', version: '3.3.0' },
      })
      connection.notify('notifications/initialized')

      const listing = await connection.request('tools/list', {})
      const tools = Array.isArray(listing?.tools) ? listing.tools : []

      for (const tool of tools) {
        const original: string = tool.name
        const exposed = `mcp__${sanitize(name)}__${sanitize(original)}`

        bundle.tools.push({
          type: 'function',
          function: {
            name: exposed,
            description: `[${name}] ${tool.description ?? original}`,
            parameters: tool.inputSchema ?? { type: 'object', properties: {} },
          },
        })

        bundle.handlers[exposed] = async (args) => {
          const result = await connection.request('tools/call', { name: original, arguments: args }, 120_000)
          const content = Array.isArray(result?.content) ? result.content : []

          const text = content
            .map((item: any) => (item?.type === 'text' ? item.text : item?.type ? `[${item.type}]` : ''))
            .filter(Boolean)
            .join('\n')

          if (result?.isError) throw new Error(text || 'MCP tool failed')
          return text || '(no output)'
        }
      }

      bundle.servers.push({ name, tools: tools.length })
    } catch (err: any) {
      connection.close()
      bundle.servers.push({ name, tools: 0, error: String(err?.message ?? err) })
    }
  }

  return bundle
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_')
}
