import json
from datetime import datetime
from pathlib import Path
from uuid import UUID, uuid4

from .types import ImprovementType


class Node:
    def __init__(
        self,
        user_prompt: str = "",
        system_prompt: str = "",
        model: str = "",
        parent_ids: list[UUID] | None = None,
        improvement_type: ImprovementType = ImprovementType.STANDARD,
        node_id: UUID | None = None,
    ):
        self.id = node_id or uuid4()
        self.parent_ids = parent_ids or []
        self.user_prompt = user_prompt
        self.system_prompt = system_prompt
        self.output = ""
        self.plan = ""
        self.model = model
        self.diff = ""
        self.score = None
        self.type = improvement_type
        self.children = []
        self.created_at = datetime.now()
        self.metadata = {}

    def to_dict(self):
        return {
            "id": str(self.id),
            "parent_ids": [str(pid) for pid in self.parent_ids],
            "user_prompt": self.user_prompt,
            "system_prompt": self.system_prompt,
            "output": self.output,
            "plan": self.plan,
            "model": self.model,
            "diff": self.diff,
            "score": self.score,
            "type": self.type.value,
            "children": [str(cid) for cid in self.children],
            "created_at": self.created_at.isoformat(),
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: dict):
        node = cls(
            user_prompt=data["user_prompt"],
            system_prompt=data["system_prompt"],
            model=data["model"],
            parent_ids=[UUID(pid) for pid in data["parent_ids"]],
            improvement_type=ImprovementType(data["type"]),
            node_id=UUID(data["id"]),
        )
        node.output = data["output"]
        node.plan = data["plan"]
        node.diff = data["diff"]
        node.score = data["score"]
        node.children = [UUID(cid) for cid in data["children"]]
        node.created_at = datetime.fromisoformat(data["created_at"])
        node.metadata = data["metadata"]
        return node

    def save(self, storage_path: Path):
        node_dir = storage_path / "nodes" / str(self.id)
        node_dir.mkdir(parents=True, exist_ok=True)

        (node_dir / "output.txt").write_text(self.output)
        (node_dir / "plan.txt").write_text(self.plan)
        (node_dir / "diff.patch").write_text(self.diff)

        meta = {
            "id": str(self.id),
            "parent_ids": [str(pid) for pid in self.parent_ids],
            "user_prompt": self.user_prompt,
            "system_prompt": self.system_prompt,
            "model": self.model,
            "score": self.score,
            "type": self.type.value,
            "children": [str(cid) for cid in self.children],
            "created_at": self.created_at.isoformat(),
            "metadata": self.metadata,
        }
        (node_dir / "meta.json").write_text(json.dumps(meta, indent=2))

    @classmethod
    def load(cls, node_id: UUID, storage_path: Path):
        node_dir = storage_path / "nodes" / str(node_id)

        meta = json.loads((node_dir / "meta.json").read_text())

        node = cls(
            user_prompt=meta["user_prompt"],
            system_prompt=meta["system_prompt"],
            model=meta["model"],
            parent_ids=[UUID(pid) for pid in meta["parent_ids"]],
            improvement_type=ImprovementType(meta["type"]),
            node_id=UUID(meta["id"]),
        )

        node.output = (node_dir / "output.txt").read_text()
        node.plan = (node_dir / "plan.txt").read_text()
        node.diff = (node_dir / "diff.patch").read_text()
        node.score = meta["score"]
        node.children = [UUID(cid) for cid in meta["children"]]
        node.created_at = datetime.fromisoformat(meta["created_at"])
        node.metadata = meta["metadata"]

        return node
