import time
import subprocess
import pyautogui
from rich.console import Console
from eschaton.core.actions import (
    AgentAction,
    ClickAction,
    MoveAction,
    DragAction,
    TypeAction,
    HotkeyAction,
    KeyPressAction,
    ScrollAction,
    ShellAction,
    WaitAction,
    FinishAction
)

console = Console()


class ComputerController:
    """Executes high-precision mouse, keyboard, and OS actions on the system."""

    def __init__(self, action_delay: float = 0.5, failsafe: bool = True):
        self.action_delay = action_delay
        pyautogui.FAILSAFE = failsafe
        pyautogui.PAUSE = 0.1

    def execute(self, action: AgentAction) -> str:
        """Executes an action model on the physical or virtual desktop."""
        try:
            if isinstance(action, ClickAction):
                x, y = int(action.x), int(action.y)
                if action.action == "double_click":
                    pyautogui.doubleClick(x, y)
                elif action.action == "right_click":
                    pyautogui.rightClick(x, y)
                elif action.action == "middle_click":
                    pyautogui.middleClick(x, y)
                else:
                    pyautogui.click(x, y)
                msg = f"Tıklandı: ({x}, {y}) [{action.action}]"

            elif isinstance(action, MoveAction):
                pyautogui.moveTo(int(action.x), int(action.y))
                msg = f"Fare taşındı: ({action.x}, {action.y})"

            elif isinstance(action, DragAction):
                pyautogui.moveTo(int(action.start_x), int(action.start_y))
                pyautogui.dragTo(int(action.end_x), int(action.end_y), duration=0.4)
                msg = f"Sürüklendi: ({action.start_x}, {action.start_y}) -> ({action.end_x}, {action.end_y})"

            elif isinstance(action, TypeAction):
                # Write text cleanly
                pyautogui.write(action.text, interval=0.02)
                if action.press_enter:
                    pyautogui.press("enter")
                msg = f"Yazıldı: '{action.text}' (Enter={action.press_enter})"

            elif isinstance(action, HotkeyAction):
                pyautogui.hotkey(*action.keys)
                msg = f"Kısayol basıldı: {' + '.join(action.keys)}"

            elif isinstance(action, KeyPressAction):
                pyautogui.press(action.key)
                msg = f"Tuşa basıldı: {action.key}"

            elif isinstance(action, ScrollAction):
                if action.x is not None and action.y is not None:
                    pyautogui.moveTo(int(action.x), int(action.y))
                pyautogui.scroll(action.clicks)
                msg = f"Kaydırıldı (Scroll): {action.clicks} click"

            elif isinstance(action, ShellAction):
                # Run background process or command safely via powershell / cmd
                proc = subprocess.Popen(
                    action.command,
                    shell=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True
                )
                msg = f"Komut çalıştırıldı: {action.command} (PID={proc.pid})"

            elif isinstance(action, WaitAction):
                time.sleep(max(0.1, action.seconds))
                msg = f"Beklendi: {action.seconds} saniye"

            elif isinstance(action, FinishAction):
                msg = f"GÖREV TAMAMLANDI: {action.message}"

            else:
                msg = f"Bilinmeyen eylem tipi: {type(action)}"

            if self.action_delay > 0:
                time.sleep(self.action_delay)

            return msg

        except pyautogui.FailSafeException:
            raise RuntimeError("Failsafe tetiklendi: Fare ekran köşesine çekilerek acil durduruldu!")
        except Exception as e:
            return f"Eylem hatası: {str(e)}"
