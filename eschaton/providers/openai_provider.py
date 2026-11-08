import json
from typing import Tuple, List, Optional
from openai import OpenAI
from eschaton.core.actions import StepDecision
from eschaton.providers.base import BaseLLMProvider, SYSTEM_PROMPT


class OpenAICompatibleProvider(BaseLLMProvider):
    """
    Universal OpenAI-compatible provider:
    Supports OpenAI (gpt-4o), DeepSeek (deepseek-chat via custom base_url),
    OpenRouter, Ollama, Groq, vLLM, or any custom API endpoint.
    """

    def __init__(self, api_key: str, model: str = "gpt-4o", base_url: Optional[str] = None):
        super().__init__(api_key=api_key, model=model, base_url=base_url)
        self.client = OpenAI(
            api_key=self.api_key or "no-key",
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
                "text": f"KULLANICI HEDEFİ: {goal}\nEkran Çözünürlüğü: {width}x{height} piksel.\nGeçmiş Eylemler: {json.dumps(history[-6:], ensure_ascii=False)}"
            },
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/png;base64,{screen_base64}",
                    "detail": "high"
                }
            }
        ]

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content}
        ]

        response = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            response_format={"type": "json_object"},
            temperature=0.1
        )

        content = response.choices[0].message.content or "{}"
        data = json.loads(content)
        return StepDecision.model_validate(data)
