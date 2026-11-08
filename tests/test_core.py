import pytest
from eschaton.config import AgentConfig
from eschaton.core.actions import (
    ClickAction,
    TypeAction,
    HotkeyAction,
    ShellAction,
    WaitAction,
    FinishAction,
    StepDecision
)
from eschaton.core.screen import ScreenCapturer
from eschaton.agent.safety import SafetyGate


def test_config_defaults():
    cfg = AgentConfig()
    assert cfg.provider == "openai_compatible"
    assert cfg.model == "gpt-4o"
    assert cfg.failsafe is True
    assert cfg.action_delay == 0.5


def test_actions_serialization():
    click = ClickAction(action="click", x=100, y=200, reasoning="Test click")
    assert click.x == 100
    assert click.y == 200

    decision = StepDecision(
        thought="Test reasoning",
        action=click
    )
    dumped = decision.model_dump()
    assert dumped["thought"] == "Test reasoning"
    assert dumped["action"]["action"] == "click"

    reloaded = StepDecision.model_validate(dumped)
    assert isinstance(reloaded.action, ClickAction)


def test_safety_gate_blocks_destructive():
    safe_act = ShellAction(command="start notepad")
    is_safe, _ = SafetyGate.inspect(safe_act)
    assert is_safe is True

    bad_act = ShellAction(command="format C: /y")
    is_safe, reason = SafetyGate.inspect(bad_act)
    assert is_safe is False
    assert "Tehlikeli komut" in reason


def test_screen_capture():
    capturer = ScreenCapturer()
    img, orig_res = capturer.capture(scale=0.5)
    assert orig_res[0] > 0
    assert orig_res[1] > 0
    assert img.width == int(orig_res[0] * 0.5)

    b64_str, res = capturer.capture_base64(scale=0.2)
    assert len(b64_str) > 100
    capturer.close()
