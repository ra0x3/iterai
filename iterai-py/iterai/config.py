import os
import logging
from pathlib import Path
import toml


DEFAULT_CONFIG = {
    "diff": {
        "colorize": True,
        "plan_comparison": "simple",  # "simple" or "llm"
    },
    "models": {
        "default": "gpt-4o",
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


class Config:
    def __init__(self, config_path: str | None = None):

        self.config_path = config_path or os.path.expanduser(
            "~/.config/iterai/config.toml"
        )
        self.data = self._load()

    def _load(self):
        path = Path(self.config_path)
        if path.exists():
            return toml.load(path)
        return DEFAULT_CONFIG.copy()

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
