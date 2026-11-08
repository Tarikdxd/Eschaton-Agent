import sys
import threading
from PySide6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QTextEdit, QLineEdit, QPushButton, QLabel, QStackedWidget,
    QComboBox, QFrame, QMessageBox
)
from PySide6.QtCore import Qt, Signal, QObject
from PySide6.QtGui import QFont, QColor

from eschaton.config import AgentConfig
from eschaton.agent.loop import AutonomousComputerAgent


class WorkerSignals(QObject):
    log_message = Signal(str, str)  # message, type ('user', 'agent', 'system')
    task_done = Signal(str)
    task_started = Signal()


class SetupScreen(QWidget):
    """1. Adım: API Anahtarı, Sağlayıcı ve Giriş Ekranı"""
    def __init__(self, on_complete_callback):
        super().__init__()
        self.on_complete = on_complete_callback
        self.init_ui()

    def init_ui(self):
        layout = QVBoxLayout(self)
        layout.setAlignment(Qt.AlignCenter)
        layout.setSpacing(16)

        card = QFrame()
        card.setFixedWidth(460)
        card.setStyleSheet("""
            QFrame {
                background-color: #1e212b;
                border-radius: 12px;
                border: 1px solid #2d3242;
                padding: 24px;
            }
            QLabel {
                color: #e2e8f0;
                font-family: 'Segoe UI', sans-serif;
            }
            QLineEdit, QComboBox {
                background-color: #13151b;
                border: 1px solid #373e51;
                border-radius: 6px;
                color: #ffffff;
                padding: 10px;
                font-size: 13px;
            }
            QLineEdit:focus, QComboBox:focus {
                border: 1px solid #3b82f6;
            }
            QPushButton {
                background-color: #2563eb;
                color: white;
                border: none;
                border-radius: 6px;
                padding: 12px;
                font-weight: bold;
                font-size: 14px;
            }
            QPushButton:hover {
                background-color: #1d4ed8;
            }
        """)
        card_layout = QVBoxLayout(card)
        card_layout.setSpacing(12)

        title = QLabel("Eschaton Agent Giriş & Kurulum")
        title.setFont(QFont("Segoe UI", 16, QFont.Bold))
        title.setAlignment(Qt.AlignCenter)
        card_layout.addWidget(title)

        subtitle = QLabel("Hesabınızı veya Model API anahtarınızı bağlayın")
        subtitle.setStyleSheet("color: #94a3b8; font-size: 12px;")
        subtitle.setAlignment(Qt.AlignCenter)
        card_layout.addWidget(subtitle)

        card_layout.addSpacing(10)

        card_layout.addWidget(QLabel("Model Sağlayıcı:"))
        self.provider_combo = QComboBox()
        self.provider_combo.addItems([
            "OpenAI Uyumlu (DeepSeek, OpenAI, Ollama, OpenRouter)",
            "Anthropic (Claude 3.5 / 3.7)",
            "Google Gemini (Gemini 2.5 Flash / Pro)"
        ])
        card_layout.addWidget(self.provider_combo)

        card_layout.addWidget(QLabel("Model Adı:"))
        self.model_input = QLineEdit()
        self.model_input.setPlaceholderText("gpt-4o, deepseek-chat, claude-3-7-sonnet...")
        self.model_input.setText("gpt-4o")
        card_layout.addWidget(self.model_input)

        card_layout.addWidget(QLabel("Özel Base URL (İsteğe Bağlı):"))
        self.base_url_input = QLineEdit()
        self.base_url_input.setPlaceholderText("https://api.deepseek.com/v1 (Boşsa varsayılan)")
        card_layout.addWidget(self.base_url_input)

        card_layout.addWidget(QLabel("API Anahtarı (API Key):"))
        self.api_key_input = QLineEdit()
        self.api_key_input.setEchoMode(QLineEdit.Password)
        self.api_key_input.setPlaceholderText("sk-...")
        card_layout.addWidget(self.api_key_input)

        card_layout.addSpacing(10)

        self.btn_save = QPushButton("Giriş Yap ve Devam Et")
        self.btn_save.clicked.connect(self.save_and_continue)
        card_layout.addWidget(self.btn_save)

        layout.addWidget(card)

    def save_and_continue(self):
        key = self.api_key_input.text().strip()
        if not key:
            QMessageBox.warning(self, "Uyarı", "Lütfen geçerli bir API anahtarı girin.")
            return

        idx = self.provider_combo.currentIndex()
        providers = ["openai_compatible", "anthropic", "gemini"]
        selected_provider = providers[idx]

        cfg = AgentConfig.load()
        cfg.provider = selected_provider  # type: ignore
        cfg.model = self.model_input.text().strip() or "gpt-4o"
        cfg.base_url = self.base_url_input.text().strip() or None
        cfg.api_key = key
        cfg.save()

        self.on_complete(cfg)


