import json
from typing import Tuple, List, Optional
import anthropic
from eschaton.core.actions import StepDecision
from eschaton.providers.base import BaseLLMProvider, SYSTEM_PROMPT


class AnthropicProvider(BaseLLMProvider):
    """
    Anthropic Claude provider (Claude 3.5 Sonnet / Claude 3.7 Sonnet).
    """

    def __init__(self, api_key: str, model: str = "claude-3-7-sonnet-20250219", base_url: Optional[str] = None):
        super().__init__(api_key=api_key, model=model, base_url=base_url)
        self.client = anthropic.Anthropic(
            api_key=self.api_key,
            base_url=self.base_url
        )

    def plan_next_step(
        self,
        goal: str,
        screen_base64: str,
        screen_resolution: Tuple[int, int],
        history: List[dict]
    ) -> StepDecision:
        width, height = screen_resolution

        user_content = [
            {
                "type": "text",
                "text": f"KULLANICI HEDEFİ: {goal}\nEkran Çözünürlüğü: {width}x{height} piksel.\nGeçmiş Eylemler: {json.dumps(history[-6:], ensure_ascii=False)}\n\nLütfen sadece geçerli JSON döndür."
            },
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/png",
                    "data": screen_base64
                }
            }
        ]

        response = self.client.messages.create(
            model=self.model,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_content}],
            max_tokens=1024,
            temperature=0.1
        )

        raw_text = response.content[0].text
        # Strip markdown fences if present
        if "```json" in raw_text:
            raw_text = raw_text.split("```json")[1].split("```")[0].strip()
        elif "```" in raw_text:
            raw_text = raw_text.split("```")[1].split("```")[0].strip()

        data = json.loads(raw_text)
        return StepDecision.model_validate(data)
