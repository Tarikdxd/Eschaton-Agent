# Güvenlik politikası

## Desteklenen sürümler

| Sürüm | Destek |
| --- | --- |
| 1.x | ✅ |
| 0.x | ❌ |

## Açık bildirimi

**Güvenlik açıklarını herkese açık issue olarak açmayın.**

Tercih edilen yol: GitHub'da **Security → Report a vulnerability** (özel güvenlik danışmanlığı).

Alternatif: `kanserbusiness@gmail.com` adresine şifreli/özel e-posta.

Bildirimde şunları ekle:

- Etkilenen sürüm ve platform
- Yeniden üretme adımları (gizli veri olmadan)
- Etki ve olası düzeltme
- İstersen adın/atıf tercihi

## Kapsam

- `src/` altındaki ajan, araçlar, MCP köprüsü ve arayüz kodu
- `skills/` içindeki playbook komutları
- Kurulum ve yapılandırma yolları

Kapsam dışı: üçüncü taraf LLM sağlayıcıları, işletim sistemi araçları (`nmap`, `ffuf`, `sqlmap`), kullanıcının kendi hedefleri.

## Süreç

- 72 saat içinde ilk yanıt hedeflenir.
- Düzeltme yayınlanana kadar ayrıntı paylaşılmaz.
- Hak edilen durumlarda danışmanlık kaydında atıf verilir.

## Sorumlu kullanım

Eschaton Agent yalnızca **yazılı izin verilen** sistemlerde kullanılmalıdır. Yetkisiz erişim suçtur.