class PermissionScreen(QWidget):
    """2. Adım: Bilgisayar Kontrol İzni İsteme Ekranı"""
    def __init__(self, on_allow_callback):
        super().__init__()
        self.on_allow = on_allow_callback
        self.init_ui()

    def init_ui(self):
        layout = QVBoxLayout(self)
        layout.setAlignment(Qt.AlignCenter)

        card = QFrame()
        card.setFixedWidth(460)
        card.setStyleSheet("""
            QFrame {
                background-color: #1e212b;
                border-radius: 12px;
                border: 1px solid #2d3242;
                padding: 30px;
            }
            QLabel {
                color: #e2e8f0;
                font-family: 'Segoe UI', sans-serif;
            }
            QPushButton {
                border-radius: 6px;
                padding: 12px;
                font-weight: bold;
                font-size: 14px;
            }
        """)
        c_layout = QVBoxLayout(card)
        c_layout.setSpacing(16)

        icon_label = QLabel("🛡️")
        icon_label.setFont(QFont("Segoe UI", 36))
        icon_label.setAlignment(Qt.AlignCenter)
        c_layout.addWidget(icon_label)

        title = QLabel("Bilgisayar Erişim İzni")
        title.setFont(QFont("Segoe UI", 16, QFont.Bold))
        title.setAlignment(Qt.AlignCenter)
        c_layout.addWidget(title)

        desc = QLabel(
            "Eschaton Agent verdiğiniz komutları yerine getirmek için bilgisayarınızın "
            "ekranını görüntüleme, klavye ve fare kontrollerini kullanma yetkisi istiyor.\n\n"
            "Kontrolü durdurmak istediğiniz an fareyi ekranın sol üst köşesine çekebilirsiniz."
        )
        desc.setWordWrap(True)
        desc.setStyleSheet("color: #94a3b8; line-height: 1.4;")
        desc.setAlignment(Qt.AlignCenter)
        c_layout.addWidget(desc)

        c_layout.addSpacing(10)

        btn_allow = QPushButton("İzin Ver ve Başlat")
        btn_allow.setStyleSheet("background-color: #16a34a; color: white; border: none;")
        btn_allow.clicked.connect(self.on_allow)
        c_layout.addWidget(btn_allow)

        layout.addWidget(card)


