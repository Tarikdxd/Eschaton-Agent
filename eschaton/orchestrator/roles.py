"""Specialist co-agent role templates for delegating work to Antigravity."""

from __future__ import annotations

from typing import Dict

from pydantic import BaseModel


class CoAgentRole(BaseModel):
    """Defines a specialist role and instructions tailored for Antigravity's full capabilities."""

    role_id: str
    title: str
    antigravity_mode: str  # "Agent" | "Plan"
    capabilities_hint: str
    system_directive: str


ROLES: Dict[str, CoAgentRole] = {
    "co_architect": CoAgentRole(
        role_id="co_architect",
        title="Senior Co-Architect",
        antigravity_mode="Plan",
        capabilities_hint="Plan Mode, Codebase Search, Architecture Artifacts, Mermaid Diagrams",
        system_directive=(
            "Sen bu projede ana geliştirici ajanın (Qoder/OpenCode) yanındaki Kıdemli Mimar (Co-Architect) "
            "yardımcısısın. Kod tabanını incele, mimari riskleri çıkar, net bir uygulama planı ve "
            "somut dosya/sembol önerileri üret."
        ),
    ),
    "code_implementer": CoAgentRole(
        role_id="code_implementer",
        title="Autonomous Code Implementer",
        antigravity_mode="Agent",
        capabilities_hint="Agent Mode, Multi-File Editing, Terminal Execution, Verification",
        system_directive=(
            "Sen bu projede ana geliştirici ajanın yanındaki Otonom Kod Geliştirici yardımcısısın. "
            "Verilen görevi doğrudan ilgili dosyalarda temiz, test edilebilir şekilde uygula, "
            "terminalde testleri çalıştır ve yapılan değişiklikleri özetle."
        ),
    ),
    "deep_debugger": CoAgentRole(
        role_id="deep_debugger",
        title="Deep Root-Cause Debugger",
        antigravity_mode="Agent",
        capabilities_hint="Agent Mode, Terminal Diagnostics, Stacktrace Analysis, Regression Tests",
        system_directive=(
            "Sen bu projede Kök Neden Hata Ayıklayıcı (Deep Debugger) yardımcısısın. "
            "Hatayı terminalde yeniden üret, kök nedeni tespit et, minimal ve kalıcı düzeltmeyi uygula "
            "ve regresyon testi ekleyerek doğrulama sonucunu raporla."
        ),
    ),
    "ui_specialist": CoAgentRole(
        role_id="ui_specialist",
        title="Frontend & UI/UX Specialist",
        antigravity_mode="Agent",
        capabilities_hint="Agent Mode, Web/CSS/Component Editing, Browser Preview & Visual Verification",
        system_directive=(
            "Sen bu projede Frontend ve Arayüz Uzmanı (UI Specialist) yardımcısısın. "
            "Modern, duyarlı ve erişilebilir bileşenler geliştir; mümkünse tarayıcı önizlemesi ile "
            "görsel doğrulama yap ve değişen dosyaları raporla."
        ),
    ),
    "reviewer_tester": CoAgentRole(
        role_id="reviewer_tester",
        title="Code Reviewer & QA Verification Agent",
        antigravity_mode="Agent",
        capabilities_hint="Agent Mode, Diff Review, Automated Unit/Integration Tests",
        system_directive=(
            "Sen bu projede Kod İnceleme ve Test Doğrulama (Reviewer & QA) yardımcısısın. "
            "Kenar durumları, güvenlik açıklarını ve performans sorunlarını tespit et; "
            "otomatik testler yazıp çalıştırarak net bir doğrulama raporu sun."
        ),
    ),
    "quick_helper": CoAgentRole(
        role_id="quick_helper",
        title="Fast Concise Co-Agent",
        antigravity_mode="Agent",
        capabilities_hint="Agent Mode, Low-Token Fast Edits",
        system_directive=(
            "Sen düşük token tüketimiyle hızlı katkı sağlayan yardımcı ajansın. "
            "Yalnızca istenen değişikliği doğrudan uygula ve kısa, net bir özet döndür."
        ),
    ),
}


def get_role(role_id: str) -> CoAgentRole:
    """Return a specialist role definition, defaulting to code_implementer."""
    return ROLES.get(role_id.strip().lower(), ROLES["code_implementer"])


def compose_delegation_prompt(
    user_prompt: str,
    role_id: str,
    project_name: str,
    project_path: str,
    caller_agent: str = "external-agent",
) -> str:
    """Wrap the external agent's raw prompt with structured co-agent role context."""
    role = get_role(role_id)
    return (
        f"[Eschaton Co-Agent Delegation | Caller: {caller_agent} | Role: {role.title} | Mode: {role.antigravity_mode}]\n"
        f"[Workspace: {project_name} ({project_path})]\n"
        f"Rol Yönergesi: {role.system_directive}\n\n"
        f"Görev:\n{user_prompt.strip()}\n\n"
        f"Çıktı Kuralı: İşlem bittiğinde değiştirilen dosyaları, çalıştırılan komutları ve doğrulama sonucunu kısa maddelerle raporla."
    )
