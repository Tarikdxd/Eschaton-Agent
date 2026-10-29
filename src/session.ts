import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ChatMessage } from './llm/providers.js'

export interface SessionFile {
  id: string
  createdAt: string
  cwd: string
  mode: string
  model?: string
  messages: ChatMessage[]
}

const SESSION_DIR = path.join(os.homedir(), '.eschaton', 'sessions')

export function saveSession(session: Omit<SessionFile, 'id' | 'createdAt'> & { id?: string }): SessionFile {
  fs.mkdirSync(SESSION_DIR, { recursive: true })

  const record: SessionFile = {
    id: session.id ?? newId(),
    createdAt: new Date().toISOString(),
    cwd: session.cwd,
    mode: session.mode,
    model: session.model,
    messages: session.messages,
  }

  fs.writeFileSync(path.join(SESSION_DIR, `${record.id}.json`), JSON.stringify(record, null, 2), 'utf-8')
  prune()
  return record
}

export function loadSession(id: string): SessionFile | null {
  try {
    const raw = fs.readFileSync(path.join(SESSION_DIR, `${id}.json`), 'utf-8')
    return JSON.parse(raw) as SessionFile
  } catch {
    return null
  }
}

/** Most recent session started in this directory. */
export function latestSession(cwd: string = process.cwd()): SessionFile | null {
  const sessions = listSessions().filter((session) => path.resolve(session.cwd) === path.resolve(cwd))
  return sessions[0] ?? null
}

export function listSessions(): SessionFile[] {
  try {
    return fs
      .readdirSync(SESSION_DIR)
      .filter((name) => name.endsWith('.json'))
      .map((name) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(SESSION_DIR, name), 'utf-8')) as SessionFile
        } catch {
          return null
        }
      })
      .filter((session): session is SessionFile => Boolean(session))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  } catch {
    return []
  }
}

function prune(keep = 50): void {
  const sessions = listSessions()
  for (const session of sessions.slice(keep)) {
    try {
      fs.unlinkSync(path.join(SESSION_DIR, `${session.id}.json`))
    } catch {
      // Ignore files that disappeared.
    }
  }
}

function newId(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const suffix = Math.random().toString(36).slice(2, 6)
  return `${stamp}-${suffix}`
}
