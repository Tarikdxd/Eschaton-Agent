from typing import Optional, Literal
from pydantic import BaseModel, Field
import os
import json
from pathlib import Path

CONFIG_DIR = Path.home() / ".eschaton"
CONFIG_FILE = CONFIG_DIR / "config.json"


class AgentConfig(BaseModel):
    # Provider Settings
    provider: Literal["openai_compatible", "anthropic", "gemini"] = Field(
        default="openai_compatible",
        description="LLM Provider to use (openai_compatible, anthropic, gemini)"
    )
    api_key: str = Field(default="", description="API Key for the provider")
    base_url: Optional[str] = Field(
        default=None, 
        description="Custom Base URL (e.g. https://api.deepseek.com/v1, http://localhost:11434/v1, or OpenRouter)"
    )
    model: str = Field(
        default="gpt-4o",
        description="Model identifier (e.g. gpt-4o, claude-3-7-sonnet-20250219, gemini-2.0-flash, deepseek-chat)"
    )

    # Controller & Vision Settings
    action_delay: float = Field(default=0.5, description="Delay between actions in seconds")
    screenshot_scale: float = Field(default=1.0, description="Scale factor for screenshots before sending to model")
    failsafe: bool = Field(default=True, description="Enable PyAutoGUI mouse corner fail-safe")
    max_steps: int = Field(default=50, description="Maximum iterations before prompting user")
    
    # MCP Settings
    mcp_servers: list[str] = Field(default_factory=list, description="Paths or endpoints to MCP servers")

    @classmethod
    def load(cls) -> "AgentConfig":
        if CONFIG_FILE.exists():
            try:
                with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    return cls(**data)
            except Exception:
                pass
        
        # Check environment variables
        env_provider = os.getenv("ESCHATON_PROVIDER", "openai_compatible")
        env_key = os.getenv("ESCHATON_API_KEY") or os.getenv("OPENAI_API_KEY") or os.getenv("ANTHROPIC_API_KEY") or os.getenv("GEMINI_API_KEY") or ""
        env_base_url = os.getenv("ESCHATON_BASE_URL") or os.getenv("OPENAI_BASE_URL")
        env_model = os.getenv("ESCHATON_MODEL", "gpt-4o")

        return cls(
            provider=env_provider,  # type: ignore
            api_key=env_key,
            base_url=env_base_url,
            model=env_model
        )

    def save(self) -> None:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(self.model_dump(), f, indent=2, ensure_ascii=False)
