# Eschaton Agent

Doğal dil komutlarıyla işletim sisteminizi yöneten otonom bilgisayar kontrol ajanı (CCA). Ekranı analiz eder, fare ve klavye girdilerini insan gibi kullanarak talimatları yerine getirir.

## Kurulum

```bash
git clone https://github.com/Tarikdxd/Eschaton-Agent.git
cd Eschaton-Agent
pip install -e .
```

Kurulum bittikten sonra terminale doğrudan şu komutu yazmanız yeterlidir:

```bash
eschaton
```

İlk çalıştırmada sağlayıcı (OpenAI/DeepSeek, Claude, Gemini) ve API anahtarınızı interaktif olarak sorar ve kaydeder.

## Kullanım

Her komut için ayrı parametre girmeniz gerekmez. `eschaton` yazarak sürekli sohbet oturumunu başlatabilirsiniz:

```text
Eschaton v1.0 - Doğal dil ile bilgisayar kontrolü.
Komutlar:
  /config : Sağlayıcı ve API ayarları
  /help   : Yardım
  exit    : Çıkış

Sen > OBS'i aç ve kayıt başlat
Eschaton çalışıyor...
```

## Desteklenen Sağlayıcılar

- **OpenAI Compatible:** DeepSeek, Ollama, OpenRouter, Groq ve yerel modeller (özel base URL desteği).
- **Anthropic:** Claude 3.5 / 3.7 Sonnet Computer Use.
- **Google:** Gemini 2.0 / 2.5 Flash ve Pro.

## Güvenlik (Fail-Safe)

Ajan çalışırken kontrolü anında devralmak için fareyi **ekranın sol üst köşesine** çekmeniz yeterlidir. PyAutoGUI acil durdurma mekanizması işlemi hemen sonlandırır.

## Lisans

MIT
