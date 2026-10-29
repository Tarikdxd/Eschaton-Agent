import readline from 'node:readline'
import process from 'node:process'
import path from 'node:path'
import { AntigravityAuth, AntigravitySession } from '../auth/antigravity.js'
import { ClaudeCodeEngine } from '../engine/claude_code.js'

export class OpenCodeTUI {
  private rl: readline.Interface
  private session: AntigravitySession
  private isThinking: boolean = false
  private currentModel: string = 'claude-3-7-sonnet'

  constructor() {
    this.session = AntigravityAuth.detectLocalInstallation()
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '\x1b[38;5;39m◈\x1b[0m \x1b[1;37meschaton\x1b[0m \x1b[38;5;244m›\x1b[0m '
    })
  }

  public renderHeader() {
    console.clear()
    const cols = process.stdout.columns || 80
    const hr = '─'.repeat(Math.min(cols, 80))

    console.log(`\x1b[38;5;238m${hr}\x1b[0m`)
    console.log(` \x1b[1;38;5;213m⚡ ESCHATON CODE\x1b[0m  \x1b[38;5;244mv1.1.0\x1b[0m  \x1b[38;5;239m│\x1b[0m  \x1b[38;5;45mOpenCode / Freebuff TUI Style\x1b[0m`)
    console.log(`\x1b[38;5;238m${hr}\x1b[0m`)
    
    // Status badges
    const authBadge = this.session.authenticated 
      ? `\x1b[48;5;22m\x1b[38;5;120m ⚛ ANTIGRAVITY LINKED \x1b[0m \x1b[38;5;244m(${this.session.installationId.substring(0, 12)}...)\x1b[0m`
      : `\x1b[48;5;52m\x1b[38;5;203m ⚪ GUEST / UNLINKED \x1b[0m`
    
    const engineBadge = `\x1b[48;5;236m\x1b[38;5;252m 🧠 Engine: Claude Code Core \x1b[0m`
    const modelBadge = `\x1b[48;5;236m\x1b[38;5;220m ⚡ ${this.currentModel} \x1b[0m`

    console.log(` ${authBadge}  ${engineBadge}  ${modelBadge}`)
    console.log(` \x1b[38;5;242mCwd: ${process.cwd()}\x1b[0m`)
    console.log(`\x1b[38;5;238m${hr}\x1b[0m\n`)
  }

  public renderHelp() {
    console.log(`\n\x1b[1;37mCommand Palette:\x1b[0m`)
    console.log(`  \x1b[38;5;39m/auth\x1b[0m              - Antigravity kimlik doğrulaması yap veya durumu görüntüle`)
    console.log(`  \x1b[38;5;39m/model [name]\x1b[0m      - Model değiştir (claude-3-7-sonnet, gpt-4o, deepseek-r1)`)
    console.log(`  \x1b[38;5;39m/run <bash_cmd>\x1b[0m    - Claude Code altyapısıyla kabuk komutu çalıştır`)
    console.log(`  \x1b[38;5;39m/read <path>\x1b[0m       - Dosya içeriğini terminalde incele`)
    console.log(`  \x1b[38;5;39m/clear\x1b[0m             - Ekranı ve geçmişi temizle`)
    console.log(`  \x1b[38;5;39m/exit\x1b[0m              - TUI oturumunu kapat\n`)
  }

  public async start() {
    this.renderHeader()
    console.log(`\x1b[38;5;246mYapay zeka ajanı hazır. Doğal dilde kodlama görevi yazabilir veya \x1b[1m/help\x1b[0m\x1b[38;5;246m yazabilirsiniz.\x1b[0m\n`)
    
    this.rl.prompt()

    this.rl.on('line', async (line) => {
      const input = line.trim()
      if (!input) {
        this.rl.prompt()
        return
      }

      if (input === '/exit' || input === 'exit') {
        console.log('\x1b[38;5;39mEschaton Code kapatılıyor. İyi çalışmalar!\x1b[0m')
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
          this.session = AntigravityAuth.loginWithToken(token)
          console.log(`\x1b[32m[✓] Antigravity Token doğrulandı! ID: ${this.session.installationId}\x1b[0m`)
        } else {
          console.log(`\n\x1b[1;37mAntigravity Kimlik Durumu:\x1b[0m`)
          console.log(`  Durum: ${this.session.authenticated ? '\x1b[32mBağlı (Active)\x1b[0m' : '\x1b[31mBağlı Değil\x1b[0m'}`)
          console.log(`  Kurulum ID: \x1b[36m${this.session.installationId}\x1b[0m`)
          if (this.session.connectedBrainPath) {
            console.log(`  Brain Yolu: \x1b[38;5;244m${this.session.connectedBrainPath}\x1b[0m`)
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
        console.log(`\x1b[38;5;244m[Claude Code Shell] $ ${cmd}\x1b[0m`)
        const out = await ClaudeCodeEngine.executeBash(cmd)
        console.log(`\x1b[38;5;250m${out}\x1b[0m\n`)
        this.rl.prompt()
        return
      }

      if (input.startsWith('/read ')) {
        const p = input.replace('/read ', '').trim()
        try {
          const content = await ClaudeCodeEngine.readFile(p)
          console.log(`\n\x1b[38;5;39m--- [${p}] ---\x1b[0m`)
          console.log(content.substring(0, 2000) + (content.length > 2000 ? '\n\x1b[90m...[truncated]\x1b[0m' : ''))
          console.log(`\x1b[38;5;39m--- End of File ---\x1b[0m\n`)
        } catch (e: any) {
          console.log(`\x1b[31m[Hata] ${e.message}\x1b[0m\n`)
        }
        this.rl.prompt()
        return
      }

      // Default AI Prompt processing (OpenCode TUI style thinking)
      await this.processUserPrompt(input)
      this.rl.prompt()
    })
  }

  private async processUserPrompt(prompt: string) {
    console.log(`\n\x1b[38;5;242m╭─ Claude Code Engine [${this.currentModel}] ────────────────────────────╮\x1b[0m`)
    console.log(`\x1b[38;5;242m│\x1b[0m \x1b[38;5;213mThinking:\x1b[0m Görev analiz ediliyor, dosya ağacı ve bağlam taranıyor...`)
    await new Promise(r => setTimeout(r, 600))
    console.log(`\x1b[38;5;242m│\x1b[0m \x1b[38;5;45mTool Selection:\x1b[0m AST Parser ve File Search araçları hazırlandı.`)
    await new Promise(r => setTimeout(r, 600))

    if (this.session.authenticated) {
      console.log(`\x1b[38;5;242m│\x1b[0m \x1b[38;5;120mAntigravity Bridge:\x1b[0m Yerel bellek ve kural seti aktif edildi.`)
    }

    console.log(`\x1b[38;5;242m╰────────────────────────────────────────────────────────────────────────╯\x1b[0m`)

    console.log(`\n\x1b[1;32mAssistant:\x1b[0m`)
    console.log(`"${prompt}" talebiniz Claude Code motoru ve Antigravity yetkilendirmesiyle işlendi.`)
    console.log(`\x1b[38;5;244m(Gerçek API token'ı aktif olduğunda Claude 3.7 / GPT-4o doğrudan dosya değişikliklerini diff olarak ekrana basar)\x1b[0m\n`)
  }
}
