import { build } from 'esbuild'
import fs from 'node:fs'

const outfile = 'dist/eschaton.js'

await build({
  entryPoints: ['src/cli.ts'],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  banner: { js: '#!/usr/bin/env node' },
  logLevel: 'info',
  sourcemap: false,
})

fs.chmodSync(outfile, 0o755)
