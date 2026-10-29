/**
 * Permission rules.
 *
 * Rules live in ~/.eschaton/permissions.json and .eschaton/permissions.json in
 * the project. The project file wins because both are merged in that order.
 *
 *   { "allow": ["run_command:npm test*", "write_file:docs/*"], "deny": ["run_command:rm -rf *"] }
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readJson } from './json.js'

export type Decision = 'allow' | 'deny' | 'ask'

export interface Policy {
  allow: string[]
  deny: string[]
}

const GLOBAL_FILE = path.join(os.homedir(), '.eschaton', 'permissions.json')

export function projectFile(cwd: string): string {
  return path.join(cwd, '.eschaton', 'permissions.json')
}

export function loadPolicy(cwd: string): Policy {
  const policy: Policy = { allow: [], deny: [] }

  for (const file of [GLOBAL_FILE, projectFile(cwd)]) {
    const raw = readJson<any>(file)
    if (!raw) continue
    if (Array.isArray(raw.allow)) policy.allow.push(...raw.allow.map(String))
    if (Array.isArray(raw.deny)) policy.deny.push(...raw.deny.map(String))
  }

  return policy
}

function subject(tool: string, args: Record<string, any>): string {
  if (tool === 'run_command') return String(args.command ?? '')
  if (tool === 'read_file' || tool === 'write_file' || tool === 'edit_file') return String(args.filePath ?? '')
  if (tool === 'list_dir') return String(args.dirPath ?? '.')
  if (tool === 'search_code') return String(args.pattern ?? '')
  return ''
}

function match(rule: string, tool: string, args: Record<string, any>): boolean {
  const separator = rule.indexOf(':')
  const ruleTool = separator >= 0 ? rule.slice(0, separator) : rule
  const pattern = separator >= 0 ? rule.slice(separator + 1) : '*'

  if (ruleTool !== '*' && ruleTool !== tool) return false
  if (!pattern || pattern === '*') return true

  const value = subject(tool, args)
  if (pattern.endsWith('*')) return value.startsWith(pattern.slice(0, -1))
  return value === pattern
}

export function decide(policy: Policy, tool: string, args: Record<string, any>): Decision {
  for (const rule of policy.deny) {
    if (match(rule, tool, args)) return 'deny'
  }
  for (const rule of policy.allow) {
    if (match(rule, tool, args)) return 'allow'
  }
  return 'ask'
}

/** Rule to store when the user answers "always". */
export function suggestRule(tool: string, args: Record<string, any>): string {
  const value = subject(tool, args)

  if (tool === 'run_command') {
    const first = value.trim().split(/\s+/).slice(0, 2).join(' ')
    return first ? `run_command:${first}*` : 'run_command:*'
  }

  if (tool === 'write_file' || tool === 'edit_file') {
    const dir = value.includes('/') ? value.slice(0, value.lastIndexOf('/') + 1) : ''
    return dir ? `${tool}:${dir}*` : `${tool}:*`
  }

  return `${tool}:*`
}

export function addRule(cwd: string, rule: string): void {
  const file = projectFile(cwd)
  const policy = loadPolicy(cwd)
  if (policy.allow.includes(rule)) return

  const own = readFile(file)
  own.allow.push(rule)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(own, null, 2), 'utf-8')
}

function readFile(file: string): Policy {
  const raw = readJson<any>(file)
  return {
    allow: Array.isArray(raw?.allow) ? raw.allow.map(String) : [],
    deny: Array.isArray(raw?.deny) ? raw.deny.map(String) : [],
  }
}
