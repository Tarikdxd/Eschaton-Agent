# Proje

Eschaton Agent; yetkili sızma testi, hata ödülü ve normal yazılım geliştirme
için insan denetimli bir terminal ajanıdır. PentesterFlow ajanından türetilmiştir
(Apache-2.0; NOTICE dosyasına bakın).

## Dizinler

```
src/            TypeScript kaynakları (agent, cli, config, skills, tools, ui)
skills/         Yerleşik beceriler (pentest + kodlama)
scripts/        Sürüm ve yayın yardımcıları (npm yayını kaldırıldı)
```

## Kontroller

```sh
bun install
bun run ci
```
