# Eschaton Agent (CCA)

Windows işletim sisteminizi ekrandan izleyip fare ve klavyeyle otonom olarak yöneten bağımsız Bilgisayar Kontrol Ajanı (Computer-Controlling Agent).

## Çalıştırma

### 1. Doğrudan EXE Olarak (Kurulumsuz)
`dist/EschatonAgent/EschatonAgent.exe` dosyasını çift tıklayarak anında çalıştırabilirsiniz.

1. **Giriş / Kurulum Ekranı:** Model sağlayıcınızı (OpenAI Uyumlu, DeepSeek, Claude, Gemini) seçip API anahtarınızı girin.
2. **İzin Ekranı:** Bilgisayar kontrolü için "İzin Ver" butonuna tıklayın.
3. **Komut & Sohbet Ekranı:** ChatGPT tarzı ekranda emrinizi yazın; Eschaton ekranı görerek bilgisayarı yönetmeye başlasın.

### 2. Python ile Kaynaktan Çalıştırma
```bash
git clone https://github.com/Tarikdxd/Eschaton-Agent.git
cd Eschaton-Agent
pip install -e .
python run_gui.py
```

## Güvenlik (Acil Durdurma)
Ajan çalışırken kontrolü anında elinize almak için fareyi **ekranın sol üst köşesine** çekmeniz yeterlidir.

## Lisans
MIT
