import { afterAll, describe, expect, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadMemory, memoryBlock } from '../src/memory.js'
import { expandCommand, loadCommands } from '../src/commands.js'
import { CodingAgent } from '../src/agent/coding-agent.js'
import { ProviderPool } from '../src/llm/providers.js'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eschaton-feat-'))

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('project memory', () => {
  test('reads CLAUDE.md and AGENTS.md', () => {
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), 'Always run bun test.', 'utf-8')
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), 'Use tabs.', 'utf-8')

    const files = loadMemory(dir)
    expect(files.map((file) => file.source)).toEqual(['AGENTS.md', 'CLAUDE.md'])

    const block = memoryBlock(dir)
    expect(block).toContain('Always run bun test.')
    expect(block).toContain('Use tabs.')
  })

  test('ends up in the system prompt', () => {
    const agent = new CodingAgent(new ProviderPool([]), dir)
    const system = agent.getHistory()[0]?.content ?? ''
    expect(system).toContain('Always run bun test.')
  })
})

describe('custom commands', () => {
  test('loads markdown files and expands arguments', () => {
    const commandsDir = path.join(dir, '.eschaton', 'commands')
    fs.mkdirSync(commandsDir, { recursive: true })
    fs.writeFileSync(path.join(commandsDir, 'review.md'), '# Review\n\nReview $ARGUMENTS carefully.', 'utf-8')

    const commands = loadCommands(dir)
    expect(commands).toHaveLength(1)
    expect(commands[0]?.name).toBe('review')
    expect(commands[0]?.description).toBe('Review $ARGUMENTS carefully.')

    const expanded = expandCommand(commands[0]!, 'src/app.ts')
    expect(expanded).toContain('Review src/app.ts carefully.')
    expect(expanded).not.toContain('# Review')
  })
})
