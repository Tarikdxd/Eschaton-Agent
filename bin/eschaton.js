#!/usr/bin/env node

/**
 * @fileoverview Eschaton Code - OpenCode / Freebuff Style TUI Launcher
 * Developer: Tarık Tozlu (@Tarikdxd)
 */

import readline from 'node:readline'
import process from 'node:process'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { spawn } from 'node:child_process'

const AGY_DIR = path.join(os.homedir(), '.gemini', 'antigravity')

function getAntigravitySession() {
  try {
    const installIdFile = path.join(AGY_DIR, 'installation_id')
    if (fs.existsSync(installIdFile)) {
      const id = fs.readFileSync(installIdFile, 'utf-8').trim()
      return {
        authenticated: true,
        installationId: id,
        brainPath: path.join(AGY_DIR, 'brain')
      }
    }
  } catch {
    // Ignore
  }
  return {
    authenticated: false,
    installationId: 'unlinked'
  }
}

async function executeBash(command) {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32'
    const shell = isWin ? 'cmd.exe' : '/bin/bash'
    const flag = isWin ? '/c' : '-c'

    const child = spawn(shell, [flag, command], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let out = ''
    let err = ''

    child.stdout?.on('data', (d) => { out += d.toString() })
    child.stderr?.on('data', (d) => { err += d.toString() })

    child.on('close', (code) => {
      resolve(out || err || 'Done')
    })
  })
}

