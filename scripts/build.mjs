import { build } from 'esbuild'
import fs from 'node:fs'

const cliOut = 'dist/eschaton.js'
const publicDir = 'dist/public'

await build({
  entryPoints: ['src/cli.ts'],
  outfile: cliOut,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  banner: { js: '#!/usr/bin/env node' },
  logLevel: 'info',
  sourcemap: false,
})

await build({
  entryPoints: ['src/ide/web/app.ts'],
  outfile: `${publicDir}/app.js`,
  bundle: true,
  format: 'iife',
  target: 'es2020',
  loader: { '.ttf': 'file', '.woff': 'file', '.woff2': 'file' },
  logLevel: 'info',
  sourcemap: false,
})

fs.mkdirSync(publicDir, { recursive: true })
fs.copyFileSync('src/ide/web/index.html', `${publicDir}/index.html`)
fs.copyFileSync('src/ide/web/style.css', `${publicDir}/style.css`)

const monacoSource = 'node_modules/monaco-editor/min/vs'
if (!fs.existsSync(monacoSource)) {
  throw new Error('monaco-editor is not installed. Run `bun install` first.')
}

fs.rmSync(`${publicDir}/vs`, { recursive: true, force: true })
fs.cpSync(monacoSource, `${publicDir}/vs`, { recursive: true })

fs.chmodSync(cliOut, 0o755)
