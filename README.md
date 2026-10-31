<div align="center">

### Yetkili sızma testi ve hata avcılığı için insan denetimli ajan CLI — ve aynı zamanda bir kod yazma ajanı.

Eschaton Agent, güvenlik mühendislerinin keşif, numaralandırma, doğrulama,
kanıt toplama ve raporlama aşamalarını analist kontrolünde ilerletmesine
yardımcı olur. Aynı çekirdek, normal yazılım işleri için de kullanılabilir:
dosya okuyup düzenler, test çalıştırır, kod yazar.

<br/>

[![build](https://img.shields.io/github/actions/workflow/status/Tarikdxd/Eschaton-Agent/ci.yml?branch=main&label=build&logo=github)](https://github.com/Tarikdxd/Eschaton-Agent/actions)
[![release](https://img.shields.io/github/v/release/Tarikdxd/Eschaton-Agent?include_prereleases&logo=github)](https://github.com/Tarikdxd/Eschaton-Agent/releases)
[![stars](https://img.shields.io/github/stars/Tarikdxd/Eschaton-Agent?style=social)](https://github.com/Tarikdxd/Eschaton-Agent/stargazers)
[![node](https://img.shields.io/badge/node-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![license: Apache--2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

**[Kurulum](#kurulum) · [Hızlı başlangıç](#hızlı-başlangıç) · [Yaşam döngüsü](#pentest-yaşam-döngüsü) · [Bellek](#sürekli-öğrenme) · [Güvenlik](#güvenlik-modeli)**

</div>

---

```console
$ eschaton
EA v1.0.0 · ollama · …/engagement

› /target https://app.example.com
  hedef ayarlandı: https://app.example.com

› orders API'sini bozuk erişim kontrolü için test et
⏺ beceri webvuln · forked
  ⎿ forked webvuln · 4 araç
⏺ http GET https://app.example.com/api/v1/orders/1043
  ⎿ 200 OK
⏺ shell · HTTP isteği
  $ curl -s -H "Authorization: Bearer $USER_B" ...
  ⎿ hesap dışı yanıt doğrulandı
★ (yüksek) /api/v1/orders/{id} üzerinde IDOR
  ⎿ ./findings/idor-orders.md dosyasına yazıldı

Hazır · qwen3:14b · app.example.com
```

## Genel bakış

Eschaton Agent, yetkili ofansif güvenlik çalışmaları için tasarlanmış açık
kaynaklı bir terminal asistanıdır. Yerel veya barındırılan LLM'lere bağlanır,
kapsamlanmış hedefe karşı plan yapar, gerçek pentest araçlarını kullanır,
hassas işlemlerden önce onay ister, oturumlar arası dersleri hatırlar ve kanıta
dayalı bulgular yazar. Pentestin yanında, gömülü kodlama becerileriyle normal
yazılım geliştirme işlerini de yürütür.

Üç temel ilke:

- **Analist kontrolü**: hassas işlemleri insan onaylar, kapsamı insan belirler.
- **Şeffaf yürütme**: önce curl, tekrarlanabilir komutlar, görünür araç
  çağrıları, saklanan kanıtlar, denetime uygun loglar.
- **Operasyonel öğrenme**: yerel proje ve kişisel bilgi tabanları, modeli
  yeniden eğitmeden sonraki oturumları iyileştirir.

> [!WARNING]
> Eschaton Agent'ı yalnızca açık yetkiniz olan sistemlerde kullanın. Ajan onay
> aldıktan sonra kabuk komutları çalıştırabilir, HTTP istekleri atabilir, dosya
> düzenleyebilir ve yakalanan trafiği işleyebilir.

## Neden Eschaton Agent

| Sorun | Çözüm |
|---|---|
| Genel AI iş akışları | recon, web zafiyetleri, SSRF, SSTI, JWT, GraphQL, race, takeover, Supabase, deserialization için yerleşik pentest becerileri; kodlama için superpowers, ponytail ve karpathy becerileri. |
| Uydurma bulgular | `confirm_finding` yalnızca istek/yanıt kanıtıyla yeniden üretildikten sonra kullanılmalı. |
| Uzun çalışmalar | Kayıtlı oturumlar, sıkıştırma, bağlam anlık görüntüleri, resume özeti ve sürekli yerel öğrenme. |
| Gerçek araçlar | Shell/Bash, HTTP, Burp köprüsü, tarayıcı yakalama, MCP, dosya araçları, grep/glob, özel eklentiler. |
| İnsan gözetimi | İzin kademeleri (`ask` / `auto-safe` / `yolo`), tek seferlik/oturumluk izin, plan modu. |
| Tekrarlanabilirlik | Kopyala-yapıştır komutlar, Markdown bulgular, JSON-lines loglar, kararlı oturum dosyaları. |
| Büyük saldırı yüzeyi | Kapsam takibi, `/next`, beceriler, yakalanan trafik sorguları. |

## Kurulum

Npm yayını yok; kaynaktan kurulur:

```sh
git clone https://github.com/Tarikdxd/Eschaton-Agent.git
cd Eschaton-Agent
bun install
bun run build
npm link            # "eschaton" komutunu PATH'e ekler
```

Geliştirme sırasında doğrudan çalıştırmak için:

```sh
bun run dev
```

## Hızlı başlangıç

```sh
# Yerel model örneği
ollama pull qwen2.5-coder:32b
eschaton
```

CLI içinde:

```text
/provider
/target https://app.example.com
kimliği doğrulanmış API yüzeyini haritala ve IDOR test et
```

Önceki değerlendirmeyi sürdürmek:

```sh
eschaton --resume <session-id>
```

Resume sırasında Eschaton, önceki oturumun kalıcı belleğinin özetini otomatik
gösterir; bağlamı elle yeniden kurman gerekmez.

## Sağlayıcılar

Etkileşimli kurulum:

```text
/provider
/model list
/model <id>
```

CLI örnekleri:

```sh
# Ollama
eschaton --backend ollama --model qwen2.5-coder:32b

# LM Studio
eschaton --backend lmstudio --model zai-org/glm-4.7-flash

# OpenAI uyumlu uç nokta
eschaton --backend openai-compat --base-url https://api.example.com/v1 --api-key sk-...

# Kimi
MOONSHOT_API_KEY=sk-... eschaton --backend kimi --model kimi-k2.6

# Groq
GROQ_API_KEY=gsk_... eschaton --backend groq --model openai/gpt-oss-20b

# OpenRouter
OPENROUTER_API_KEY=sk-or-... eschaton --backend openrouter --model openrouter/auto

# DeepSeek
DEEPSEEK_API_KEY=sk-... eschaton --backend deepseek --model deepseek-v4-flash

# Gemini
GEMINI_API_KEY=AIza... eschaton --backend gemini --model models/gemini-3.5-flash

# Anthropic
ANTHROPIC_API_KEY=sk-ant-... eschaton --backend anthropic --model claude-opus-4-8
```

## Pentest yaşam döngüsü

1. **Kapsam**: hedef URL, kısıtlar, kimlik bilgileri, yetki notları.
2. **Keşif**: hostlar, uç noktalar, teknolojiler, dosyalar, API'ler, açık
   metadata.
3. **Numaralandırma**: parametreler, roller, kimlik durumları, yakalanan
   tarayıcı/Burp trafiği, saldırı yüzeyleri.
4. **Doğrulama**: aday sorunları deterministik isteklerle yeniden üret,
   kanıtları karşılaştır.
5. **Kapsam takibi**: test edilen uç nokta/parametre/zafiyet sınıfı üçlülerini
   izle; `/next` ile test edilmemiş işi sor.
6. **Raporlama**: doğrulanmış bulguları PoC, kanıt, etki ve düzeltme önerisiyle
   kalıcılaştır.
7. **Öğrenme**: yeniden kullanılabilir dersleri sessizce kaydet.

## Sürekli öğrenme

Eschaton, gelecek oturumları modeli yeniden eğitmeden iyileştiren yerel bir
sürekli öğrenme sistemi içerir. Kullanıcı tercihleri, önemli kararlar, işe
yarayan iş akışları, hatalar ve alınan dersler, kapsam boşlukları ve bulgu
kalıpları kaydedilir.

| Yol | Amaç |
|---|---|
| `./.eschaton/intelligence/scenarios.jsonl` | Bu çalışma alanına özel proje zekası. |
| `~/.eschaton/intelligence/scenarios.jsonl` | Projeler arası kişisel zeka. |

Öğrenme tur sonrası arka planda çalışır; geri çağırma sessizdir; sırlar
kaydedilmeden önce sansürlenir.

## Oturum belleği ve resume

Oturumlar `~/.eschaton/sessions/*.json` altında saklanır.

```sh
eschaton --resume <session-id>
```

| Komut | Amaç |
|---|---|
| `/compact` | Mevcut oturumu kalıcı belleğe özetle. |
| `/memory` | Kayıtlı olguları ve oturum kontrol noktasını göster. |
| `/memory add <metin>` | Kalıcı olgu kaydet (`#<metin>` ile aynı). |
| `/memory list` | Olguları listele. |
| `/memory forget <metin>` | Eşleşen olguları sil. |
| `/snapshot` | Sansürlü bağlam anlık görüntüsünü hemen yaz. |
| `/next [hedef]` | Kapsam odaklı sonraki adım önerisi. |

## Burp entegrasyonu

```sh
eschaton --burp
eschaton --burp 9999
```

Seçili Burp isteklerini CLI'ye gönderir ve doğrulanmış bulguları Burp'e geri
alır. Varsayılan dinleyici `http://127.0.0.1:9999`.

## Tarayıcı yakalama ve MCP

`eschaton --burp` yakalanan istekler için yerel bir alma sunucusu başlatır.
`eschaton-browser-mcp` ikilisi aynı veriyi MCP sunucusu olarak sunar.

```json
{
  "mcpServers": {
    "eschaton-browser": { "command": "eschaton-browser-mcp", "args": [] }
  }
}
```

## Kodlama becerileri (önceden kurulu)

Pentest becerilerinin yanında, normal yazılım işleri için gömülü bir beceri seti
gelir. Beceriler `skills/` altındadır, açıklamaları Türkçedir ve ajan göreve göre
otomatik yükler (`/skills` ile listelenir):

| Grup | İçerik |
|---|---|
| **superpowers** | 15 beceri: beyin fırtınası, plan yazımı, plan uygulama, TDD, sistematik hata ayıklama, kod inceleme, worktree, alt ajanlar. |
| **ponytail** | Tembel kıdemli dev modu: sorunu tam çözen en küçük değişiklik; audit/debt/gain/help/review yan becerileri. |
| **caveman** | Kısa ve öz cevap modu. |
| **graphify** | Kod tabanını bilgi grafiği olarak sorgulama. |
| **karpathy-guidelines** | LLM kodlama hatalarını azaltan davranış kuralları. |
| **mcptoon** | MCP araç keşfini sıkıştırma (kuruluysa otomatik devreye girer). |

Dosya okuma/yazma/düzenleme, `grep`/`glob`, `todo`, `delegate_task` ve `shell`
araçları kodlama akışını da destekler. Ajan, aksi belirtilmedikçe **Türkçe**
yanıt verir.

## Slash komutları

| Komut | Açıklama |
|---|---|
| `/help` | Kısayollar ve komut referansı. |
| `/provider` | Backend, API anahtarı ve modeli etkileşimli seç. |
| `/model <id>` / `/model list` | Model değiştir / listele. |
| `/mode ask\|auto-safe\|yolo\|plan\|act` | İzin kademesi veya plan/act modu. |
| `/plan [hedef]` | Araç çalıştırmadan yalnız plan. |
| `/next [hedef]` | Kapsam odaklı sonraki test önerisi. |
| `/target <url>` | Çalışma taban URL'sini ayarla/temizle. |
| `/scope …` | http/web_fetch için host izin listesi. |
| `/compact` | Kalıcı oturum belleğine özetle. |
| `/memory` | Olgular, oturum belleği, sağlayıcı durumu. |
| `/jobs` | Arka plan kabuk işlerini listele. |
| `/snapshot` | Sansürlü bağlam anlık görüntüsü. |
| `/report [markdown\|sarif]` | Doğrulanmış bulguları dışa aktar. |
| `/burp [port]` | Yerel Burp köprüsünü başlat. |
| `/skills [enable\|disable\|new <ad>]` | Becerileri yönet. |
| `/maxsteps <n>` | Sessiz otomatik devam öncesi araç bütçesi. |
| `/thinking on\|off` | Görünür akıl yürütme kılavuzu. |
| `/yolo [on\|off]` | YOLO otomatik onay (yalnız laboratuvar). |
| `/reset` | Konuşmayı ve oturum durumunu sıfırla. |
| `/clear` | Yalnızca ekran transkriptini temizle. |
| `/exit` | Çık. |

## Araçlar

| Araç | Amaç |
|---|---|
| `shell` / `bash` | Kabuk komutu (uzun işler için `background: true`). |
| `http` | Tam URL'lere veya aktif `/target`'a HTTP/HTTPS. |
| `file_read` / `file_write` / `file_edit` | Dosya oku, oluştur, düzenle. |
| `glob` / `grep` | Dosya keşfi ve içerik arama. |
| `web_fetch` / `web_search` | Sayfa çek veya web araması yap. |
| `ask_user` | Kapsam/yön belirsizken karar sor. |
| `confirm_finding` | Doğrulanmış bulguyu `./findings/<slug>.md`'ye yaz. |
| `coverage` | Uç nokta/parametre/zafiyet sınıfı takibi. |
| `todo` | Çalışma planı için canlı kontrol listesi. |
| `load_skill` | Playbook yükle (`fork=true` alt ajanda çalıştırır). |
| `delegate_task` | Kısa bir işçi/keşif alt ajanı başlat, özet döndür. |
| `background_status` | Arka plan işlerini listele/getir/öldür. |
| `browser_capture_*` | Yakalanan tarayıcı/Burp trafiğini sorgula. |

## Beceriler

Beceriler; metodoloji, payload ve araç kısıtlarını paketleyen Markdown
playbook'lardır. Yerleşik pentest becerileri:

| Beceri | Odağı |
|---|---|
| `recon` | Alt alan adları, parmak izi, içerik keşfi, saldırı yüzeyi. |
| `webvuln` | IDOR, bozuk erişim kontrolü, enjeksiyon, auth ve oturum mantığı. |
| `ssrf` | Filtre atlatma, metadata erişimi, iç ağ erişimi, kör SSRF. |
| `ssti` | Şablon motoru parmak izi ve yükseltme yolları. |
| `jwt` | Algoritma karışıklığı, `kid` kötüye kullanımı, zayıf sırlar. |
| `graphql` | Introspection, yetki boşlukları, batching, derinlik kötüye kullanımı. |
| `race` | TOCTOU, limit atlatma, race doğrulama. |
| `takeover` | Sarkan DNS ve sahipsiz bulut kaynakları. |
| `supabase` | Row Level Security ve anonim erişim hataları. |
| `deserialize` | Güvensiz deserialization noktaları ve gadget zincirleri. |

Keşif sırası: yerleşik `skills/` → `./.eschaton/skills/` → `~/.eschaton/skills/`
→ `--skills` ile verilen dizinler. Aynı isimde sonraki kazanır.

## Raporlama

`confirm_finding` doğrulanmış bulguları `./findings/<slug>.md`'ye yazar: başlık ve
önem derecesi, etkilenen URL/metot/parametre/payload, sorunu kanıtlayan yanıt
parçası, etki ve düzeltme, kopyala-yapıştır curl komutu, varsa ham istek
materyali.

## Güvenlik modeli

- **Yalnızca yetkili kullanım**: izinli güvenlik çalışmaları için üretildi.
- **Varsayılan insan denetimi**: izinli araçlar; tek seferlik, oturumluk izin
  veya red. `/mode auto-safe` salt-okunur otomatik onay, `/yolo` yalnız
  laboratuvarda.
- **Hassas yol koruması** ve **kabuk korumaları**: yıkıcı komut kalıpları
  çalıştırılmadan engellenir.
- **Kimlik bilgisi sansürü**: sıkıştırma, anlık görüntü ve öğrenme yolları
  yaygın sır biçimlerini temizler.
- **Şeffaf kanıt**: bulgular tekrarlanabilir istek ve gözlenen yanıtlarla
  desteklenmeli.
- **Denetlenebilirlik**: oturumlar, loglar, bulgular ve kapsam, belirli yerel
  yollara yazılır.

## Yapılandırma ve veri

| Yol | İçerik |
|---|---|
| `~/.eschaton/config.json` | Backend, model, uç nokta ve devre dışı beceri ayarları. |
| `~/.eschaton/sessions/*.json` | `--resume` için kayıtlı oturumlar. |
| `~/.eschaton/context/*.md` | Sansürlü bağlam anlık görüntüleri. |
| `./.eschaton/intelligence/scenarios.jsonl` | Bu çalışma alanından öğrenilen zeka. |
| `~/.eschaton/intelligence/scenarios.jsonl` | Projeler arası kişisel zeka. |
| `~/.eschaton/skills/<ad>/SKILL.md` | Kişisel beceriler. |
| `./.eschaton/skills/<ad>/SKILL.md` | Proje yerel becerileri. |
| `./findings/<slug>.md` | Mevcut çalışma için doğrulanmış bulgular. |
| `~/.eschaton/logs/eschaton.log` | Yapılandırılmış JSON-lines loglar. |

## Geliştirme

```sh
bun install
bun run dev -- --version
bun run typecheck
bun run lint
bun run test
bun run build
```

`bun run ci`; typecheck, lint, testler ve build'i birlikte çalıştırır.

## Katkı

Katkı rehberi: [CONTRIBUTING.md](CONTRIBUTING.md). Güvenlik açıkları için
[SECURITY.md](SECURITY.md) sürecini izleyin. Değişiklikleri odaklı tutun,
davranış değişikliklerine test ekleyin ve PR açmadan önce `bun run ci` çalıştırın.

## Lisans

[Apache-2.0](LICENSE). PentesterFlow ajanından türetilmiştir; atıf için
[NOTICE](NOTICE) dosyasına bakın. Sorumlu ve yalnızca yetkiyle kullanın.
