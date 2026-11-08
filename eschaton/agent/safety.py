import re
from typing import Tuple
from eschaton.core.actions import AgentAction, ShellAction


BLOCKED_COMMAND_PATTERNS = [
    r"format\s+[a-zA-Z]:",
    r"rmdir\s+/s\s+/q\s+c:\\windows",
    r"del\s+/f\s+/s\s+/q\s+c:\\windows",
    r"diskpart",
    r"bcdedit",
    r":\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:",  # Forkbomb
]


class SafetyGate:
    """Guards against catastrophic actions and enforces safe limits."""

    @staticmethod
    def inspect(action: AgentAction) -> Tuple[bool, str]:
        """Returns (is_safe, reason)."""
        if isinstance(action, ShellAction):
            cmd = action.command.lower()
            for pattern in BLOCKED_COMMAND_PATTERNS:
                if re.search(pattern, cmd):
                    return False, f"Güvenlik İhlali: Tehlikeli komut algılandı ve engellendi ({pattern})"
        
        return True, "Safe"
