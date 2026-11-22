"""
Smart Project / Workspace Selector.

Matches the project requested by an external agent (Qoder, OpenCode, etc.) against:
1. Explicit filesystem path
2. Currently open Antigravity windows/workspaces
3. Local git repositories / project directories on the machine
"""

from __future__ import annotations

from pathlib import Path
from typing import List, Optional

from pydantic import BaseModel

from eschaton.config import EschatonConfig


PROJECT_MARKERS = (
    ".git",
    "pyproject.toml",
    "package.json",
    "Cargo.toml",
    "go.mod",
    "pom.xml",
    "Makefile",
    "README.md",
)


class ProjectCandidate(BaseModel):
    """A discovered local project workspace."""

    name: str
    path: str
    score: float = 0.0
    is_git_repo: bool = False
    matched_open_window: bool = False


class WorkspaceMatch(BaseModel):
    """Result of resolving the right project for Antigravity to operate on."""

    found: bool
    project_name: str
    project_path: str
    already_open_in_antigravity: bool = False
    confidence: float = 0.0
    reason: str
    candidates: List[ProjectCandidate] = []


class WorkspaceSelector:
    """Finds and selects the exact project workspace for Antigravity."""

    def __init__(self, config: Optional[EschatonConfig] = None):
        self.config = config or EschatonConfig.from_env()

    def discover_projects(self, max_depth: int = 2) -> List[ProjectCandidate]:
        """Scan configured workspace roots for project directories."""
        seen: set[str] = set()
        results: List[ProjectCandidate] = []

        for root in self.config.workspace_search_roots:
            if not root.exists() or not root.is_dir():
                continue
            self._scan_dir(root, 0, max_depth, seen, results)

        return results

    def _scan_dir(
        self,
        directory: Path,
        depth: int,
        max_depth: int,
        seen: set[str],
        out: List[ProjectCandidate],
    ) -> None:
        try:
            resolved = str(directory.resolve())
        except Exception:
            return
        if resolved in seen:
            return

        if self._is_project_dir(directory):
            seen.add(resolved)
            out.append(
                ProjectCandidate(
                    name=directory.name,
                    path=resolved,
                    is_git_repo=(directory / ".git").exists(),
                )
            )
            return

        if depth >= max_depth:
            return

        try:
            for child in directory.iterdir():
                if not child.is_dir():
                    continue
                if child.name.startswith(".") or child.name in ("node_modules", "venv", ".venv", "__pycache__", "dist", "build"):
                    continue
                self._scan_dir(child, depth + 1, max_depth, seen, out)
        except PermissionError:
            return

    @staticmethod
    def _is_project_dir(path: Path) -> bool:
        return any((path / marker).exists() for marker in PROJECT_MARKERS)

    def resolve(
        self,
        project_hint: Optional[str] = None,
        prompt: Optional[str] = None,
        open_antigravity_titles: Optional[List[str]] = None,
    ) -> WorkspaceMatch:
        """
        Resolve the target project path from an explicit path, project name,
        prompt text, or active working directory.
        """
        open_titles = [t.lower() for t in (open_antigravity_titles or [])]

        # 1. Direct path check
        if project_hint:
            direct = Path(project_hint).expanduser()
            if direct.exists() and direct.is_dir():
                resolved = str(direct.resolve())
                name = direct.resolve().name
                already_open = any(name.lower() in title for title in open_titles)
                return WorkspaceMatch(
                    found=True,
                    project_name=name,
                    project_path=resolved,
                    already_open_in_antigravity=already_open,
                    confidence=1.0,
                    reason=f"Doğrudan verilen proje dizini eşleşti: {resolved}",
                    candidates=[
                        ProjectCandidate(
                            name=name,
                            path=resolved,
                            score=1.0,
                            is_git_repo=(direct / ".git").exists(),
                            matched_open_window=already_open,
                        )
                    ],
                )

        # 2. Score discovered projects against project_hint and prompt text
        candidates = self.discover_projects()
        hint_lower = (project_hint or "").lower().strip()
        prompt_lower = (prompt or "").lower()

        scored: List[ProjectCandidate] = []
        for cand in candidates:
            score = 0.0
            cname = cand.name.lower()
            cpath = cand.path.lower()

            if hint_lower:
                if cname == hint_lower:
                    score += 1.0
                elif hint_lower in cname or cname in hint_lower:
                    score += 0.75
                elif hint_lower in cpath:
                    score += 0.5

            if prompt_lower and cname in prompt_lower:
                score += 0.6

            already_open = any(cname in title for title in open_titles)
            if already_open:
                score += 0.25

            if cand.is_git_repo:
                score += 0.05

            if score > 0:
                scored.append(
                    cand.model_copy(
                        update={
                            "score": round(min(1.0, score), 3),
                            "matched_open_window": already_open,
                        }
                    )
                )

        scored.sort(key=lambda c: c.score, reverse=True)
        if scored:
            top = scored[0]
            return WorkspaceMatch(
                found=True,
                project_name=top.name,
                project_path=top.path,
                already_open_in_antigravity=top.matched_open_window,
                confidence=top.score,
                reason=f"En yüksek eşleşme ile proje seçildi: {top.name} ({top.path})",
                candidates=scored[:5],
            )

        # 3. Fallback to current working directory
        cwd = Path.cwd().resolve()
        already_open = any(cwd.name.lower() in title for title in open_titles)
        return WorkspaceMatch(
            found=True,
            project_name=cwd.name,
            project_path=str(cwd),
            already_open_in_antigravity=already_open,
            confidence=0.4,
            reason=f"Özel eşleşme bulunamadı; aktif çalışma dizini seçildi: {cwd}",
            candidates=[],
        )
