# Eschaton-Agent — Evrensel Antigravity Köprüsü & Yardımcı Ajan Orkestratörü

**Eschaton-Agent**, **Qoder**, **OpenCode**, **Claude Code**, **Cursor** veya herhangi bir dış yapay zeka ajanının, bilgisayarınızda çalışan **Antigravity** masaüstü uygulamasına doğrudan bağlanarak onu **yardımcı geliştirici ajan (co-agent)** olarak kullanmasını sağlayan otonom köprü ve orkestrasyon sistemidir.

Dış ajana yalnızca bu reponun linkini verip *"Bu repoyu kullanarak bilgisayarımdaki Antigravity'ye bağlan ve kullan"* demeniz yeterlidir.

---

## Temel Özellikler

1. **Sıfır Ayarlı Ajan Keşfi (`AGENTS.md`, `SKILL.md`, `CLAUDE.md`, MCP + CLI)**
   - Qoder, OpenCode vb. ajanlar bu repoyu okuduğunda kurulum ve bağlantı adımlarını otomatik olarak anlar ve MCP sunucusu (`eschaton-mcp`) veya CLI (`eschaton`) üzerinden Antigravity'ye bağlanır.
2. **Hibrit Antigravity Köprüsü (CDP / Electron DOM + Yerel Durum + UI Fallback)**
   - Birincil olarak Antigravity'nin Electron/Chrome DevTools Protocol (CDP) köprüsü üzerinden arka planda (fareyi/klavyeyi meşgul etmeden) çalışır. CDP kapalıysa yerel durum okuyucu ve UI otomasyon yedeğini kullanır.
3. **Akıllı Proje / Workspace Seçici**
   - Dış ajanın çalıştığı dizini veya prompt bağlamını analiz ederek bilgisayarınızdaki doğru projeyi Antigravity'de otomatik seçer, odaklar veya açar.
4. **Canlı Benchmark Araştırmalı Dinamik Model Seçici**
   - Güncel kodlama liderlik tablolarını (**SWE-bench Verified**, **LMArena Coding / WebDev**, **LiveCodeBench**, **Aider Polyglot**) internetten senkronize eder ve verilen promptun görev tipine (Mimari, UI, Hızlı Bugfix, Refactoring, Test) göre Antigravity'deki en yüksek performanslı modeli otomatik seçer.
5. **%10 Korumalı Token & Usage Kalkanı (Kesin Kota Garantisi)**
   - Gönderim öncesinde `Prompt + Bağlam + Tahmini Çıktı/Thinking Token` maliyetini ve Antigravity'nin gerçek kullanım oranını hesaplar.
   - Taşma riski varsa veya kalan kullanım hakkını **%10 sınırının altına** düşürecekse promptu **kesinlikle Antigravity'ye göndermez**; dış ajana sıkıştırılmış/bölünmüş prompt önerisi döndürür.
   - Kullanım **%15–%10** bandına indiğinde otomatik ekonomi modeline geçer; **%10** sınırında gönderimi tamamen kilitler.
6. **Uzman Rol & Tam Yetenek Orkestrasyonu**
   - Antigravity'ye `co_architect`, `code_implementer`, `deep_debugger`, `ui_specialist`, `reviewer_tester` gibi uzman roller atayarak Antigravity'nin Plan/Agent modu, terminal, tarayıcı önizleme ve artifact yeteneklerinden tam faydalanır.

---

## Hızlı Kurulum

```bash
git clone https://github.com/Tarikdxd/Eschaton-Agent.git
cd Eschaton-Agent
pip install -e .
```

### Antigravity'ye Bağlanma
```bash
eschaton connect
eschaton status
eschaton usage
```

### Görev Devretme (CLI)
```bash
eschaton delegate "Auth servisindeki race condition hatasını bul ve test ekle" \
  --project /path/to/your/project \
  --role deep_debugger
```

### MCP Sunucusu Olarak Bağlama (Qoder / OpenCode / Cursor / Claude Code)
```json
{
  "mcpServers": {
    "eschaton-antigravity": {
      "command": "eschaton-mcp",
      "args": []
    }
  }
}
```

---

## Komutlar

| Komut | Açıklama |
| --- | --- |
| `eschaton connect` | Bilgisayarda çalışan Antigravity'yi bulur ve hibrit köprüyü kurar |
| `eschaton status` | Aktif bağlantı, proje, model ve kullanım kalkanı durumunu gösterir |
| `eschaton usage` | Canlı kota yüzdesini ve %10 koruma sınırını raporlar |
| `eschaton research-model "<prompt>"` | Güncel benchmarklara göre prompt için en iyi modeli seçer ve gerekçesini gösterir |
| `eschaton select-project <path_or_name>` | Doğru projeyi bulur ve Antigravity'de seçer/açar |
| `eschaton delegate "<prompt>"` | Proje seçimi + model seçimi + %10 usage kontrolü ile Antigravity'ye görev yaptırır |
| `eschaton mcp` | Standart JSON-RPC stdio MCP sunucusunu başlatır |

---

## Testleri Çalıştırma

```bash
pip install -e ".[dev]"
pytest
```

## Lisans
MIT
