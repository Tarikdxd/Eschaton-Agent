/**
 * Tool hooks.
 *
 * .eschaton/hooks.json can run a shell command before and after every tool
 * call. A non-zero exit from preTool blocks the call.
 *
 *   { "preTool": "node scripts/check-tool.js", "postTool": "npm run lint --silent" }
 */

import path from 'node:path'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { readJson } from './json.js'

const execAsync = promisify(exec)

export interface Hooks {
  preTool?: string
  postTool?: string
}

export function loadHooks(cwd: string): Hooks {
  const raw = readJson<any>(path.join(cwd, '.eschaton', 'hooks.json'))
  return {
    preTool: typeof raw?.preTool === 'string' ? raw.preTool : undefined,
    postTool: typeof raw?.postTool === 'string' ? raw.postTool : undefined,
  }
}

export interface HookResult {
  ok: boolean
  output: string
}

export async function runHook(
  command: string,
  cwd: string,
  env: Record<string, string>,
  timeoutMs = 30_000,
): Promise<HookResult> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, ...env },
      shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
    })
    return { ok: true, output: [stdout, stderr].filter(Boolean).join('\n').trim() }
  } catch (err: any) {
    return { ok: false, output: [err?.stdout, err?.stderr, err?.message].filter(Boolean).join('\n') }
  }
}
