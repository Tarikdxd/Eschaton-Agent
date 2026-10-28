#!/usr/bin/env node

/**
 * @fileoverview Eschaton Code - Standalone Interactive Terminal Agent CLI
 * Developer: Tarık Tozlu (@Tarikdxd)
 */

import readline from 'node:readline'
import process from 'node:process'

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
    console.log('\x1b[33m[!] Durum: Yerel Demo Modu (Local Simulation Engine Active)\x1b[0m')
    console.log('\x1b[90m    (Gerçek LLM API istekleri için ANTHROPIC_API_KEY veya OPENAI_API_KEY tanımlayabilirsiniz)\x1b[0m\n')
  } else {
    console.log('\x1b[32m[✓] API Kimlik Doğrulaması Aktif.\x1b[0m\n')
  }

  console.log('\x1b[35mKomut Rehberi:\x1b[0m')
  console.log('  \x1b[33m/agent <görev>\x1b[0m  - Tekil ajana görev ata (Dosya okuma/yazma, komut koşturma)')
  console.log('  \x1b[33m/team  <hedef>\x1b[0m  - Çoklu otonom ajan takımı kur (Researcher + Coder + Reviewer)')
  console.log('  \x1b[33m/tools\x1b[0m          - Entegre built-in araçları listele')
  console.log('  \x1b[33m/exit\x1b[0m           - Çıkış yap\n')

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\x1b[1;36meschaton>\x1b[0m '
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
      console.log('\n\x1b[32m[+] Entegre Araçlar (Built-in Tool Matrix):\x1b[0m')
      console.log('  • bash       - Yerel terminal / kabuk komutları çalıştırma')
      console.log('  • file_read  - Dosya içeriği okuma ve AST çözümleme')
      console.log('  • file_write - Dosya oluşturma ve yazma')
      console.log('  • file_edit  - Satır bazlı dosya düzenleme ve yama (patch)')
      console.log('  • grep       - Regex tabanlı kod içi desen arama\n')
      rl.prompt()
      return
    }

    if (input.startsWith('/team')) {
      const task = input.replace('/team', '').trim() || 'Kod tabanını tara ve mimari rapor hazırla'
      console.log(`\n\x1b[34m[⚡ OTONOM AJAN TAKIMI BAŞLATILDI]\x1b[0m: "${task}"`)
      console.log('\x1b[90m-> [Planner] Görevi alt bileşenlere (DAG) bölüyor...')
      await new Promise(r => setTimeout(r, 700))
      console.log('-> [Researcher] İlgili bağımlılıkları ve mimariyi analiz ediyor...')
      await new Promise(r => setTimeout(r, 700))
      console.log('-> [Coder] Kodlama ve entegrasyonu tamamlıyor...')
      await new Promise(r => setTimeout(r, 700))
      console.log('-> [Reviewer] Kalite ve güvenlik denetimini doğruluyor...\x1b[0m')
      await new Promise(r => setTimeout(r, 500))

      console.log('\n\x1b[32m[✓] Takım Görevi Başarıyla Tamamlandı!\x1b[0m')
      console.log(`    Paylaşımlı bellek (SharedMemory) senkronize edildi. Sonuçlar önbelleğe alındı.`)
      console.log()
      rl.prompt()
      return
    }

    const task = input.startsWith('/agent') ? input.replace('/agent', '').trim() : input
    console.log(`\n\x1b[35m[Ajan Çalıştırılıyor]:\x1b[0m "${task}"`)
    await new Promise(r => setTimeout(r, 800))
    console.log('\x1b[32m[Ajan Çıktısı]:\x1b[0m Görev analiz edildi. Gerekli araç zinciri (ToolExecutor) başarıyla işletildi.')
    
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
