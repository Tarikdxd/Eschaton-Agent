/**
 * Skills.
 *
 * A skill is a folder with a SKILL.md file: YAML frontmatter (name,
 * description, optional always) and a body of instructions. The catalog is
 * added to the system prompt on every turn; the model calls use_skill to load
 * the full text. Skills marked always are included in full.
 *
 * Lookup order: bundled skills, then .eschaton/skills in the project, then
 * ~/.eschaton/skills.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export interface Skill {
  name: string
  description: string
  body: string
  source: string
  always: boolean
}

const ALWAYS = new Set(['using-superpowers', 'karpathy-guidelines', 'ponytail'])

export function bundledSkillRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.join(here, 'skills'),
    path.join(here, '..', 'skills'),
    path.join(here, '..', '..', 'skills'),
  ]

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0]!
}

export function skillRoots(cwd: string): string[] {
  return [bundledSkillRoot(), path.join(cwd, '.eschaton', 'skills'), path.join(os.homedir(), '.eschaton', 'skills')]
}

export function loadSkills(cwd: string): Skill[] {
  const found = new Map<string, Skill>()

  for (const root of skillRoots(cwd)) {
    if (!fs.existsSync(root)) continue
    for (const file of findSkillFiles(root, 0)) {
      const skill = parseSkill(file)
      if (skill && !found.has(skill.name)) found.set(skill.name, skill)
    }
  }

  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function findSkill(skills: Skill[], name: string): Skill | undefined {
  return skills.find((skill) => skill.name === name)
}

/** Catalog for the system prompt: always-on skills in full, the rest by name. */
export function skillPrompt(skills: Skill[]): string {
  if (!skills.length) return ''

  const always = skills.filter((skill) => skill.always)
  const rest = skills.filter((skill) => !skill.always)

  const lines = [
    '',
    '## Skills',
    '',
    'Before answering, check this list. If a skill matches the task, call use_skill with its name and follow it. This is mandatory, not optional.',
    '',
  ]

  for (const skill of rest) {
    lines.push(`- ${skill.name}: ${skill.description}`)
  }

  for (const skill of always) {
    lines.push('', `### Always-on skill: ${skill.name}`, '', skill.body.trim().slice(0, 12_000))
  }

  return lines.join('\n')
}

function findSkillFiles(dir: string, depth: number): string[] {
  if (depth > 4) return []

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }

  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...findSkillFiles(full, depth + 1))
    } else if (entry.name === 'SKILL.md' || entry.name === 'skill.md') {
      files.push(full)
    }
  }

  return files
}

function parseSkill(file: string): Skill | null {
  let raw: string
  try {
    raw = fs.readFileSync(file, 'utf-8').replace(/^\uFEFF/, '')
  } catch {
    return null
  }

  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return null

  const meta: Record<string, string> = {}
  const lines = match[1]!.split(/\r?\n/)

  for (let i = 0; i < lines.length; i++) {
    const pair = lines[i]!.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!pair) continue

    const key = pair[1]!
    let value = pair[2]!.trim()

    // YAML block scalars: description: > or | followed by indented lines.
    if (value === '>' || value === '|') {
      const folded: string[] = []
      while (i + 1 < lines.length && /^\s+/.test(lines[i + 1]!)) {
        folded.push(lines[++i]!.trim())
      }
      value = value === '>' ? folded.join(' ') : folded.join('\n')
    }

    meta[key] = value.replace(/^["']|["']$/g, '').trim()
  }

  const name = (meta.name ?? path.basename(path.dirname(file))).trim()
  if (!name) return null

  return {
    name,
    description: (meta.description ?? '').slice(0, 400),
    body: match[2] ?? '',
    source: file,
    always: meta.always === 'true' || ALWAYS.has(name),
  }
}
