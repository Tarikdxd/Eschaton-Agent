# Katkı rehberi

Eschaton Agent'a katkı verdiğin için teşekkürler. Bu proje Türkçe açık kaynak bir terminal ajanıdır; küçük, test edilmiş ve açıklanmış değişiklikler makbuldür.

## Geliştirme ortamı

```sh
git clone https://github.com/Tarikdxd/Eschaton-Agent.git
cd Eschaton-Agent
bun install
bun run dev
```

Kontroller:

```sh
bun run typecheck
bun run lint
bun run test
bun run test:opentui
bun run build
```

`bun run ci` hepsini çalıştırır. CI ubuntu ve macOS üzerinde koşar.

> **Windows notu:** Vitest'in 22 testi upstream'den gelen platform varsayımları nedeniyle Windows'ta düşer (POSIX yolları, `0o600`, `/etc/passwd`, GNU `grep`). Bu hatalar sende de varsa CI'da yeşil olduğunu kontrol et; bu testleri "düzeltmek" için davranış değiştirme.

## Nereye dokunulur?

| Dizin | İçerik |
| --- | --- |
| `src/agent` | Ajan döngüsü, sistem istemi, bağlam sıkıştırma |
| `src/tools` | Shell, HTTP, dosya, MCP, bulgu araçları |
| `src/skills` | Beceri keşfi, doğrulama, yükleme |
| `src/ui-opentui` | Terminal arayüzü |
| `src/cli` | Giriş noktası, bayraklar, sağlayıcı seçimi |
| `skills/` | Yerleşik beceriler (`SKILL.md`) |

## PR kuralları

1. Tek bir konuya odaklan; ilgisiz değişiklikleri ayır.
2. Davranış değişikliği varsa test ekle veya güncelle.
3. Kullanıcıya görünen metinler **Türkçe** olmalı; komut adları, bayraklar ve araç adları İngilizce kalır.
4. Sır, token, gerçek hedef verisi veya kişisel veri ekleme.
5. PR açıklamasında ne/neden/test bölümlerini doldur.
6. İnceleme geri bildirimini uygula; cevapsız PR terk edilmez.

## Yeni beceri ekleme

- `skills/<ad>/SKILL.md` oluştur.
- Frontmatter: `name` (klasörle aynı), `description` (Türkçe, en fazla 1024 karakter), isteğe bağlı `allowed-tools`.
- Gövde: adım adım playbook; komutlar ve doğrulama.
- `bun run test` içindeki uygunluk testlerini geçir.
- Şablon: `skills/_template/SKILL.md`.

## Commit biçimi

Kısa, emir kipinde ve Türkçe:

```text
ekle: ffuf MCP aracı
düzelt: dar terminalde durum çubuğu taşması
doküman: katkı rehberi
```

## Lisans

Katkılar Apache-2.0 kapsamındadır. Ayrıntı: [LICENSE](LICENSE), atıf: [NOTICE](NOTICE).