class ChatScreen(QWidget):
    """3. Adım: ChatGPT Tarzı Temiz Komut & Sohbet Ekranı"""
    def __init__(self, config: AgentConfig):
        super().__init__()
        self.config = config
        self.signals = WorkerSignals()
        self.signals.log_message.connect(self.append_message)
        self.signals.task_done.connect(self.on_task_finished)
        self.signals.task_started.connect(self.on_task_started)
        self.is_running = False
        self.init_ui()

    def init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(20, 20, 20, 20)
        layout.setSpacing(12)

        # Header Info
        top_bar = QHBoxLayout()
        header = QLabel("Eschaton CCA")
        header.setFont(QFont("Segoe UI", 14, QFont.Bold))
        header.setStyleSheet("color: #ffffff;")
        top_bar.addWidget(header)

        self.status_badge = QLabel("● Hazır")
        self.status_badge.setStyleSheet("color: #4ade80; font-weight: bold;")
        top_bar.addStretch()
        top_bar.addWidget(self.status_badge)
        layout.addLayout(top_bar)

        # Chat / Log History Box
        self.chat_history = QTextEdit()
        self.chat_history.setReadOnly(True)
        self.chat_history.setStyleSheet("""
            QTextEdit {
                background-color: #15171e;
                border: 1px solid #232734;
                border-radius: 8px;
                color: #e2e8f0;
                font-family: 'Segoe UI', sans-serif;
                font-size: 14px;
                padding: 12px;
            }
        """)
        layout.addWidget(self.chat_history)

        # Input Bar
        input_layout = QHBoxLayout()
        input_layout.setSpacing(10)

        self.input_field = QLineEdit()
        self.input_field.setPlaceholderText("Bilgisayarda ne yapılmasını istersiniz? (Örn: 'Not defterini aç', 'OBS'i başlat')...")
        self.input_field.setStyleSheet("""
            QLineEdit {
                background-color: #1c1f28;
                border: 1px solid #2d3345;
                border-radius: 8px;
                color: #ffffff;
                padding: 12px 16px;
                font-size: 14px;
            }
            QLineEdit:focus {
                border: 1px solid #3b82f6;
            }
        """)
        self.input_field.returnPressed.connect(self.send_task)
        input_layout.addWidget(self.input_field)

        self.btn_send = QPushButton("Gönder")
        self.btn_send.setStyleSheet("""
            QPushButton {
                background-color: #2563eb;
                color: white;
                border: none;
                border-radius: 8px;
                padding: 12px 24px;
                font-weight: bold;
                font-size: 14px;
            }
            QPushButton:hover {
                background-color: #1d4ed8;
            }
            QPushButton:disabled {
                background-color: #374151;
                color: #9ca3af;
            }
        """)
        self.btn_send.clicked.connect(self.send_task)
        input_layout.addWidget(self.btn_send)

        layout.addLayout(input_layout)

        self.append_message("Sistem hazır. Bilgisayara vermek istediğiniz emri yazın.", "system")

    def append_message(self, text: str, sender: str):
        if sender == "user":
            html = f'<div style="margin: 8px 0; text-align: right;"><span style="background-color: #2563eb; color: #ffffff; padding: 8px 14px; border-radius: 8px; display: inline-block;"><b>Sen:</b> {text}</span></div>'
        elif sender == "agent":
            html = f'<div style="margin: 8px 0; text-align: left;"><span style="background-color: #232733; color: #e2e8f0; border: 1px solid #32384a; padding: 8px 14px; border-radius: 8px; display: inline-block;"><b>Eschaton:</b> {text}</span></div>'
        else:
            html = f'<div style="margin: 6px 0; text-align: center; color: #64748b; font-size: 12px;"><i>{text}</i></div>'

        self.chat_history.append(html)

    def send_task(self):
        text = self.input_field.text().strip()
        if not text or self.is_running:
            return

        self.input_field.clear()
        self.append_message(text, "user")

        # Run task in background thread
        thread = threading.Thread(target=self._run_agent_thread, args=(text,), daemon=True)
        thread.start()

    def _run_agent_thread(self, goal: str):
        self.signals.task_started.emit()
        self.signals.log_message.emit("Ekran taranıyor ve işlemler yürütülüyor...", "system")
        agent = AutonomousComputerAgent(config=self.config)
        try:
            result = agent.run(goal=goal)
            self.signals.task_done.emit(result)
        except Exception as e:
            self.signals.task_done.emit(f"Hata: {str(e)}")
        finally:
            agent.close()

    def on_task_started(self):
        self.is_running = True
        self.btn_send.setEnabled(False)
        self.status_badge.setText("● Çalışıyor...")
        self.status_badge.setStyleSheet("color: #eab308; font-weight: bold;")

    def on_task_finished(self, result: str):
        self.is_running = False
        self.btn_send.setEnabled(True)
        self.status_badge.setText("● Hazır")
        self.status_badge.setStyleSheet("color: #4ade80; font-weight: bold;")
        self.append_message(result, "agent")


class MainWindow(QMainWindow):
    """Ana Pencere Konteyneri (Setup -> Permission -> Chat)"""
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Eschaton - Evrensel Bilgisayar Kontrol Ajanı")
        self.resize(750, 620)
        self.setStyleSheet("background-color: #0f1117;")

        self.stacked = QStackedWidget()
        self.setCentralWidget(self.stacked)

        cfg = AgentConfig.load()
        self.cfg = cfg

        self.setup_screen = SetupScreen(self.on_setup_completed)
        self.stacked.addWidget(self.setup_screen)

        self.perm_screen = PermissionScreen(self.on_perm_allowed)
        self.stacked.addWidget(self.perm_screen)

        if cfg.api_key:
            # Daha önce giriş yapılmışsa doğrudan izin ekranına veya sohbete geç
            self.stacked.setCurrentWidget(self.perm_screen)
        else:
            self.stacked.setCurrentWidget(self.setup_screen)

    def on_setup_completed(self, new_cfg: AgentConfig):
        self.cfg = new_cfg
        self.stacked.setCurrentWidget(self.perm_screen)

    def on_perm_allowed(self):
        self.chat_screen = ChatScreen(self.cfg)
        self.stacked.addWidget(self.chat_screen)
        self.stacked.setCurrentWidget(self.chat_screen)


def launch_gui():
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    launch_gui()
