"""Process discovery and Electron CDP port detection for local Antigravity."""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import List, Optional

import httpx
import psutil
from pydantic import BaseModel

from eschaton.config import EschatonConfig


class AntigravityProcessInfo(BaseModel):
    """Information about a running local Antigravity desktop instance."""

    running: bool = False
    pid: Optional[int] = None
    executable: Optional[str] = None
    cdp_port: Optional[int] = None
    cdp_reachable: bool = False
    cmdline: List[str] = []


class ProcessManager:
    """Finds running Antigravity desktop processes and their Electron CDP ports."""

    def __init__(self, config: Optional[EschatonConfig] = None):
        self.config = config or EschatonConfig.from_env()

    def inspect(self) -> AntigravityProcessInfo:
        """Inspect local OS processes and probe Electron CDP ports for Antigravity."""
        info = AntigravityProcessInfo()

        # 1. Scan running processes for Antigravity
        try:
            for proc in psutil.process_iter(["pid", "name", "exe", "cmdline"]):
                name = (proc.info.get("name") or "").lower()
                exe = (proc.info.get("exe") or "").lower()
                cmdline = proc.info.get("cmdline") or []
                joined = " ".join(cmdline).lower()

                if "antigravity" in name or "antigravity" in exe or "antigravity" in joined:
                    # Skip our own python/eschaton processes
                    if "eschaton" in joined or "pytest" in joined:
                        continue
                    info.running = True
                    info.pid = proc.info.get("pid")
                    info.executable = proc.info.get("exe") or proc.info.get("name")
                    info.cmdline = list(cmdline)

                    # Extract --remote-debugging-port=<PORT> if present
                    for arg in cmdline:
                        match = re.match(r"--remote-debugging-port=(\d+)", arg)
                        if match:
                            info.cdp_port = int(match.group(1))
                            break
                    break
        except Exception:
            pass

        # 2. Probe CDP ports (discovered port first, then defaults)
        ports_to_probe: List[int] = []
        if info.cdp_port:
            ports_to_probe.append(info.cdp_port)
        for p in self.config.cdp_ports:
            if p not in ports_to_probe:
                ports_to_probe.append(p)

        for port in ports_to_probe:
            if self._is_cdp_port_open(port):
                info.cdp_port = port
                info.cdp_reachable = True
                info.running = True
                break

        return info

    def _is_cdp_port_open(self, port: int) -> bool:
        url = f"http://{self.config.cdp_host}:{port}/json/version"
        try:
            with httpx.Client(timeout=0.6) as client:
                resp = client.get(url)
                return resp.status_code == 200
        except Exception:
            return False

    def find_executable(self) -> Optional[str]:
        """Locate the Antigravity desktop executable on Windows, macOS, or Linux."""
        for candidate in ("antigravity", "Antigravity", "antigravity.exe"):
            found = shutil.which(candidate)
            if found:
                return found

        if sys.platform.startswith("win"):
            local_app = Path(os.getenv("LOCALAPPDATA", ""))
            candidates = [
                local_app / "Programs" / "Antigravity" / "Antigravity.exe",
                local_app / "Antigravity" / "Antigravity.exe",
                Path("C:/Program Files/Antigravity/Antigravity.exe"),
            ]
        elif sys.platform == "darwin":
            candidates = [
                Path("/Applications/Antigravity.app/Contents/MacOS/Antigravity"),
                Path.home() / "Applications/Antigravity.app/Contents/MacOS/Antigravity",
            ]
        else:
            candidates = [
                Path("/usr/bin/antigravity"),
                Path("/usr/local/bin/antigravity"),
                Path("/opt/Antigravity/antigravity"),
                Path.home() / ".local/bin/antigravity",
            ]

        for path in candidates:
            if path.exists():
                return str(path)
        return None

    def launch_with_cdp(self, workspace_path: Optional[str] = None, port: Optional[int] = None) -> bool:
        """Launch Antigravity with Electron remote debugging enabled for background control."""
        exe = self.find_executable()
        if not exe:
            return False
        cdp_port = port or self.config.preferred_cdp_port
        cmd = [exe, f"--remote-debugging-port={cdp_port}"]
        if workspace_path:
            cmd.append(workspace_path)
        try:
            subprocess.Popen(
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
            return True
        except Exception:
            return False
