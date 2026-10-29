/**
 * Local IDE server.
 *
 * Serves the editor UI, exposes the workspace over a small JSON API and streams
 * agent output with server-sent events. Bound to 127.0.0.1 only.
 */

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { ProviderPool, providersFromSettings, type ChatMessage } from '../llm/providers.js'
import { CodingAgent, type Mode, type ToolPreview } from '../agent/coding-agent.js'
import { listSessions, loadSession, saveSession } from '../session.js'

export interface IdeOptions {
  cwd: string
  port: number
  open: boolean
  model?: string
  mode?: Mode
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.cache', 'coverage'])
const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_FILES = 5000

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
}

export async function startIde(options: IdeOptions): Promise<{ url: string; close: () => Promise<void> }> {
  const root = path.resolve(options.cwd)
  const pool = new ProviderPool(providersFromSettings())
  if (options.model) pool.setModel(options.model)
  await pool.detectLocal()

  const approvals = new Map<string, (allow: boolean) => void>()
  const agents = new Map<string, CodingAgent>()
  const publicDir = findPublicDir()

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      if (!res.headersSent) sendJson(res, 500, { error: String(err?.message ?? err) })
      else res.end()
    })
  })

  async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const route = url.pathname

    if (route === '/api/state') {
      return sendJson(res, 200, {
        cwd: root,
        name: path.basename(root),
        model: pool.active()?.model ?? null,
        provider: pool.active()?.label ?? null,
        providers: pool.list().map((provider) => ({
          id: provider.id,
          label: provider.label,
          model: provider.model,
          local: provider.local,
        })),
        sessions: listSessions()
          .filter((session) => path.resolve(session.cwd) === root)
          .slice(0, 20)
          .map((session) => ({
            id: session.id,
            createdAt: session.createdAt,
            mode: session.mode,
            model: session.model,
            messages: session.messages.filter((message) => message.role === 'user').length,
          })),
      })
    }

    if (route === '/api/tree') {
      const relative = url.searchParams.get('path') ?? '.'
      const target = safePath(root, relative)
      if (!target) return sendJson(res, 400, { error: 'path outside the workspace' })

      const entries = fs
        .readdirSync(target, { withFileTypes: true })
        .filter((entry) => !entry.name.startsWith('.'))
        .map((entry) => ({
          name: entry.name,
          path: path.relative(root, path.join(target, entry.name)).replace(/\\/g, '/'),
          dir: entry.isDirectory(),
        }))
        .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name))

      return sendJson(res, 200, { entries })
    }

    if (route === '/api/files') {
      const files: string[] = []
      walk(root, files)
      return sendJson(res, 200, { files })
    }

    if (route === '/api/file' && req.method === 'GET') {
      const relative = url.searchParams.get('path') ?? ''
      const target = safePath(root, relative)
      if (!target) return sendJson(res, 400, { error: 'path outside the workspace' })
      if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
        return sendJson(res, 404, { error: 'file not found' })
      }
      if (fs.statSync(target).size > MAX_FILE_BYTES) return sendJson(res, 413, { error: 'file is too large' })
      return sendJson(res, 200, { path: relative, content: fs.readFileSync(target, 'utf-8') })
    }

    if (route === '/api/file' && req.method === 'PUT') {
      const body = await readJson<{ path: string; content: string }>(req)
      const target = safePath(root, body.path)
      if (!target) return sendJson(res, 400, { error: 'path outside the workspace' })
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, body.content ?? '', 'utf-8')
      return sendJson(res, 200, { ok: true })
    }

    if (route === '/api/model' && req.method === 'POST') {
      const body = await readJson<{ model: string }>(req)
      pool.setModel(body.model)
      return sendJson(res, 200, { model: pool.active()?.model })
    }

    if (route === '/api/exec' && req.method === 'POST') {
      const body = await readJson<{ command: string }>(req)
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })

      const child = spawn(body.command, {
        cwd: root,
        shell: true,
        windowsHide: true,
      })

      child.stdout.on('data', (chunk) => emit(res, { type: 'stdout', text: String(chunk) }))
      child.stderr.on('data', (chunk) => emit(res, { type: 'stderr', text: String(chunk) }))
      child.on('close', (code) => {
        emit(res, { type: 'exit', code })
        res.end()
      })
      child.on('error', (err) => {
        emit(res, { type: 'stderr', text: `${err.message}\n` })
        emit(res, { type: 'exit', code: 1 })
        res.end()
      })

      req.on('close', () => child.kill())
      return
    }

    if (route === '/api/chat' && req.method === 'POST') {
      const body = await readJson<{ sessionId?: string; message: string; mode?: Mode }>(req)
      return chat(res, body)
    }

    if (route === '/api/approve' && req.method === 'POST') {
      const body = await readJson<{ id: string; allow: boolean }>(req)
      approvals.get(body.id)?.(Boolean(body.allow))
      approvals.delete(body.id)
      return sendJson(res, 200, { ok: true })
    }

    return serveStatic(route, res)
  }

  async function chat(
    res: http.ServerResponse,
    body: { sessionId?: string; message: string; mode?: Mode },
  ): Promise<void> {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })

    const session = body.sessionId ? loadSession(body.sessionId) : null
    const sessionId = body.sessionId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const mode = body.mode ?? ((session?.mode as Mode) ?? 'Build')

    let agent = agents.get(sessionId)
    if (!agent) {
      agent = new CodingAgent(pool, root, mode)
      if (session?.messages?.length) agent.setHistory(session.messages as ChatMessage[])
      agents.set(sessionId, agent)
    }
    agent.setMode(mode)

    emit(res, { type: 'start', sessionId })

    const controller = new AbortController()
    res.on('close', () => controller.abort())

    try {
      const result = await agent.run(
        body.message,
        {
          onToken: (text) => emit(res, { type: 'token', text }),
          onToolStart: (call, preview) => emit(res, { type: 'tool', name: call.tool, preview: publicPreview(preview) }),
          onToolEnd: (toolResult) =>
            emit(res, {
              type: 'tool_end',
              name: toolResult.tool,
              isError: toolResult.isError,
              output: toolResult.output.slice(0, 2000),
            }),
        },
        {
          signal: controller.signal,
          approve: (call, preview) => askApproval(res, approvals, call.tool, publicPreview(preview)),
        },
      )

      saveSession({
        id: sessionId,
        cwd: root,
        mode: agent.getMode(),
        model: pool.active()?.model,
        messages: agent.getHistory(),
      })

      emit(res, { type: 'done', steps: result.steps, usage: result.usage, provider: result.provider })
    } catch (err: any) {
      emit(res, { type: 'error', message: String(err?.message ?? err) })
    } finally {
      res.end()
    }
  }

  function askApproval(
    res: http.ServerResponse,
    pending: Map<string, (allow: boolean) => void>,
    tool: string,
    preview: ReturnType<typeof publicPreview>,
  ): Promise<boolean> {
    const id = Math.random().toString(36).slice(2, 10)

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        resolve(false)
      }, 300_000)

      pending.set(id, (allow) => {
        clearTimeout(timer)
        resolve(allow)
      })

      emit(res, { type: 'approval', id, tool, preview })
    })
  }

  async function serveStatic(route: string, res: http.ServerResponse): Promise<void> {
    const clean = route === '/' ? 'index.html' : decodeURIComponent(route).replace(/^\/+/, '')
    const target = path.join(publicDir, clean)
    if (!target.startsWith(publicDir) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      return sendJson(res, 404, { error: 'not found' })
    }

    res.writeHead(200, { 'Content-Type': MIME[path.extname(target)] ?? 'application/octet-stream' })
    fs.createReadStream(target).pipe(res)
  }

  function walk(dir: string, out: string[]): void {
    if (out.length >= MAX_FILES) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (out.length >= MAX_FILES) return
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full, out)
      else out.push(path.relative(root, full).replace(/\\/g, '/'))
    }
  }

  const port = await listen(server, options.port)
  const url = `http://127.0.0.1:${port}`

  if (options.open) openBrowser(url)

  return {
    url,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve())
      }),
  }
}

