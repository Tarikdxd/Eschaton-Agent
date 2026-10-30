# Beceriler

Beceri, `SKILL.md` dosyasına sahip bir klasördür: YAML frontmatter (name,
description, isteğe bağlı allowed-tools) + playbook gövdesi. Açıklama, modelin
beceriyi ne zaman yükleyeceğini belirler.

İki grup yerleşik gelir:

- **Pentest**: recon, webvuln, ssrf, ssti, jwt, graphql, race, takeover,
  supabase, deserialize.
- **Kodlama**: superpowers, ponytail, caveman, graphify,
  karpathy-guidelines, mcptoon.

Yeni beceri eklemek için `_template/SKILL.md`'yi kopyala, frontmatter'ı Türkçe
açıklamayla doldur ve `bun run test` ile uygunluk testlerini geçir.

Kaynaklar ve lisanslar için üst dizindeki `NOTICE` dosyasına bakın.
