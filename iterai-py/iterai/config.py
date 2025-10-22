import os
import logging
from copy import deepcopy
from pathlib import Path
import toml

DEFAULT_MODEL_REGISTRY = {
    "gpt-4o": {
        "provider": "openai",
        "options": {
            "temperature": 0.2,
            "topP": 0.9,
            "maxTokens": 2048,
        },
    },
    "gpt-4": {
        "provider": "openai",
        "options": {
            "temperature": 0.2,
            "topP": 0.9,
            "maxTokens": 2048,
        },
    },
    "claude-3-5-sonnet-20240620": {
        "provider": "anthropic",
        "baseUrl": "https://api.anthropic.com/v1",
        "options": {
            "temperature": 0.3,
            "topP": 0.95,
            "maxOutputTokens": 2048,
        },
    },
    "gemini-1.5-pro": {
        "provider": "google",
        "baseUrl": "https://generativelanguage.googleapis.com/v1beta/models",
        "options": {
            "temperature": 0.4,
            "topP": 0.9,
            "maxOutputTokens": 2048,
        },
    },
}

DEFAULT_CONFIG = {
    "diff": {
        "colorize": True,
        "plan_comparison": "simple",  # "simple" or "llm"
    },
    "models": {
        "default": "gpt-4o",
        "registry": DEFAULT_MODEL_REGISTRY,
    },
    "concurrency": {
        "max_tasks": 8,
    },
    "storage": {
        "path": "~/.config/iterai",
    },
    "system_prompt_template": "You are an expert editor...",
}

logger = logging.getLogger(__name__)


def _deep_merge(base: dict, overrides: dict) -> dict:
    for key, value in overrides.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            base[key] = _deep_merge(base[key], value)
        else:
            base[key] = value
    return base


class Config:
    def __init__(self, config_path: str | None = None):
        self.config_path = config_path or os.path.expanduser(
            "~/.config/iterai/config.toml"
        )
        self.data = self._load()

    def _load(self):
        path = Path(self.config_path)
        data = deepcopy(DEFAULT_CONFIG)
        if path.exists():
            user_data = toml.load(path)
            data = _deep_merge(data, user_data)
        return data

    def get(self, key: str, default=None):
        keys = key.split(".")
        value = self.data
        for k in keys:
            if isinstance(value, dict):
                value = value.get(k)
            else:
                return default
        return value if value is not None else default

    def save(self):
        path = Path(self.config_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            toml.dump(self.data, f)


_global_config = None


def get_config():
    global _global_config
    if _global_config is None:
        _global_config = Config()
    return _global_config
