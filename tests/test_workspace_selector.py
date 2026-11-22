"""Unit tests for the Smart Project / Workspace Selector."""

from pathlib import Path

from eschaton.config import EschatonConfig
from eschaton.workspace.selector import WorkspaceSelector


def test_resolves_direct_project_path(tmp_path: Path):
    proj = tmp_path / "MyCoolApp"
    proj.mkdir()
    (proj / ".git").mkdir()

    cfg = EschatonConfig(state_dir=tmp_path / ".eschaton", workspace_search_roots=[tmp_path])
    selector = WorkspaceSelector(cfg)

    match = selector.resolve(
        project_hint=str(proj),
        open_antigravity_titles=["Antigravity - MyCoolApp"],
    )
    assert match.found is True
    assert match.project_name == "MyCoolApp"
    assert match.project_path == str(proj.resolve())
    assert match.already_open_in_antigravity is True
    assert match.confidence == 1.0


def test_discovers_and_matches_project_by_name_and_prompt(tmp_path: Path):
    app_a = tmp_path / "AlphaService"
    app_b = tmp_path / "BetaDashboard"
    app_a.mkdir()
    app_b.mkdir()
    (app_a / "pyproject.toml").write_text("[project]\nname='alpha'\n", encoding="utf-8")
    (app_b / "package.json").write_text('{"name":"beta"}', encoding="utf-8")

    cfg = EschatonConfig(state_dir=tmp_path / ".eschaton", workspace_search_roots=[tmp_path])
    selector = WorkspaceSelector(cfg)

    match = selector.resolve(
        project_hint="BetaDashboard",
        prompt="Update navbar styles in BetaDashboard",
    )
    assert match.found is True
    assert match.project_name == "BetaDashboard"
    assert match.project_path == str(app_b.resolve())
