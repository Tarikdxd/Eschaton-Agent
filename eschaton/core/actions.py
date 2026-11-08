from typing import Literal, Optional, List, Union
from pydantic import BaseModel, Field


class ClickAction(BaseModel):
    action: Literal["click", "double_click", "right_click", "middle_click"] = "click"
    x: int = Field(description="Target X pixel coordinate")
    y: int = Field(description="Target Y pixel coordinate")
    reasoning: Optional[str] = Field(default="", description="Why this coordinate was chosen")


class MoveAction(BaseModel):
    action: Literal["move"] = "move"
    x: int
    y: int


class DragAction(BaseModel):
    action: Literal["drag"] = "drag"
    start_x: int
    start_y: int
    end_x: int
    end_y: int


class TypeAction(BaseModel):
    action: Literal["type"] = "type"
    text: str = Field(description="Text to type into focused element")
    press_enter: bool = Field(default=False, description="Whether to press Enter after typing")


class HotkeyAction(BaseModel):
    action: Literal["hotkey"] = "hotkey"
    keys: List[str] = Field(description="List of keys to press simultaneously (e.g. ['ctrl', 'c'], ['win'], ['alt', 'tab'])")


class KeyPressAction(BaseModel):
    action: Literal["key_press"] = "key_press"
    key: str = Field(description="Key to press (e.g. 'enter', 'esc', 'space', 'backspace')")


class ScrollAction(BaseModel):
    action: Literal["scroll"] = "scroll"
    clicks: int = Field(description="Number of scroll clicks (positive for up, negative for down)")
    x: Optional[int] = None
    y: Optional[int] = None


class ShellAction(BaseModel):
    action: Literal["shell"] = "shell"
    command: str = Field(description="System command to run (e.g. start calc, start obs, etc.)")


class WaitAction(BaseModel):
    action: Literal["wait"] = "wait"
    seconds: float = Field(default=1.0, description="Seconds to pause and wait for UI to settle")


class FinishAction(BaseModel):
    action: Literal["finish"] = "finish"
    message: str = Field(description="Summary of task completion or why task is finished")


AgentAction = Union[
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
]


class StepDecision(BaseModel):
    thought: str = Field(description="Internal reasoning about current screen state and next step")
    action: AgentAction = Field(description="Concrete action to execute on OS")
