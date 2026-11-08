import time
from typing import List, Optional
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from eschaton.config import AgentConfig
from eschaton.core.screen import ScreenCapturer
from eschaton.core.controller import ComputerController
from eschaton.core.actions import FinishAction
from eschaton.agent.safety import SafetyGate
from eschaton.providers import get_provider
from eschaton.providers.base import BaseLLMProvider

console = Console()


class AutonomousComputerAgent:
    """
    Main Autonomous Computer-Controlling Agent (CCA).
    Executes the Plan -> Observe (Vision) -> Decide -> Safety -> Act -> Feedback Loop.
    """

    def __init__(self, config: Optional[AgentConfig] = None, provider: Optional[BaseLLMProvider] = None):
        self.config = config or AgentConfig.load()
        self.provider = provider or get_provider(self.config)
        self.capturer = ScreenCapturer()
        self.controller = ComputerController(
            action_delay=self.config.action_delay,
            failsafe=self.config.failsafe
        )
        self.history: List[dict] = []

    def run(self, goal: str, max_steps: Optional[int] = None, dry_run: bool = False) -> str:
        """Runs the autonomous loop to achieve the given goal."""
        limit = max_steps or self.config.max_steps
        console.print(Panel(
            f"[bold green]Hedef:[/bold green] {goal}\n"
            f"[bold cyan]Sağlayıcı:[/bold cyan] {self.config.provider} ({self.config.model})\n"
            f"[bold yellow]Maksimum Adım:[/bold yellow] {limit}\n"
            f"[bold magenta]Mod:[/bold magenta] {'DRY-RUN (Simülasyon)' if dry_run else 'CANLI KONTROL'}",
            title="⚡ Eschaton Agent Başlatıldı",
            expand=False
        ))

        step_count = 0
        while step_count < limit:
            step_count += 1
            console.rule(f"[bold blue]Adım {step_count} / {limit}[/bold blue]")

            # 1. Observe (Screen Vision)
            with console.status("[bold cyan]Ekran yakalanıyor ve analiz ediliyor...[/bold cyan]"):
                screen_b64, orig_res = self.capturer.capture_base64(scale=self.config.screenshot_scale)

            # 2. Decide (LLM Reasoner)
            with console.status("[bold yellow]Model karar veriyor (Reasoning)...[/bold yellow]"):
                try:
                    decision = self.provider.plan_next_step(
                        goal=goal,
                        screen_base64=screen_b64,
                        screen_resolution=orig_res,
                        history=self.history
                    )
                except Exception as e:
                    console.print(f"[bold red]Model İstek Hatası:[/bold red] {e}")
                    return f"Hata nedeniyle durduruldu: {e}"

            # Log Thought & Action
            console.print(f"[italic grey70]Düşünce:[/italic grey70] {decision.thought}")
            action_data = decision.action.model_dump()
            console.print(f"[bold green]Seçilen Eylem:[/bold green] {action_data}")

            # 3. Safety Gate
            is_safe, reason = SafetyGate.inspect(decision.action)
            if not is_safe:
                console.print(f"[bold red]{reason}[/bold red]")
                return f"Güvenlik nedeniyle durduruldu: {reason}"

            # 4. Check for Termination
            if isinstance(decision.action, FinishAction):
                console.print(Panel(
                    f"[bold green]Tebrikler! Görev Tamamlandı:[/bold green]\n{decision.action.message}",
                    title="🎉 Başarılı"
                ))
                return decision.action.message

            # 5. Act (Execute on Desktop)
            if not dry_run:
                try:
                    result_msg = self.controller.execute(decision.action)
                    console.print(f"[dim green]Sonuç:[/dim green] {result_msg}")
                except RuntimeError as err:
                    console.print(f"[bold red]{err}[/bold red]")
                    return str(err)
            else:
                result_msg = f"[DRY-RUN Simüle Edildi] {action_data}"
                console.print(f"[dim yellow]{result_msg}[/dim yellow]")

            # 6. Record to History
            self.history.append({
                "step": step_count,
                "thought": decision.thought,
                "action": action_data,
                "result": result_msg
            })

        return f"Belirlenen maksimum adım sayısına ({limit}) ulaşıldı."

    def close(self):
        self.capturer.close()
