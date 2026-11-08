from eschaton.core.actions import StepDecision, ClickAction, FinishAction
from eschaton.providers.base import BaseLLMProvider
from eschaton.agent.loop import AutonomousComputerAgent
from eschaton.config import AgentConfig


class MockLLMProvider(BaseLLMProvider):
    def __init__(self):
        super().__init__(api_key="mock", model="mock-model")
        self.step = 0

    def plan_next_step(self, goal, screen_base64, screen_resolution, history):
        self.step += 1
        if self.step == 1:
            return StepDecision(
                thought="Not defterini açmak için simgeye tıklıyorum",
                action=ClickAction(x=50, y=50, reasoning="Tıklama testi")
            )
        else:
            return StepDecision(
                thought="Hedefe ulaşıldı, görev sonlandırılıyor.",
                action=FinishAction(message="Test görevi başarıyla simüle edildi!")
            )


def test_agent_autonomous_loop_dry_run():
    mock_prov = MockLLMProvider()
    cfg = AgentConfig(action_delay=0.0, failsafe=False)
    agent = AutonomousComputerAgent(config=cfg, provider=mock_prov)
    
    result = agent.run(goal="Test Simülasyonu", max_steps=5, dry_run=True)
    assert "başarıyla simüle edildi" in result
    assert len(agent.history) == 1
    agent.close()
