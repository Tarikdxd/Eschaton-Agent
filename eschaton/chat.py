import readline
from rich.console import Console
from rich.panel import Panel
from rich.prompt import Prompt

from eschaton.config import AgentConfig
from eschaton.agent.loop import AutonomousComputerAgent

console = Console()

WELCOME_TEXT = """[bold cyan]Eschaton v1.0[/bold cyan] - Doğal dil ile bilgisayar kontrolü.
Komutlar:
  [yellow]/config[/yellow] : Sağlayıcı ve API ayarları
  [yellow]/help[/yellow]   : Yardım
  [yellow]exit[/yellow]    : Çıkış
"""

def start_chat_session():
    cfg = AgentConfig.load()
    
    # İlk çalıştırma kontrolü (API Key yoksa doğrudan sor)
    if not cfg.api_key:
        console.print(Panel("[bold yellow]İlk Kurulum:[/bold yellow] Henüz bir API anahtarı ayarlanmamış.", border_style="yellow"))
        provider_choice = Prompt.ask(
            "Sağlayıcı seçin",
            choices=["openai_compatible", "anthropic", "gemini"],
            default="openai_compatible"
        )
        cfg.provider = provider_choice
        
        if provider_choice == "openai_compatible":
            base_url = Prompt.ask("Base URL (Varsayılan için boş bırakın veya DeepSeek vb. girin)", default="")
            if base_url:
                cfg.base_url = base_url
            model_name = Prompt.ask("Model adı", default="gpt-4o")
            cfg.model = model_name
        elif provider_choice == "anthropic":
            cfg.model = Prompt.ask("Model adı", default="claude-3-7-sonnet-20250219")
        elif provider_choice == "gemini":
            cfg.model = Prompt.ask("Model adı", default="gemini-2.5-flash")

        key = Prompt.ask("API Anahtarınız", password=True)
        cfg.api_key = key
        cfg.save()
        console.print("[green]Ayarlar kaydedildi.[/green]\n")

    console.print(WELCOME_TEXT)
    agent = AutonomousComputerAgent(config=cfg)

    try:
        while True:
            try:
                user_msg = console.input("[bold green]Sen > [/bold green]").strip()
            except (KeyboardInterrupt, EOFError):
                console.print("\n[dim]Çıkılıyor...[/dim]")
                break

            if not user_msg:
                continue

            if user_msg.lower() in ["exit", "quit", "çıkış", "q"]:
                console.print("[dim]Görüşmek üzere.[/dim]")
                break

            if user_msg == "/config":
                console.print(f"[cyan]Provider:[/cyan] {cfg.provider}")
                console.print(f"[cyan]Model:[/cyan] {cfg.model}")
                console.print(f"[cyan]Base URL:[/cyan] {cfg.base_url or 'Default'}")
                continue

            if user_msg == "/help":
                console.print("Yapmak istediğiniz işlemi doğrudan söyleyin. Örneğin:\n- 'Not defterini aç ve toplantı notları yaz'\n- 'Hesap makinesini aç'")
                continue

            # Görevi otonom döngüye ilet
            console.print(f"\n[cyan]Eschaton çalışıyor...[/cyan] (Durdurmak için fareyi ekranın sol üst köşesine çekin)")
            agent.run(goal=user_msg)
            console.print()
    finally:
        agent.close()