function publicPreview(preview: ToolPreview) {
  return {
    kind: preview.kind,
    path: preview.path,
    command: preview.command,
    before: preview.before?.slice(0, 4000),
    after: preview.after?.slice(0, 4000),
    detail: preview.detail,
    needsApproval: preview.needsApproval,
  }
}

function safePath(root: string, relative: string): string | null {
  const target = path.resolve(root, relative)
  const normalizedRoot = root.endsWith(path.sep) ? root : root + path.sep
  return target === root || target.startsWith(normalizedRoot) ? target : null
}

function findPublicDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [path.join(here, 'public'), path.join(here, '../public'), path.join(here, 'web')]
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'index.html'))) return candidate
  }
  throw new Error('IDE assets not found. Run `npm run build` first.')
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(payload)
}

function emit(res: http.ServerResponse, payload: Record<string, unknown>): void {
  if (res.writableEnded) return
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

function readJson<T>(req: http.IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > MAX_FILE_BYTES) {
        reject(new Error('request body too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}') as T)
      } catch (err) {
        reject(err)
      }
    })
  })
}

function listen(server: http.Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    let attempt = 0

    const tryPort = (candidate: number) => {
      server.once('error', (err: any) => {
        if (err.code === 'EADDRINUSE' && attempt < 10) {
          attempt++
          tryPort(candidate + 1)
          return
        }
        reject(err)
      })

      server.listen(candidate, '127.0.0.1', () => {
        const address = server.address()
        resolve(typeof address === 'object' && address ? address.port : candidate)
      })
    }

    tryPort(port)
  })
}

function openBrowser(url: string): void {
  const command =
    process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`
  try {
    spawn(command, { shell: true, detached: true, stdio: 'ignore', windowsHide: true }).unref()
  } catch {
    // The URL is printed by the caller anyway.
  }
}
