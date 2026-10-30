/**
 * Episodic memory, in the spirit of claude-mem: keep a short record of what
 * happened in a directory and put the recent entries back into the prompt.
 *
 * One JSONL file per working directory under ~/.eschaton/memory.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

export interface Episode {
  at: string
  prompt: string
  files: string[]
  outcome?: string
}

const DIR = path.join(os.homedir(), '.eschaton', 'memory')
const MAX_LINES = 200

export function recordEpisode(cwd: string, episode: Episode): void {
  try {
    fs.mkdirSync(DIR, { recursive: true })
    const file = fileFor(cwd)
    fs.appendFileSync(file, `${JSON.stringify(episode)}\n`, 'utf-8')
    prune(file)
  } catch {
    // Memory is best effort.
  }
}

export function recentEpisodes(cwd: string, limit = 6): Episode[] {
  try {
    const lines = fs.readFileSync(fileFor(cwd), 'utf-8').split('\n').filter(Boolean)
    return lines
      .slice(-limit)
      .map((line) => {
        try {
          return JSON.parse(line) as Episode
        } catch {
          return null
        }
      })
      .filter((episode): episode is Episode => Boolean(episode?.prompt))
  } catch {
    return []
  }
}

export function formatEpisodes(episodes: Episode[]): string {
  if (!episodes.length) return ''

  const lines = episodes.map((episode) => {
    const date = episode.at.slice(0, 16).replace('T', ' ')
    const files = episode.files.length ? ` (${episode.files.slice(0, 4).join(', ')})` : ''
    return `- ${date} ${episode.prompt.slice(0, 180)}${files}`
  })

  return `\n\nRecent work in this directory:\n${lines.join('\n')}`
}

function fileFor(cwd: string): string {
  const hash = crypto.createHash('sha1').update(path.resolve(cwd)).digest('hex').slice(0, 12)
  return path.join(DIR, `${hash}.jsonl`)
}

function prune(file: string): void {
  try {
    const lines = fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean)
    if (lines.length <= MAX_LINES) return
    fs.writeFileSync(file, `${lines.slice(-MAX_LINES).join('\n')}\n`, 'utf-8')
  } catch {
    // Ignore.
  }
}
