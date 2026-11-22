"""
Eschaton-Agent CLI.

Provides instant terminal commands for both humans and external AI agents
(Qoder, OpenCode, Claude Code, Cursor) to connect to and orchestrate Antigravity.
"""

from __future__ import annotations

import json
from typing import Optional

import typer
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from eschaton import __version__
from eschaton.mcp.server import EschatonMCPServer
from eschaton.orchestrator.engine import EschatonOrchestrator
from eschaton.orchestrator.roles import ROLES

app = typer.Typer(
    name="eschaton",
    help="Eschaton-Agent: Evrensel Antigravity Köprüsü & %10 Kullanım Kalkanlı Yardımcı Ajan Orkestratörü",
    no_args_is_help=True,
)
console = Console()


@app.command()
def connect(
    launch: bool = typer.Option(
        False,
        "--launch",
        help="Antigravity CDP portu açık değilse debug köprüsüyle başlatmayı dener.",
    ),
    project: Optional[str] = typer.Option(
        None, "--project", "-p", help="Açılacak/odaklanacak proje dizini."
    ),
    as_json: bool = typer.Option(False, "--json", help="Makine tarafından okunabilir JSON çıktı verir."),
) -> None:
    """Bilgisayardaki Antigravity masaüstü uygulamasına hibrit köprüyü kurar."""
    orch = EschatonOrchestrator()
    st = orch.get_status(project_hint=project)

    if not st["bridge"]["connected"] and launch:
        launched = orch.bridge.process_manager.launch_with_cdp(workspace_path=project)
        st = orch.get_status(project_hint=project)
        st["launch_attempted"] = launched

    if as_json:
        console.print_json(json.dumps(st, ensure_ascii=False))
        return

    bridge = st["bridge"]
    usage = st["usage"]
    shield = st["shield"]
    color = "green" if bridge["connected"] else "yellow"
    console.print(
        Panel.fit(
            f"[bold]Bağlantı Modu:[/bold] {bridge['mode']}\n"
            f"[bold]Durum:[/bold] {bridge['message']}\n"
            f"[bold]Kalan Usage:[/bold] %{usage['remaining_percent']:.2f} "
            f"(%10 Kalkanı: {'KİLİTLİ' if shield['locked'] else 'AKTİF'})\n"
            f"[bold]Açık Pencereler:[/bold] {', '.join(bridge['open_windows']) or '-'}",
            title=f"Eschaton-Agent v{__version__} — Antigravity Köprüsü",
            border_style=color,
        )
    )


