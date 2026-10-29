#!/usr/bin/env node

/**
 * ⚡ ESCHATON CODE (v1.3.0)
 * Sovereign OpenCode Terminal Coding Agent with Multi-Provider DeepSeek Pool,
 * Silent Transparent Failover, and Automated Quota Renewal Trick.
 * 
 * Developer: Tarık Tozlu (@Tarikdxd)
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import process from 'node:process'
import { OpenCodeUI, SessionRotator } from '../src/ui/opencode-ui.js'

const VERSION = '1.3.0'
const AGY_DIR = path.join(os.homedir(), '.gemini', 'antigravity')

// 1. Antigravity Environment Detection
function getAntigravityStatus() {
  try {
    const installIdFile = path.join(AGY_DIR, 'installation_id')
    if (fs.existsSync(installIdFile)) {
      const id = fs.readFileSync(installIdFile, 'utf-8').trim()
      const brainDir = path.join(AGY_DIR, 'brain')
      return {
        connected: true,
        installationId: id,
        brainPath: brainDir,
        brainExists: fs.existsSync(brainDir)
      }
    }
  } catch {}
  return {
    connected: false,
    installationId: null,
    brainPath: null,
    brainExists: false
  }
}

// 2. Command Line Arguments Dispatch
const args = process.argv.slice(2)

if (args.includes('-v') || args.includes('--version') || args[0] === 'version') {
  console.log(`Eschaton Code v${VERSION} (OpenCode Engine, DeepSeek Pool & Session Trick)`)
  process.exit(0)
}

if (args.includes('-h') || args.includes('--help') || args[0] === 'help') {
  console.log(`
\x1b[1;38;5;75m⚡ ESCHATON CODE • Sovereign OpenCode Terminal Agent (v${VERSION})\x1b[0m

Usage: eschaton [options] [command]

Commands:
  \x1b[38;5;75mrefresh, --refresh\x1b[0m            Trigger session trick: rotate device fingerprints & renew unlimited quota
  \x1b[38;5;75mauth, --antigravity\x1b[0m           Inspect Antigravity session status & local brain sync
  \x1b[38;5;75mmodel\x1b[0m                         Switch active DeepSeek model in pool

Options:
  \x1b[38;5;244m-v, --version\x1b[0m                 Print version information
  \x1b[38;5;244m--cwd <directory>\x1b[0m             Set the working directory (default: current directory)
  \x1b[38;5;244m-h, --help\x1b[0m                    Show this help message

Interactive OpenCode TUI:
  Run \x1b[1;37meschaton\x1b[0m with no arguments to launch the pixel-perfect OpenCode terminal interface.
  Use \x1b[1;37mTab\x1b[0m to switch agent modes (Build, Plan, Review, Fast).
  Type \x1b[1;37m/refresh\x1b[0m anytime inside the prompt to reset your quotas.
`)
  process.exit(0)
}

if (args.includes('refresh') || args.includes('--refresh')) {
  console.log('\n\x1b[38;5;75m[↻] Running Session Trick: Rotating device fingerprints & renewing quotas...\x1b[0m')
  const rotator = SessionRotator.getInstance()
  rotator.executeRefreshTrick().then(res => {
    console.log(`\x1b[32m[✓] ${res.message}\x1b[0m\n`)
    process.exit(0)
  }).catch(err => {
    console.error('\x1b[31m[!] Failed to rotate session:\x1b[0m', err.message)
    process.exit(1)
  })
} else if (args.includes('auth') || args.includes('--antigravity')) {
  const agy = getAntigravityStatus()
  const rotator = SessionRotator.getInstance()
  const boxWidth = 63
  const hr = '─'.repeat(boxWidth - 2)

  console.log(`
\x1b[38;5;238m┌${hr}┐\x1b[0m
\x1b[38;5;238m│\x1b[0m   \x1b[1;38;5;75m⚡ ESCHATON CODE • OPENCODE DEEPSEEK AGENT\x1b[0m            \x1b[38;5;238m│\x1b[0m
\x1b[38;5;238m├${hr}┤\x1b[0m
\x1b[38;5;238m│\x1b[0m   \x1b[1;37mAntigravity:\x1b[0m     ${agy.connected ? '\x1b[32m● CONNECTED (Active Local Session)\x1b[0m      ' : '\x1b[33m○ UNLINKED (Guest Session)\x1b[0m              '} \x1b[38;5;238m│\x1b[0m
\x1b[38;5;238m│\x1b[0m   \x1b[1;37mInstallation ID:\x1b[0m \x1b[38;5;246m${agy.installationId || rotator.currentIdentity.deviceId}\x1b[0m     \x1b[38;5;238m│\x1b[0m
\x1b[38;5;238m│\x1b[0m   \x1b[1;37mDevice Finger:\x1b[0m   \x1b[38;5;246m${rotator.currentIdentity.deviceId.substring(0, 36)}\x1b[0m     \x1b[38;5;238m│\x1b[0m
\x1b[38;5;238m│\x1b[0m   \x1b[1;37mQuota Trick:\x1b[0m     \x1b[32m● ACTIVE (#${rotator.currentIdentity.quotaResetCount} Resets / Unlimited DeepSeek)\x1b[0m \x1b[38;5;238m│\x1b[0m
\x1b[38;5;238m│\x1b[0m   \x1b[1;37mEngine UI:\x1b[0m       \x1b[38;5;75mOpenCode Pixel-Perfect TUI + ReAct Agent\x1b[0m     \x1b[38;5;238m│\x1b[0m
\x1b[38;5;238m└${hr}┘\x1b[0m
`)
  process.exit(0)
} else {
  // Launch Interactive OpenCode TUI
  const ui = new OpenCodeUI()
  ui.start()
}
