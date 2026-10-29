import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export interface Settings {
  provider?: string
  apiKey?: string
  model?: string
  baseUrl?: string
}

export const CONFIG_DIR = path.join(os.homedir(), '.eschaton')
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

export function loadSettings(): Settings {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed as Settings
  } catch {
    // No config file yet, or it is not valid JSON.
  }
  return {}
}

export function saveSettings(settings: Settings): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(settings, null, 2), { encoding: 'utf-8', mode: 0o600 })
}

export function maskKey(key: string | undefined): string {
  if (!key) return 'not set'
  if (key.length <= 10) return 'set'
  return `${key.slice(0, 6)}...${key.slice(-4)}`
}
