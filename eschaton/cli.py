import typer
from typing import Optional
from rich.console import Console
from rich.table import Table

from eschaton.config import AgentConfig
from eschaton.agent.loop import AutonomousComputerAgent

app = typer.Typer(
    help="Eschaton-Agent: Evrensel Bilgisayar Kontrol Ajanı (Computer-Controlling Agent / CCA)"
)
console = Console()


@app.command()
def run(
    goal: str = typer.Argument(..., help="Agent'ın bilgisayarda gerçekleştireceği hedef veya emir"),
    provider: Optional[str] = typer.Option(None, "--provider", "-p", help="openai_compatible, anthropic veya gemini"),
    model: Optional[str] = typer.Option(None, "--model", "-m", help="Model adı (gpt-4o, claude-3-7-sonnet, deepseek-chat vb.)"),
    base_url: Optional[str] = typer.Option(None, "--base-url", "-u", help="Custom OpenAI base URL (DeepSeek, Ollama vb.)"),
    api_key: Optional[str] = typer.Option(None, "--api-key", "-k", help="API Anahtarı"),
    steps: Optional[int] = typer.Option(None, "--steps", "-s", help="Maksimum adım sayısı"),
    dry_run: bool = typer.Option(False, "--dry-run", help="Eylemleri gerçekte yapmadan simüle eder")
):
    """Verilen hedefi bilgisayarı bizzat kontrol ederek otonom olarak yerine getirir."""
    config = AgentConfig.load()
    if provider:
        config.provider = provider  # type: ignore
    if model:
        config.model = model
    if base_url:
        config.base_url = base_url
    if api_key:
        config.api_key = api_key

    agent = AutonomousComputerAgent(config=config)
    try:
        agent.run(goal=goal, max_steps=steps, dry_run=dry_run)
    finally:
        agent.close()


@app.command()
def config(
    provider: Optional[str] = typer.Option(None, "--provider", "-p"),
    model: Optional[str] = typer.Option(None, "--model", "-m"),
    base_url: Optional[str] = typer.Option(None, "--base-url", "-u"),
    api_key: Optional[str] = typer.Option(None, "--api-key", "-k")
):
    """Mevcut ayarları görüntüler veya yeni ayarları kalıcı olarak kaydeder."""
    cfg = AgentConfig.load()

    changed = False
    if provider:
        cfg.provider = provider  # type: ignore
        changed = True
    if model:
        cfg.model = model
        changed = True
    if base_url is not None:
        cfg.base_url = base_url
        changed = True
    if api_key:
        cfg.api_key = api_key
        changed = True

    if changed:
        cfg.save()
        console.print("[bold green]Ayarlar başarıyla kaydedildi![/bold green]")

    table = Table(title="Eschaton Agent Yapılandırması")
    table.add_column("Ayar", style="cyan")
    table.add_column("Değer", style="magenta")

    table.add_row("Provider", cfg.provider)
    table.add_row("Model", cfg.model)
    table.add_row("Base URL", cfg.base_url or "(Varsayılan)")
    masked_key = f"{cfg.api_key[:6]}...{cfg.api_key[-4:]}" if len(cfg.api_key) > 10 else ("(Boş)" if not cfg.api_key else "***")
    table.add_row("API Key", masked_key)
    table.add_row("Action Delay", f"{cfg.action_delay}s")
    table.add_row("Fail-Safe", "Açık (Köşeye çekerek durdurma)" if cfg.failsafe else "Kapalı")

    console.print(table)


if __name__ == "__main__":
    app()