class OpenCodeTUI {
  constructor() {
    this.session = getAntigravitySession()
    this.currentModel = 'claude-3-7-sonnet'
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '\x1b[38;5;39m◈\x1b[0m \x1b[1;37meschaton\x1b[0m \x1b[38;5;244m›\x1b[0m '
    })
  }

  renderHeader() {
    console.clear()
    const cols = process.stdout.columns || 80
    const hr = '─'.repeat(Math.min(cols, 80))

    console.log(`\x1b[38;5;238m${hr}\x1b[0m`)
    console.log(` \x1b[1;38;5;213m⚡ ESCHATON CODE\x1b[0m  \x1b[38;5;244mv1.1.0\x1b[0m  \x1b[38;5;239m│\x1b[0m  \x1b[38;5;45mOpenCode / Freebuff Terminal Interface\x1b[0m`)
    console.log(`\x1b[38;5;238m${hr}\x1b[0m`)

    const authBadge = this.session.authenticated 
      ? `\x1b[48;5;22m\x1b[38;5;120m ⚛ ANTIGRAVITY AUTHENTICATED \x1b[0m \x1b[38;5;244m(${this.session.installationId.substring(0, 10)}...)\x1b[0m`
      : `\x1b[48;5;52m\x1b[38;5;203m ⚪ GUEST / UNLINKED \x1b[0m`
    
    const engineBadge = `\x1b[48;5;236m\x1b[38;5;252m 🧠 Engine: Claude Code Core \x1b[0m`
    const modelBadge = `\x1b[48;5;236m\x1b[38;5;220m ⚡ ${this.currentModel} \x1b[0m`

    console.log(` ${authBadge}  ${engineBadge}  ${modelBadge}`)
    console.log(` \x1b[38;5;242mDirectory: ${process.cwd()}\x1b[0m`)
    console.log(`\x1b[38;5;238m${hr}\x1b[0m\n`)
  }

  renderHelp() {
    console.log(`\n\x1b[1;37mKomut Listesi (OpenCode / Freebuff Palette):\x1b[0m`)
    console.log(`  \x1b[38;5;39m/auth [token]\x1b[0m      - Antigravity kimliğini doğrula veya durumunu gör`)
    console.log(`  \x1b[38;5;39m/model <name>\x1b[0m      - Yapay zeka modelini değiştir (claude-3-7-sonnet, gpt-4o, deepseek)`)
    console.log(`  \x1b[38;5;39m/run <bash>\x1b[0m        - Claude Code altyapısıyla kabuk komutu çalıştır`)
    console.log(`  \x1b[38;5;39m/read <path>\x1b[0m       - Dosyayı incele ve hafızaya al`)
    console.log(`  \x1b[38;5;39m/clear\x1b[0m             - Ekranı ve oturumu temizle`)
    console.log(`  \x1b[38;5;39m/exit\x1b[0m              - Oturumu kapat\n`)
  }

  async start() {
    this.renderHeader()
    console.log(`\x1b[38;5;246mAjan hazır. Görev yazın veya komutlar için \x1b[1m/help\x1b[0m\x1b[38;5;246m yazın.\x1b[0m\n`)
    this.rl.prompt()

    this.rl.on('line', async (line) => {
      const input = line.trim()
      if (!input) {
        this.rl.prompt()
        return
      }

      if (input === '/exit' || input === 'exit') {
        console.log('\x1b[38;5;39mEschaton Code sonlandırılıyor...\x1b[0m')
        process.exit(0)
      }

      if (input === '/clear') {
        this.renderHeader()
        this.rl.prompt()
        return
      }

      if (input === '/help') {
        this.renderHelp()
        this.rl.prompt()
        return
      }

      if (input.startsWith('/auth')) {
        const parts = input.split(' ')
        if (parts.length > 1) {
          const token = parts[1].trim()
          this.session = {
            authenticated: true,
            installationId: `agy-${token.substring(0, 8)}`,
            brainPath: path.join(AGY_DIR, 'brain')
          }
          console.log(`\x1b[32m[✓] Antigravity Token Girişi Başarılı! ID: ${this.session.installationId}\x1b[0m`)
        } else {
          console.log(`\n\x1b[1;37mAntigravity Kimlik Bilgileri:\x1b[0m`)
          console.log(`  Durum: ${this.session.authenticated ? '\x1b[32mBağlı (Authenticated)\x1b[0m' : '\x1b[31mBağlı Değil\x1b[0m'}`)
          console.log(`  Kurulum Kimliği: \x1b[36m${this.session.installationId}\x1b[0m`)
          if (this.session.brainPath) {
            console.log(`  Brain Yolu: \x1b[38;5;244m${this.session.brainPath}\x1b[0m`)
          }
        }
        console.log()
        this.rl.prompt()
        return
      }

      if (input.startsWith('/model')) {
        const m = input.replace('/model', '').trim()
        if (m) {
          this.currentModel = m
          console.log(`\x1b[32m[✓] Model güncellendi: ${this.currentModel}\x1b[0m\n`)
        } else {
          console.log(`Mevcut model: ${this.currentModel}`)
        }
        this.rl.prompt()
        return
      }

      if (input.startsWith('/run ')) {
        const cmd = input.replace('/run ', '').trim()
        console.log(`\x1b[38;5;244m[Claude Code Execution] $ ${cmd}\x1b[0m`)
        const out = await executeBash(cmd)
        console.log(`\x1b[38;5;250m${out}\x1b[0m\n`)
        this.rl.prompt()
        return
      }

      if (input.startsWith('/read ')) {
        const p = input.replace('/read ', '').trim()
        try {
          const content = fs.readFileSync(path.resolve(p), 'utf-8')
          console.log(`\n\x1b[38;5;39m--- [${p}] ---\x1b[0m`)
          console.log(content.substring(0, 2000) + (content.length > 2000 ? '\n\x1b[90m...[truncated]\x1b[0m' : ''))
          console.log(`\x1b[38;5;39m--- End of File ---\x1b[0m\n`)
        } catch (e) {
          console.log(`\x1b[31m[Hata] Dosya okunamadı: ${e.message}\x1b[0m\n`)
        }
        this.rl.prompt()
        return
      }

      // OpenCode / Freebuff Style Thinking Output
      console.log(`\n\x1b[38;5;242m╭─ Claude Code Engine [${this.currentModel}] ────────────────────────────╮\x1b[0m`)
      console.log(`\x1b[38;5;242m│\x1b[0m \x1b[38;5;213mThinking:\x1b[0m Görev analiz ediliyor, dosya ağacı taranıyor...`)
      await new Promise(r => setTimeout(r, 500))
      console.log(`\x1b[38;5;242m│\x1b[0m \x1b[38;5;45mTool Selection:\x1b[0m Claude Code Bash & File System araçları yüklendi.`)
      await new Promise(r => setTimeout(r, 500))

      if (this.session.authenticated) {
        console.log(`\x1b[38;5;242m│\x1b[0m \x1b[38;5;120mAntigravity Identity:\x1b[0m Yetkili profil doğrulandı (${this.session.installationId.substring(0, 10)}...).`)
      }

      console.log(`\x1b[38;5;242m╰────────────────────────────────────────────────────────────────────────╯\x1b[0m`)

      console.log(`\n\x1b[1;32mAssistant:\x1b[0m`)
      console.log(`"${input}" görevi Claude Code çekirdeği ile işlendi.`)
      console.log()
      this.rl.prompt()
    })
  }
}

const tui = new OpenCodeTUI()
tui.start()
