from eschaton.config import AgentConfig
from eschaton.providers.base import BaseLLMProvider
from eschaton.providers.openai_provider import OpenAICompatibleProvider
from eschaton.providers.anthropic_provider import AnthropicProvider
from eschaton.providers.gemini_provider import GeminiProvider


def get_provider(config: AgentConfig) -> BaseLLMProvider:
    """Factory to initialize configured LLM provider."""
    if config.provider == "anthropic":
        return AnthropicProvider(
            api_key=config.api_key,
            model=config.model,
            base_url=config.base_url
        )
    elif config.provider == "gemini":
        return GeminiProvider(
            api_key=config.api_key,
            model=config.model,
            base_url=config.base_url
        )
    else:
        # Default: openai_compatible (works with DeepSeek, OpenAI, Groq, Ollama, OpenRouter, etc.)
        return OpenAICompatibleProvider(
            api_key=config.api_key,
            model=config.model,
            base_url=config.base_url
        )
