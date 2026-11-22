"""
Chrome DevTools Protocol (CDP) client for controlling Antigravity's Electron UI
directly in the background without hijacking the user's mouse or keyboard.
"""

from __future__ import annotations

import asyncio
import json
import re
from typing import Any, Dict, List, Optional

import httpx
from pydantic import BaseModel


class CDPTarget(BaseModel):
    """An inspectable Electron page/window target exposed over CDP."""

    id: str
    title: str = ""
    url: str = ""
    type: str = "page"
    websocket_url: Optional[str] = None


class CDPClient:
    """Lightweight CDP HTTP + WebSocket bridge for Antigravity."""

    def __init__(self, host: str = "127.0.0.1", port: int = 9222, timeout: float = 5.0):
        self.host = host
        self.port = port
        self.timeout = timeout
        self._msg_id = 0

    @property
    def base_url(self) -> str:
        return f"http://{self.host}:{self.port}"

    def list_targets(self) -> List[CDPTarget]:
        """List open Antigravity windows/pages via CDP `/json/list`."""
        try:
            with httpx.Client(timeout=self.timeout) as client:
                resp = client.get(f"{self.base_url}/json/list")
                if resp.status_code != 200:
                    return []
                raw = resp.json()
                targets: List[CDPTarget] = []
                for item in raw:
                    if item.get("type") != "page":
                        continue
                    targets.append(
                        CDPTarget(
                            id=str(item.get("id", "")),
                            title=str(item.get("title", "")),
                            url=str(item.get("url", "")),
                            type=str(item.get("type", "page")),
                            websocket_url=item.get("webSocketDebuggerUrl"),
                        )
                    )
                return targets
        except Exception:
            return []

    def select_target(self, project_name: Optional[str] = None) -> Optional[CDPTarget]:
        """Find the best matching Antigravity window target."""
        targets = self.list_targets()
        if not targets:
            return None
        if project_name:
            needle = project_name.lower()
            for t in targets:
                if needle in t.title.lower() or needle in t.url.lower():
                    return t
        for t in targets:
            if "antigravity" in t.title.lower() or "workbench" in t.url.lower():
                return t
        return targets[0]

    def evaluate_js(self, target: CDPTarget, expression: str) -> Any:
        """Synchronously evaluate a JavaScript expression inside the target Electron page."""
        if not target.websocket_url:
            return None
        try:
            return asyncio.run(self._async_evaluate(target.websocket_url, expression))
        except RuntimeError:
            # Already inside an event loop
            loop = asyncio.new_event_loop()
            try:
                return loop.run_until_complete(self._async_evaluate(target.websocket_url, expression))
            finally:
                loop.close()
        except Exception:
            return None

    async def _async_evaluate(self, ws_url: str, expression: str) -> Any:
        import websockets  # local import keeps startup fast

        self._msg_id += 1
        req_id = self._msg_id
        payload = {
            "id": req_id,
            "method": "Runtime.evaluate",
            "params": {
                "expression": expression,
                "returnByValue": True,
                "awaitPromise": True,
            },
        }
        async with websockets.connect(ws_url, open_timeout=self.timeout) as ws:
            await ws.send(json.dumps(payload))
            while True:
                raw = await asyncio.wait_for(ws.recv(), timeout=self.timeout)
                msg = json.loads(raw)
                if msg.get("id") == req_id:
                    result = msg.get("result", {}).get("result", {})
                    return result.get("value")

    def read_live_usage_percent(self, target: CDPTarget) -> Optional[float]:
        """
        Inspect Antigravity's DOM/status widgets for remaining usage percentage.
        Returns remaining percentage (0..100) if detected, else None.
        """
        js = r"""
        (() => {
            const text = document.body ? document.body.innerText : "";
            const patterns = [
                /(\d{1,3}(?:\.\d+)?)\s*%\s*(?:remaining|left|kalan)/i,
                /(?:remaining|quota|usage|kota)[^\d]{0,20}(\d{1,3}(?:\.\d+)?)\s*%/i
            ];
            for (const p of patterns) {
                const m = text.match(p);
                if (m) return { matched: m[0], value: parseFloat(m[1]) };
            }
            return null;
        })()
        """
        res = self.evaluate_js(target, js)
        if isinstance(res, dict) and "value" in res:
            val = float(res["value"])
            matched = str(res.get("matched", "")).lower()
            if "used" in matched or "kullanılan" in matched:
                return max(0.0, min(100.0, 100.0 - val))
            return max(0.0, min(100.0, val))
        return None

    def read_available_models(self, target: CDPTarget) -> List[str]:
        """Extract selectable model names exposed in Antigravity's model picker."""
        js = r"""
        (() => {
            const nodes = Array.from(document.querySelectorAll('[role="option"], [data-model], button, span'));
            const known = /(gemini|claude|gpt|o3|o4|sonnet|opus|flash)/i;
            const found = new Set();
            for (const n of nodes) {
                const t = (n.getAttribute('data-model') || n.innerText || '').trim();
                if (t && t.length <= 48 && known.test(t) && !t.includes('\n')) {
                    found.add(t);
                }
            }
            return Array.from(found).slice(0, 20);
        })()
        """
        res = self.evaluate_js(target, js)
        if isinstance(res, list):
            return [str(x) for x in res if isinstance(x, str)]
        return []

    def select_model(self, target: CDPTarget, model_name: str) -> bool:
        """Attempt to select the chosen model inside Antigravity's UI."""
        safe = json.dumps(model_name.lower())
        js = f"""
        (() => {{
            const wanted = {safe};
            const candidates = Array.from(document.querySelectorAll('[role="option"], [data-model], button'));
            for (const el of candidates) {{
                const label = (el.getAttribute('data-model') || el.innerText || '').toLowerCase().trim();
                if (label && (label === wanted || label.includes(wanted))) {{
                    el.click();
                    return true;
                }}
            }}
            return false;
        }})()
        """
        return bool(self.evaluate_js(target, js))

    def send_prompt(self, target: CDPTarget, prompt: str) -> Dict[str, Any]:
        """Inject the approved prompt into Antigravity's chat input and submit it."""
        safe_prompt = json.dumps(prompt)
        js = f"""
        (() => {{
            const text = {safe_prompt};
            const input = document.querySelector(
                'textarea[placeholder*="Ask"], textarea[placeholder*="Message"], textarea, [contenteditable="true"][role="textbox"]'
            );
            if (!input) return {{ ok: false, error: "Antigravity sohbet giriş kutusu DOM içinde bulunamadı." }};
            input.focus();
            if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {{
                const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
                if (setter) setter.call(input, text);
                else input.value = text;
                input.dispatchEvent(new Event('input', {{ bubbles: true }}));
            }} else {{
                input.innerText = text;
                input.dispatchEvent(new InputEvent('input', {{ bubbles: true, data: text }}));
            }}
            const sendBtn = document.querySelector('button[type="submit"], button[aria-label*="Send"], button[aria-label*="Gönder"]');
            if (sendBtn && !sendBtn.disabled) {{
                sendBtn.click();
                return {{ ok: true, method: "button_click" }};
            }}
            input.dispatchEvent(new KeyboardEvent('keydown', {{ key: 'Enter', code: 'Enter', bubbles: true }}));
            return {{ ok: true, method: "enter_key" }};
        }})()
        """
        res = self.evaluate_js(target, js)
        if isinstance(res, dict):
            return res
        return {"ok": False, "error": "CDP evaluate yanıt vermedi."}
