import fs from 'node:fs'

/** Reads JSON and tolerates a UTF-8 BOM, which some editors add on Windows. */
export function readJson<T>(file: string): T | null {
  try {
    const raw = fs.readFileSync(file, 'utf-8').replace(/^\uFEFF/, '')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}
