import json
import logging
from pathlib import Path
from uuid import UUID

from .config import get_config

logger = logging.getLogger(__name__)


class Storage:
    def __init__(self, storage_path: str | None = None):
        if storage_path is None:
            storage_path = get_config().get("storage.path", "~/.config/iterai")
        self.path = Path(storage_path).expanduser()
        self.path.mkdir(parents=True, exist_ok=True)
        (self.path / "nodes").mkdir(exist_ok=True)

    def save_graph(self, graph_data: dict):
        graph_file = self.path / "graph.json"
        with open(graph_file, "w") as f:
            json.dump(graph_data, f, indent=2)

    def load_graph(self) -> dict:
        graph_file = self.path / "graph.json"
        if not graph_file.exists():
            return {"nodes": {}, "edges": []}
        with open(graph_file, "r") as f:
            return json.load(f)

    def node_exists(self, node_id: UUID) -> bool:
        return (self.path / "nodes" / str(node_id)).exists()
