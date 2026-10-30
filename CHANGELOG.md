# Değişiklik günlüğü

## 1.0.0 — Eschaton Agent

PentesterFlow ajanının (v0.3.0, Apache-2.0) yeniden markalanmış ve
Türkçeleştirilmiş türevi.

- Ürün adı: **Eschaton Agent**; komutlar `eschaton` ve `eschaton-browser-mcp`.
- Yapımcı: Tarık Tozlu (@Tarikdxd).
- Tüm kullanıcıya dönük metinler Türkçeleştirildi (README, beceri açıklamaları,
  komut listeleri). Ajan varsayılan olarak Türkçe yanıt verir.
- Pentest becerilerinin yanına kodlama becerileri eklendi: superpowers (15),
  ponytail (6), caveman, graphify, karpathy-guidelines, mcptoon.
- `~/.pentesterflow/*` yolları `~/.eschaton/*` oldu.
- npm yayını kaldırıldı; kurulum kaynaktan (`bun install && bun run build &&
  npm link`).
- Upstream geçmişi için: https://github.com/PentesterFlow/agent/blob/main/CHANGELOG.md
