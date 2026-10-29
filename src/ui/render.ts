import { c, sym } from './theme.js'
import type { ToolPreview } from '../agent/coding-agent.js'

/** Shows the changed block of a file: common prefix and suffix are skipped. */
export function renderDiff(before: string, after: string, maxLines = 16): string[] {
  const oldLines = before.split('\n')
  const newLines = after.split('\n')

  let prefix = 0
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) {
    prefix++
  }

  let suffix = 0
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix++
  }

  const removed = oldLines.slice(prefix, oldLines.length - suffix)
  const added = newLines.slice(prefix, newLines.length - suffix)

  const out: string[] = []
  if (prefix > 0) out.push(c.gray(`  ${prefix} unchanged line${prefix === 1 ? '' : 's'}`))

  for (const line of removed.slice(0, maxLines)) out.push(c.red(`  - ${line}`))
  if (removed.length > maxLines) out.push(c.red(`  - ... ${removed.length - maxLines} more removed`))

  for (const line of added.slice(0, maxLines)) out.push(c.green(`  + ${line}`))
  if (added.length > maxLines) out.push(c.green(`  + ... ${added.length - maxLines} more added`))

  if (!removed.length && !added.length) out.push(c.gray('  (no changes)'))
  return out
}

export function truncateLines(text: string, maxLines = 12, maxWidth = 160): string[] {
  const lines = text.split('\n')
  const shown = lines.slice(0, maxLines).map((line) => (line.length > maxWidth ? `${line.slice(0, maxWidth)}…` : line))
  if (lines.length > maxLines) shown.push(`… ${lines.length - maxLines} more lines`)
  return shown
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)} s`
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
}

export function formatTokens(prompt?: number, completion?: number): string {
  const total = (prompt ?? 0) + (completion ?? 0)
  if (!total) return ''
  if (total < 1000) return `${total} tokens`
  return `${(total / 1000).toFixed(1)}k tokens`
}

export function previewHeader(preview: ToolPreview): string {
  if (preview.kind === 'command') return c.gray(`$ ${preview.command}`)
  if (preview.kind === 'read') return c.gray(`read ${preview.path}`)
  if (preview.kind === 'list') return c.gray(`list ${preview.path}`)
  if (preview.kind === 'search') return c.gray(`search "${preview.detail}"`)
  return c.gray(`${preview.kind} ${preview.path}`)
}

export function toolLine(name: string, detail: string): string {
  return `${c.cyan(sym.tool)} ${c.bold(name)} ${c.gray(detail)}`
}

export function okLine(text: string): string {
  return `${c.green(sym.ok)} ${c.dim(text)}`
}

export function failLine(text: string): string {
  return `${c.red(sym.fail)} ${text}`
}
