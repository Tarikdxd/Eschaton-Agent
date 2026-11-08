import json
import base64
from typing import Tuple, List, Optional
from google import genai
from google.genai import types
from eschaton.core.actions import StepDecision
from eschaton.providers.base import BaseLLMProvider, SYSTEM_PROMPT


class GeminiProvider(BaseLLMProvider):
    """
    Google Gemini Multimodal Provider (gemini-2.5-flash, gemini-2.5-pro).
    """

    def __init__(self, api_key: str, model: str = "gemini-2.5-flash", base_url: Optional[str] = None):
        super().__init__(api_key=api_key, model=model, base_url=base_url)
        self.client = genai.Client(api_key=self.api_key)

    def plan_next_step(
        self,
        goal: str,
        screen_base64: str,
        screen_resolution: Tuple[int, int],
        history: List[dict]
    ) -> StepDecision:
        width, height = screen_resolution

        img_bytes = base64.b64decode(screen_base64)
        image_part = types.Part.from_bytes(data=img_bytes, mime_type="image/png")

        prompt = (
            f"{SYSTEM_PROMPT}\n\n"
            f"KULLANICI HEDEFİ: {goal}\n"
            f"Ekran Çözünürlüğü: {width}x{height} piksel.\n"
            f"Geçmiş Eylemler: {json.dumps(history[-6:], ensure_ascii=False)}\n\n"
            f"Yalnızca geçerli JSON formatında StepDecision yanıtı ver."
        )

        response = self.client.models.generate_content(
            model=self.model,
            contents=[image_part, prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.1
            )
        )

        raw_text = response.text or "{}"
        data = json.loads(raw_text)
        return StepDecision.model_validate(data)
