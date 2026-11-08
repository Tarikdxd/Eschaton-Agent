# ⚡ Eschaton-Agent (CCA)

> **Evrensel Bilgisayar Kontrol Ajanı (Universal Computer-Controlling Agent)**  
> Ekranı anlık olarak izleyip fare, klavye ve sistem komutlarını insan gibi otonom olarak yöneten yeni nesil CCA mimarisi.

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Architecture](https://img.shields.io/badge/Architecture-Computer--Use%20%2F%20Vision-purple.svg)]()

---

## 🎯 Özellikler

- 👁️ **Multimodal Vision & Screen Grounding:** Anlık ekran görüntüsünü alıp hedef UI elementlerinin (butonlar, pencereler, girdi alanları) piksel koordinatlarını otomatik hesaplar.
- 🖐️ **Gerçekçi OS Kontrolü:** Fareyle tıklama (sol, sağ, çift), sürükle-bırak, scroll, klavye yazımı ve `Win`, `Alt+Tab`, `Ctrl+C` gibi sistem kısayollarını bizzat yürütür.
- 🧠 **Model Agnostik / Evrensel Entegrasyon:**
  - **OpenAI Compatible:** DeepSeek, Ollama, OpenRouter, Groq, vLLM veya özel yerel modeller (`--base-url` desteği).
  - **Anthropic Claude:** Claude 3.5 / 3.7 Computer Use vizyon motoru.
  - **Google Gemini:** Gemini 2.0 / 2.5 Flash / Pro Multimodal API.
  - **MCP (Model Context Protocol):** Harici MCP araçlarına bağlanabilen genişletilebilir yapı.
- 🛡️ **Fail-Safe & Güvenlik Kapısı:** Fare ekran köşesine çekildiğinde anında acil durdurma (failsafe) ve tehlikeli sistem komutlarını engelleyen filtreler.

---

## 🚀 Kurulum

```bash
# Depoyu klonlayın
git clone https://github.com/Tarikdxd/Eschaton-Agent.git
cd Eschaton-Agent

# Gerekli bağımlılıkları yükleyin
pip install -e .
```

---

## ⚙️ Yapılandırma

API anahtarınızı ve tercih ettiğiniz modeli ister ortam değişkenleri ile ister tek bir CLI komutu ile kaydedin:

```bash
# DeepSeek veya Custom OpenAI-compatible API
eschaton config --provider openai_compatible --model deepseek-chat --base-url https://api.deepseek.com/v1 --api-key sk-xxxx

# Anthropic Claude
eschaton config --provider anthropic --model claude-3-7-sonnet-20250219 --api-key sk-ant-xxxx

# Google Gemini
eschaton config --provider gemini --model gemini-2.5-flash --api-key AIzaxxxx
```

---

## 🎮 Kullanım Örnekleri

Ajanı çalıştırmak için doğrudan doğal dille hedefinizi verin:

```bash
# Canlı Bilgisayar Kontrolü
eschaton run "OBS Studio'yu aç, kaydı başlat, ardından tarayıcıya girip son haberleri özetle"

# Test / Simülasyon (Gerçekte tıklamadan adımları ekranda planlar)
eschaton run "Hesap makinesini aç ve 150 * 42 hesapla" --dry-run
```

---

## 🔒 Güvenlik Notu (Fail-Safe)
Ajan çalışırken kontrolü anında elinize almak için fareyi **hızlıca ekranın sol üst köşesine** çekmeniz yeterlidir. PyAutoGUI Fail-Safe mekanizması ajanı derhal durduracaktır.
