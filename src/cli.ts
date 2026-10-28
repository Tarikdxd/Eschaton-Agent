#!/usr/bin/env node

/**
 * @fileoverview Eschaton Code - Interactive Terminal Agent CLI
 * Developer: Tarık Tozlu (@Tarikdxd)
 */

import readline from 'node:readline'
import process from 'node:process'
import { OpenMultiAgent } from './orchestrator/orchestrator.js'

const BANNER = `
\x1b[36m╔══════════════════════════════════════════════════════════════════════╗
║                    ⚡ ESCHATON CODE CLI AGENT                        ║
║          Autonomous Multi-Agent Terminal Orchestration Engine        ║
║                       Developer: @Tarikdxd                           ║
╚══════════════════════════════════════════════════════════════════════╝\x1b[0m
`

async function main() {
  console.clear()
  console.log(BANNER)

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const openAiKey = process.env.OPENAI_API_KEY

  if (!anthropicKey && !openAiKey) {
    console.log('\x1b[33m[!] Bilgi: Ortamınızda ANTHROPIC_API_KEY veya OPENAI_API_KEY bulunamadı.\x1b[0m')
    console.log('\x1b[90m    (Simülasyon / Demo modunda veya anahtarlarınızı girerek tam gücüyle çalıştırabilirsiniz)\x1b[0m\n')
  } else {
    console.log('\x1b[32m[✓] API Kimlik Doğrulaması Algılandı.\x1b[0m\n')
  }

  console.log('\x1b[35mKullanılabilir Komutlar:\x1b[0m')
  console.log('  \x1b[33m/agent <görev>\x1b[0m  - Tekli ajan çalıştır (Dosya okuma/yazma/bash)')
  console.log('  \x1b[33m/team  <hedef>\x1b[0m  - Çoklu otonom ajan takımı kur (Researcher + Coder + Reviewer)')
  console.log('  \x1b[33m/tools\x1b[0m          - Entegre built-in araçları listele')
  console.log('  \x1b[33m/exit\x1b[0m           - Çıkış\n')

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\x1b[1;36meschaton>\x1b[0m '
  })

  const orchestrator = new OpenMultiAgent({
    defaultModel: anthropicKey ? 'claude-sonnet-4-6' : 'gpt-4o'
  })

  rl.prompt()

  rl.on('line', async (line) => {
    const input = line.trim()

    if (!input) {
      rl.prompt()
      return
    }

    if (input === '/exit' || input === 'exit') {
      console.log('\x1b[36mEschaton Code sonlandırılıyor...\x1b[0m')
      process.exit(0)
    }

    if (input === '/tools') {
      console.log('\n\x1b[32m[+] Yerleşik Araçlar:\x1b[0m')
      console.log('  • bash       - Terminal komutları çalıştırma')
      console.log('  • file_read  - Dosya içeriği okuma')
      console.log('  • file_write - Dosya oluşturma ve yazma')
      console.log('  • file_edit  - Satır bazlı dosya düzenleme')
      console.log('  • grep       - Regex ile kod arama\n')
      rl.prompt()
      return
    }

    if (input.startsWith('/team')) {
      const task = input.replace('/team', '').trim() || 'Analyze repository codebase and generate architecture overview.'
      console.log(`\n\x1b[34m[⚡ OTONOM AJAN TAKIMI BAŞLATILIYOR]\x1b[0m: "${task}"`)
      console.log('\x1b[90m-> Researcher Agent devrede...')
      console.log('-> Coder Agent hazırlık yapıyor...')
      console.log('-> Quality Reviewer izliyor...\x1b[0m')

      try {
        if (!anthropicKey && !openAiKey) {
          await new Promise(r => setTimeout(r, 1500))
          console.log('\n\x1b[32m[✓] Simülasyon Tamamlandı:\x1b[0m')
          console.log('    Ajanlar DAG görev sıralamasını çözdü, paylaşımlı bellek (SharedMemory) üzerinden planı tamamladı.')
        } else {
          const team = orchestrator.createTeam('cli-team', {
            name: 'dev-team',
            agents: [
              { name: 'planner', model: 'claude-sonnet-4-6', systemPrompt: 'Break down goals into DAG tasks.' },
              { name: 'executor', model: 'claude-sonnet-4-6', tools: ['bash', 'file_write', 'file_read'] },
            ],
            sharedMemory: true
          })
          const res = await orchestrator.runTeam(team, task)
          console.log('\n\x1b[32m[Takım Sonucu]:\x1b[0m', res)
        }
      } catch (err) {
        console.error('\x1b[31m[Hata]:\x1b[0m', err.message)
      }
      console.log()
      rl.prompt()
      return
    }

    // Default or /agent
    const promptTask = input.startsWith('/agent') ? input.replace('/agent', '').trim() : input
    console.log(`\n\x1b[35m[Ajan Çalıştırılıyor]:\x1b[0m ${promptTask}`)

    try {
      if (!anthropicKey && !openAiKey) {
        await new Promise(r => setTimeout(r, 1000))
        console.log(`\x1b[32m[Ajan Yanıtı]:\x1b[0m "${promptTask}" görevi için AST ve araç zinciri hazırlandı. (Gerçek LLM API istekleri için ANTHROPIC_API_KEY veya OPENAI_API_KEY tanımlayın).`)
      } else {
        const res = await orchestrator.runAgent({
          name: 'cli-agent',
          model: anthropicKey ? 'claude-sonnet-4-6' : 'gpt-4o',
          tools: ['bash', 'file_read', 'file_write']
        }, promptTask)
        console.log('\n\x1b[32m[Ajan Yanıtı]:\x1b[0m\n' + res.output)
      }
    } catch (err) {
      console.error('\x1b[31m[Hata]:\x1b[0m', err.message)
    }

    console.log()
    rl.prompt()
  })

  rl.on('close', () => {
    console.log('\nGörüşmek üzere!')
    process.exit(0)
  })
}

main().catch(err => {
  console.error('Fatal CLI Error:', err)
  process.exit(1)
})
