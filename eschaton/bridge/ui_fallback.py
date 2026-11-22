"""
Optional OS-level UI Automation fallback when Antigravity is running
without an exposed Electron CDP debug port.
"""

from __future__ import annotations

import time
from typing import Dict, Any, Optional


class UIFallbackController:
    """Graceful UI automation fallback (activates only when optional UI extras are installed)."""

    def is_available(self) -> bool:
        try:
            import pyautogui  # noqa: F401
            return True
        except Exception:
            return False

    def focus_antigravity_window(self, project_hint: Optional[str] = None) -> bool:
        try:
            import pygetwindow as gw
        except Exception:
            return False

        try:
            windows = gw.getAllWindows()
            for w in windows:
                title = (w.title or "").lower()
                if "antigravity" in title and (not project_hint or project_hint.lower() in title):
                    w.activate()
                    time.sleep(0.3)
                    return True
            for w in windows:
                if "antigravity" in (w.title or "").lower():
                    w.activate()
                    time.sleep(0.3)
                    return True
        except Exception:
            return False
        return False

    def send_prompt_via_ui(self, prompt: str, project_hint: Optional[str] = None) -> Dict[str, Any]:
        if not self.is_available():
            return {
                "ok": False,
                "error": (
                    "UI fallback için opsiyonel GUI paketleri kurulu değil (`pip install -e '.[ui]'`). "
                    "En kararlı çalışma için Antigravity'yi `--remote-debugging-port=9222` ile başlatın."
                ),
            }

        import pyautogui

        focused = self.focus_antigravity_window(project_hint=project_hint)
        if not focused:
            return {
                "ok": False,
                "error": "Ekranda açık bir Antigravity penceresi bulunamadı.",
            }

        pyautogui.PAUSE = 0.05
        pyautogui.write(prompt, interval=0.005)
        pyautogui.press("enter")
        return {"ok": True, "method": "ui_automation_fallback"}
