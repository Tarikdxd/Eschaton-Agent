import { afterAll, describe, expect, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { addRule, decide, loadPolicy, suggestRule } from '../src/permissions.js'
import { formatTodo, normalizeTodos } from '../src/todos.js'
import { connectMcp } from '../src/mcp.js'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eschaton-tools-'))

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('permissions', () => {
  test('deny wins over allow, prefix globs match', () => {
    const policy = {
      allow: ['run_command:npm test*', 'write_file:docs/*'],
      deny: ['run_command:rm -rf*'],
    }

    expect(decide(policy, 'run_command', { command: 'npm test --watch' })).toBe('allow')
    expect(decide(policy, 'run_command', { command: 'rm -rf /' })).toBe('deny')
    expect(decide(policy, 'run_command', { command: 'ls' })).toBe('ask')
    expect(decide(policy, 'write_file', { filePath: 'docs/a.md' })).toBe('allow')
    expect(decide(policy, 'write_file', { filePath: 'src/a.ts' })).toBe('ask')
  })

  test('suggests narrow rules', () => {
    expect(suggestRule('run_command', { command: 'npm test --watch' })).toBe('run_command:npm test*')
    expect(suggestRule('edit_file', { filePath: 'src/deep/a.ts' })).toBe('edit_file:src/deep/*')
  })

  test('persists rules in the project file', () => {
    addRule(dir, 'run_command:git status*')

    const policy = loadPolicy(dir)
    expect(policy.allow).toContain('run_command:git status*')
    expect(decide(policy, 'run_command', { command: 'git status --short' })).toBe('allow')
  })
})

describe('todos', () => {
  test('normalizes and formats task lists', () => {
    const todos = normalizeTodos([
      { text: 'read the code', status: 'done' },
      { text: 'write the fix', status: 'in_progress' },
      { text: 'run tests' },
      { nope: true },
    ])

    expect(todos).toHaveLength(3)
    expect(formatTodo(todos[0]!)).toBe('[x] read the code')
    expect(formatTodo(todos[1]!)).toBe('[~] write the fix')
    expect(formatTodo(todos[2]!)).toBe('[ ] run tests')
  })
})

describe('mcp', () => {
  test('returns an empty bundle without configuration', async () => {
    process.env.ESCHATON_MCPTOON = '0'
    const bundle = await connectMcp(dir)
    delete process.env.ESCHATON_MCPTOON

    expect(bundle.tools).toHaveLength(0)
    expect(bundle.servers).toHaveLength(0)
    bundle.close()
  })
})
