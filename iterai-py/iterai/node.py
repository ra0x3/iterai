import json
import logging
from datetime import datetime
from pathlib import Path
from uuid import UUID, uuid4

from typing import List

from .types import ImprovementType, Step
from .diff import generic_diff

logger = logging.getLogger(__name__)


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
        self.plan: List[Step] = []
        self.model = model
        self.diff = ""
        self.score = None
        self.type = improvement_type
        self.children = []
        self.created_at = datetime.now()
        self.metadata = {}
        self._steps: list[Step] | None = None

    def to_dict(self):
        return {
            "id": str(self.id),
            "parent_ids": [str(pid) for pid in self.parent_ids],
            "user_prompt": self.user_prompt,
            "system_prompt": self.system_prompt,
            "output": self.output,
            "plan": [s.to_dict() for s in self.plan],
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
        plan_data = data.get("plan") or []
        node.plan = [Step.from_dict(sd) for sd in plan_data]
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
        # Persist plan as JSON (always a list of steps)
        (node_dir / "plan.json").write_text(
            json.dumps([s.to_dict() for s in self.plan], indent=2)
        )
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
            "plan": [s.to_dict() for s in self.plan],
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
        # Load plan from JSON (list of steps)
        plan_json_file = node_dir / "plan.json"
        if plan_json_file.exists():
            try:
                steps_data = json.loads(plan_json_file.read_text())
                node.plan = [Step.from_dict(sd) for sd in steps_data]
            except Exception:
                node.plan = []
        else:
            # Fallback to meta if present
            meta_plan = meta.get("plan") or []
            try:
                node.plan = [Step.from_dict(sd) for sd in meta_plan]
            except Exception:
                node.plan = []
        node.diff = (node_dir / "diff.patch").read_text()
        node.score = meta["score"]
        node.children = [UUID(cid) for cid in meta["children"]]
        node.created_at = datetime.fromisoformat(meta["created_at"])
        node.metadata = meta["metadata"]

        # Load steps.json if present (preferred), else fallback to meta
        steps_file = node_dir / "steps.json"
        if steps_file.exists():
            try:
                steps_data = json.loads(steps_file.read_text())
                node._steps = [Step.from_dict(sd) for sd in steps_data]
            except Exception:
                node._steps = None
        else:
            try:
                steps_data = meta.get("steps") or []
                node._steps = [Step.from_dict(sd) for sd in steps_data]
            except Exception:
                node._steps = None

        return node

    def steps(self) -> List[Step]:
        """Return the planned steps for this node (always a list of Step)."""
        return self.plan

    def diff_plan(self, other: "Node", mode: str = "simple") -> str:
        """Compare this node's plan with another node's plan.

        Args:
            other: Another Node to compare against
            mode: "simple" for text-based diff, "llm" for semantic LLM comparison

        Returns:
            A diff string showing differences between plans
        """
        if mode == "llm":
            # Lazy import to avoid circular dependency
            from .llm import compare_plans_llm
            import asyncio

            loop = asyncio.get_event_loop()
            if loop.is_running():
                raise RuntimeError(
                    "diff_plan with mode='llm' cannot be called from within async context. "
                    "Use await compare_plans_llm() directly instead."
                )
            return loop.run_until_complete(compare_plans_llm(self.plan, other.plan))
        else:
            # Simple text-based diff
            self_text = "\n".join(f"{s.order}. {s.text}" for s in self.plan)
            other_text = "\n".join(f"{s.order}. {s.text}" for s in other.plan)
            return generic_diff(self_text, other_text)

    async def diff_plan_async(self, other: "Node", mode: str = "simple") -> str:
        """Async version of diff_plan for use within async contexts.

        Args:
            other: Another Node to compare against
            mode: "simple" for text-based diff, "llm" for semantic LLM comparison

        Returns:
            A diff string showing differences between plans
        """
        if mode == "llm":
            from .llm import compare_plans_llm

            return await compare_plans_llm(self.plan, other.plan)
        else:
            self_text = "\n".join(f"{s.order}. {s.text}" for s in self.plan)
            other_text = "\n".join(f"{s.order}. {s.text}" for s in other.plan)
            return generic_diff(self_text, other_text)
