/**
 * Project memory.
 *
 * Reads the same kind of instruction files other terminal agents use, so an
 * existing CLAUDE.md or AGENTS.md keeps working. The content is injected into
 * the system prompt at the start of every conversation.
 */

import fs from 'node:fs'
import path from 'node:path'
import { formatEpisodes, recentEpisodes } from './memory-store.js'

const CANDIDATES = ['ESCHATON.md', 'AGENTS.md', 'CLAUDE.md']
const MAX_BYTES = 16_000

export interface MemoryFile {
  source: string
  content: string
}

export function loadMemory(cwd: string): MemoryFile[] {
  const found: MemoryFile[] = []

  for (const name of CANDIDATES) {
    const file = path.join(cwd, name)
    try {
      if (!fs.existsSync(file)) continue
      const raw = fs.readFileSync(file, 'utf-8')
      found.push({ source: name, content: raw.slice(0, MAX_BYTES) })
    } catch {
      // Unreadable file.
    }
  }

  return found
}

export function memoryBlock(cwd: string): string {
  const files = loadMemory(cwd)
  const episodes = formatEpisodes(recentEpisodes(cwd))

  if (!files.length && !episodes) return ''

  const parts = files.map(
    (file) => `--- ${file.source} ---\n${file.content.trim()}\n--- end of ${file.source} ---`,
  )

  const instructions = files.length
    ? `\n\nProject instructions, written by the user. Follow them.\n${parts.join('\n\n')}`
    : ''

  return `${instructions}${episodes}`
}
