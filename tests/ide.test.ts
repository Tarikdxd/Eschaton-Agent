import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { startIde } from '../src/ide/server.js'
import type { IdeOptions } from '../src/ide/server.js'

let dir: string
let ide: { url: string; close: () => Promise<void> }

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eschaton-ide-'))
  fs.mkdirSync(path.join(dir, 'src'))
  fs.writeFileSync(path.join(dir, 'src', 'index.ts'), 'export const answer = 42\n', 'utf-8')

  process.env.OPENAI_BASE_URL = 'http://127.0.0.1:9/v1'
  process.env.OPENAI_API_KEY = 'test'

  const options: IdeOptions = { cwd: dir, port: 0, open: false }
  ide = await startIde(options)
})

afterAll(async () => {
  await ide?.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('ide server', () => {
  test('reports the workspace', async () => {
    const state = (await (await fetch(`${ide.url}/api/state`)).json()) as any
    expect(state.name).toBe(path.basename(dir))
    expect(state.cwd).toBe(dir)
    expect(state.providers.length).toBeGreaterThan(0)
  })

  test('lists the tree and reads a file', async () => {
    const tree = (await (await fetch(`${ide.url}/api/tree?path=.`)).json()) as any
    expect(tree.entries.some((entry: any) => entry.name === 'src' && entry.dir)).toBe(true)

    const file = (await (await fetch(`${ide.url}/api/file?path=src/index.ts`)).json()) as any
    expect(file.content).toContain('answer = 42')
  })

  test('writes a file', async () => {
    const response = await fetch(`${ide.url}/api/file`, {
      method: 'PUT',
      body: JSON.stringify({ path: 'src/new.ts', content: 'export const ok = true\n' }),
    })

    expect(response.status).toBe(200)
    expect(fs.readFileSync(path.join(dir, 'src', 'new.ts'), 'utf-8')).toContain('ok = true')
  })

  test('rejects paths outside the workspace', async () => {
    const response = await fetch(`${ide.url}/api/file?path=../../etc/passwd`)
    expect(response.status).toBe(400)
  })

  test('streams command output', async () => {
    const response = await fetch(`${ide.url}/api/exec`, {
      method: 'POST',
      body: JSON.stringify({ command: 'node -e "console.log(6 * 7)"' }),
    })

    const text = await response.text()
    expect(text).toContain('42')
    expect(text).toContain('"exit"')
  })

  test('serves the editor shell', async () => {
    const response = await fetch(`${ide.url}/`)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('Eschaton')
  })
})