@app.command()
def status(
    project: Optional[str] = typer.Option(None, "--project", "-p"),
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    """Aktif Antigravity bağlantısı, proje, modeller ve %10 usage kalkanı durumunu gösterir."""
    connect(launch=False, project=project, as_json=as_json)


@app.command()
def usage(
    set_remaining: Optional[float] = typer.Option(
        None,
        "--set-remaining",
        help="Kalan kota yüzdesini manuel kalibre eder (örn. kota yenilendiğinde 100).",
    ),
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    """Antigravity kullanım yüzdesini ve %10 koruma sınırını raporlar."""
    orch = EschatonOrchestrator()
    if set_remaining is not None:
        snap = orch.usage_tracker.set_manual_usage(set_remaining)
    else:
        st = orch.bridge.status()
        snap = orch.usage_tracker.read_snapshot(
            live_remaining_percent=st.live_remaining_usage_percent
        )

    payload = {
        "usage": snap.model_dump(),
        "min_remaining_floor_percent": orch.usage_shield.min_floor,
        "economy_threshold_percent": orch.usage_shield.economy_threshold,
        "locked": snap.remaining_percent <= orch.usage_shield.min_floor,
    }
    if as_json:
        console.print_json(json.dumps(payload, ensure_ascii=False))
        return

    locked = payload["locked"]
    console.print(
        Panel.fit(
            f"[bold]Kullanılan:[/bold] %{snap.used_percent:.2f}\n"
            f"[bold]Kalan:[/bold] %{snap.remaining_percent:.2f}\n"
            f"[bold]Kesin Koruma Tabanı:[/bold] %{orch.usage_shield.min_floor:.1f}\n"
            f"[bold]Ekonomi Modu Eşiği:[/bold] %{orch.usage_shield.economy_threshold:.1f}\n"
            f"[bold]Kalkan Durumu:[/bold] {'[red]KİLİTLİ (%10 Koruma Aktif)[/red]' if locked else '[green]GÜVENLİ[/green]'}\n"
            f"[bold]Kaynak:[/bold] {snap.source}",
            title="Eschaton %10 Usage Kalkanı",
            border_style="red" if locked else "cyan",
        )
    )


@app.command("research-model")
def research_model(
    prompt: str = typer.Argument(..., help="Analiz edilecek görev promptu."),
    role: Optional[str] = typer.Option(None, "--role", "-r", help="Opsiyonel uzman rol."),
    refresh: bool = typer.Option(False, "--refresh", help="Canlı web benchmark kaynaklarını zorla yeniler."),
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    """Güncel benchmark kaynaklarına göre prompt için en iyi Antigravity modelini seçer."""
    orch = EschatonOrchestrator()
    st = orch.bridge.status()
    snap = orch.usage_tracker.read_snapshot(live_remaining_percent=st.live_remaining_usage_percent)
    sel = orch.model_selector.select(
        prompt=prompt,
        available_models=st.available_models or None,
        remaining_usage_percent=snap.remaining_percent,
        role=role,
        force_refresh=refresh,
    )
    if as_json:
        console.print_json(sel.model_dump_json())
        return

    table = Table(title="Canlı Benchmark Model Seçimi")
    table.add_column("Alan", style="cyan")
    table.add_column("Değer", style="white")
    table.add_row("Seçilen Model", f"[bold green]{sel.selected_model}[/bold green]")
    table.add_row("Görev Kategorisi", sel.task_category.value)
    table.add_row("Alan / Bileşik Skor", f"{sel.domain_score:.1f} / {sel.composite_score:.1f}")
    table.add_row("Maliyet Verimliliği", f"{sel.cost_efficiency:.1f}/100")
    table.add_row("Ekonomi Modu", "Evet" if sel.economy_mode_applied else "Hayır")
    table.add_row("Kaynaklar", ", ".join(sel.sources))
    table.add_row("Gerekçe", sel.rationale)
    console.print(table)


@app.command("select-project")
def select_project(
    project_hint: str = typer.Argument(..., help="Proje yolu veya adı."),
    open_app: bool = typer.Option(False, "--open", help="Açık değilse Antigravity'de başlatır."),
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    """Bilgisayardaki doğru projeyi bulur ve Antigravity ile eşleştirir."""
    orch = EschatonOrchestrator()
    st = orch.bridge.status()
    match = orch.workspace_selector.resolve(
        project_hint=project_hint,
        open_antigravity_titles=st.open_windows,
    )
    launched = False
    if open_app and match.found and not match.already_open_in_antigravity:
        launched = orch.bridge.ensure_project_open(match.project_path, match.project_name)

    if as_json:
        console.print_json(json.dumps({"workspace": match.model_dump(), "launched": launched}, ensure_ascii=False))
        return

    console.print(
        Panel.fit(
            f"[bold]Proje:[/bold] {match.project_name}\n"
            f"[bold]Yol:[/bold] {match.project_path}\n"
            f"[bold]Antigravity'de Açık mı:[/bold] {'Evet' if match.already_open_in_antigravity else 'Hayır'}\n"
            f"[bold]Güven:[/bold] {match.confidence:.2f}\n"
            f"[bold]Açıklama:[/bold] {match.reason}",
            title="Akıllı Proje Seçici",
            border_style="blue",
        )
    )


@app.command()
def delegate(
    prompt: str = typer.Argument(..., help="Antigravity'ye devredilecek görev promptu."),
    project: Optional[str] = typer.Option(None, "--project", "-p", help="Hedef proje dizini veya adı."),
    role: str = typer.Option(
        "code_implementer",
        "--role",
        "-r",
        help=f"Antigravity yardımcı rolü ({', '.join(ROLES.keys())}).",
    ),
    caller: str = typer.Option("external-agent", "--caller", help="Çağıran ajan adı (ör. Qoder, OpenCode)."),
    dry_run: bool = typer.Option(False, "--dry-run", help="Göndermeden tüm kontrolleri simüle eder."),
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    """Proje seçimi + güncel benchmark model seçimi + %10 usage kalkanı ile Antigravity'ye görev devreder."""
    orch = EschatonOrchestrator()
    report = orch.delegate_task(
        prompt=prompt,
        project_hint=project,
        role=role,
        caller_agent=caller,
        dry_run=dry_run,
    )

    if as_json:
        console.print_json(report.model_dump_json())
        if report.blocked_by_usage_shield:
            raise typer.Exit(code=2)
        return

    border = "red" if report.blocked_by_usage_shield else ("green" if report.executed else "yellow")
    title = (
        "ENGELLEDİ: %10 Usage Kalkanı"
        if report.blocked_by_usage_shield
        else ("Görev Antigravity'ye İletildi" if report.executed else "Görev Simülasyonu / Beklemede")
    )
    suggestion = (
        f"\n[bold yellow]Öneri:[/bold yellow] {report.usage_decision.optimized_prompt_suggestion}"
        if report.usage_decision.optimized_prompt_suggestion
        else ""
    )
    console.print(
        Panel.fit(
            f"[bold]Proje:[/bold] {report.workspace.project_name} ({report.workspace.project_path})\n"
            f"[bold]Rol:[/bold] {report.role.title} ({report.role.antigravity_mode} Modu)\n"
            f"[bold]Seçilen Model:[/bold] {report.usage_decision.recommended_model or report.model_selection.selected_model}\n"
            f"[bold]Kalan Usage:[/bold] %{report.usage_decision.remaining_before:.2f} -> "
            f"Tahmini %{report.usage_decision.projected_remaining_after:.2f}\n"
            f"[bold]Sonuç:[/bold] {report.summary}{suggestion}",
            title=title,
            border_style=border,
        )
    )
    if report.blocked_by_usage_shield:
        raise typer.Exit(code=2)


@app.command()
def mcp() -> None:
    """Qoder, OpenCode, Claude Code ve Cursor için standart MCP stdio sunucusunu başlatır."""
    server = EschatonMCPServer()
    server.run_stdio()


if __name__ == "__main__":
    app()
