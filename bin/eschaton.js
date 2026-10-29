#!/usr/bin/env node

/**
 * ⚡ ESCHATON CODE CLI
 * OpenCode / Freebuff Terminal User Interface (TUI)
 * Integrated with Claude Code Architecture & Antigravity Ecosystem
 * Developer: Tarık Tozlu (@Tarikdxd)
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import process from 'node:process'
import { spawn, execSync } from 'node:child_process'
import https from 'node:https'

const VERSION = '1.2.0'
const FREEBUFF_VERSION = '0.2.34'

// 1. Antigravity Environment Detection
const AGY_DIR = path.join(os.homedir(), '.gemini', 'antigravity')

function getAntigravityStatus() {
  try {
    const installIdFile = path.join(AGY_DIR, 'installation_id')
    if (fs.existsSync(installIdFile)) {
      const id = fs.readFileSync(installIdFile, 'utf-8').trim()
      const brainDir = path.join(AGY_DIR, 'brain')
      const hasBrain = fs.existsSync(brainDir)
      return {
        connected: true,
        installationId: id,
        brainPath: brainDir,
        brainExists: hasBrain
      }
    }
  } catch {}
  return {
    connected: false,
    installationId: null,
    brainPath: null
  }
}

// 2. Binary resolution
function getPlatformKey() {
  const plat = process.platform
  const arch = process.arch
  if (plat === 'win32') return arch === 'arm64' ? 'win32-arm64' : 'win32-x64'
  if (plat === 'darwin') return arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64'
  if (plat === 'linux') return arch === 'arm64' ? 'linux-arm64' : 'linux-x64'
  return `${plat}-${arch}`
}

function findBinary() {
  const binaryName = process.platform === 'win32' ? 'freebuff.exe' : 'freebuff'
  const candidateDirs = [
    path.join(os.homedir(), '.config', 'manicode'),
    path.join(os.homedir(), '.eschaton', 'bin'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'manicode'),
    path.join(process.cwd(), 'bin')
  ]

  for (const dir of candidateDirs) {
    const binPath = path.join(dir, binaryName)
    if (fs.existsSync(binPath)) {
      return binPath
    }
  }
  return null
}

async function downloadBinary(targetDir) {
  fs.mkdirSync(targetDir, { recursive: true })
  const targetKey = getPlatformKey()
  const fileName = `freebuff-${targetKey}.tar.gz`
  const downloadUrl = `https://codebuff.com/api/releases/download/${FREEBUFF_VERSION}/${fileName}`
  const tarPath = path.join(targetDir, fileName)

  console.log(`\x1b[38;5;39m⚡ Downloading Eschaton / Freebuff core binary (${targetKey})...\x1b[0m`)
  
  // Follow redirects and stream download
  await new Promise((resolve, reject) => {
    function fetchWithRedirect(url) {
      https.get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchWithRedirect(res.headers.location)
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Download failed with status ${res.statusCode}`))
        }
        const fileStream = fs.createWriteStream(tarPath)
        res.pipe(fileStream)
        fileStream.on('finish', () => {
          fileStream.close(resolve)
        })
      }).on('error', reject)
    }
    fetchWithRedirect(downloadUrl)
  })

  console.log(`\x1b[38;5;48m✔ Extracting binary packages...\x1b[0m`)
  execSync(`tar -xzf "${tarPath}" -C "${targetDir}"`, { stdio: 'ignore' })
  try { fs.unlinkSync(tarPath) } catch {}

  const binName = process.platform === 'win32' ? 'freebuff.exe' : 'freebuff'
  const finalPath = path.join(targetDir, binName)
  if (process.platform !== 'win32' && fs.existsSync(finalPath)) {
    fs.chmodSync(finalPath, 0o755)
  }
  return finalPath
}

// 3. Command Handling
const args = process.argv.slice(2)
const agy = getAntigravityStatus()

if (args.includes('--antigravity') || args[0] === 'auth' || args[0] === 'login-antigravity') {
  console.log(`
\x1b[1;38;5;213m┌─────────────────────────────────────────────────────────────┐\x1b[0m
\x1b[1;38;5;213m│\x1b[0m   \x1b[1;37m⚡ ESCHATON CODE • ANTIGRAVITY AUTHENTICATION\x1b[0m            \x1b[1;38;5;213m│\x1b[0m
\x1b[1;38;5;213m├─────────────────────────────────────────────────────────────┤\x1b[0m
\x1b[1;38;5;213m│\x1b[0m   Status:          ${agy.connected ? '\x1b[1;32m● CONNECTED (Active Local Session)\x1b[0m       ' : '\x1b[1;31m○ NOT CONNECTED\x1b[0m                  '}\x1b[1;38;5;213m│\x1b[0m
\x1b[1;38;5;213m│\x1b[0m   Installation ID: \x1b[38;5;39m${(agy.installationId || 'None').padEnd(41)}\x1b[0m\x1b[1;38;5;213m│\x1b[0m
\x1b[1;38;5;213m│\x1b[0m   Brain Directory: \x1b[38;5;244m${(agy.brainPath ? agy.brainPath.substring(0, 41) : 'None').padEnd(41)}\x1b[0m\x1b[1;38;5;213m│\x1b[0m
\x1b[1;38;5;213m│\x1b[0m   Engine Backend:  \x1b[1;33mClaude Code ReAct + OpenCode TUI\x1b[0m         \x1b[1;38;5;213m│\x1b[0m
\x1b[1;38;5;213m└─────────────────────────────────────────────────────────────┘\x1b[0m
`)
  process.exit(0)
}

if (args.includes('--version') || args.includes('-v')) {
  console.log(`Eschaton Code v${VERSION} (Freebuff Core v${FREEBUFF_VERSION}, Antigravity Linked)`)
  process.exit(0)
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
\x1b[1;37mUsage:\x1b[0m eschaton [options] [command]

Eschaton Code - OpenCode / Freebuff Terminal AI Coding Assistant
Integrated with Claude Code Engine and Antigravity Ecosystem.

\x1b[1;37mCommands:\x1b[0m
  login                         Authenticate with your Freebuff / Codebuff account
  auth, --antigravity           Inspect Antigravity session status & local brain sync

\x1b[1;37mOptions:\x1b[0m
  -v, --version                 Print version information
  --continue [conversation-id]  Continue from a previous conversation
  --cwd <directory>             Set the working directory (default: current directory)
  --trust-agents                Load repository's .agents files and mcp.json without prompt
  -h, --help                    Show this help message
`)
  process.exit(0)
}

// 4. Main TUI Launch
async function main() {
  let bin = findBinary()
  if (!bin) {
    const installDir = path.join(os.homedir(), '.config', 'manicode')
    bin = await downloadBinary(installDir)
  }

  const env = {
    ...process.env,
    ESCHATON_VERSION: VERSION,
    ANTIGRAVITY_ENABLED: agy.connected ? '1' : '0',
    ...(agy.connected ? {
      ANTIGRAVITY_ID: agy.installationId,
      ANTIGRAVITY_BRAIN: agy.brainPath
    } : {})
  }

  const child = spawn(bin, args, {
    stdio: 'inherit',
    env
  })

  child.on('exit', (code) => {
    process.exit(code ?? 0)
  })

  child.on('error', (err) => {
    console.error(`\x1b[31mFailed to start Eschaton TUI: ${err.message}\x1b[0m`)
    process.exit(1)
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
