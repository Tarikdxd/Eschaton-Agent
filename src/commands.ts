/**
 * Custom slash commands.
 *
 * Any markdown file in .eschaton/commands becomes a slash command. The first
 * non-empty line is used as the description; $ARGUMENTS is replaced with the
 * text typed after the command name.
 */

import fs from 'node:fs'
import path from 'node:path'

export interface CustomCommand {
  name: string
  description: string
  body: string
  source: string
}

const COMMAND_DIR = path.join('.eschaton', 'commands')

export function loadCommands(cwd: string): CustomCommand[] {
  const dir = path.join(cwd, COMMAND_DIR)
  if (!fs.existsSync(dir)) return []

  const commands: CustomCommand[] = []

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue

    try {
      const source = path.join(COMMAND_DIR, entry.name)
      const body = fs.readFileSync(path.join(dir, entry.name), 'utf-8')
      const firstLine = body
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line && !line.startsWith('#')) ?? ''

      commands.push({
        name: entry.name.replace(/\.md$/, ''),
        description: firstLine.slice(0, 100),
        body,
        source,
      })
    } catch {
      // Unreadable command file.
    }
  }

  return commands.sort((a, b) => a.name.localeCompare(b.name))
}

export function expandCommand(command: CustomCommand, argument: string): string {
  const body = command.body.replace(/^\s*#[^\n]*\n/, '')
  return body.includes('$ARGUMENTS') ? body.replaceAll('$ARGUMENTS', argument) : `${body}\n\n${argument}`.trim()
}
