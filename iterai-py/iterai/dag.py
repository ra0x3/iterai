import asyncio
from pathlib import Path
from uuid import UUID

import logging
from .config import get_config
from .diff import generic_diff
from .llm import generate_output, generate_plan, generate_steps
from .node import Node
from .storage import Storage
from .types import ImprovementType


logger = logging.getLogger(__name__)


class DAG:
    def __init__(self, storage_path: str | None = None):
        self.nodes = {}
        self.storage = Storage(storage_path)
        self._load_graph()

    def _load_graph(self):
        graph_data = self.storage.load_graph()
        for node_id_str, node_data in graph_data.get("nodes", {}).items():
            node_id = UUID(node_id_str)
            if self.storage.node_exists(node_id):
                self.nodes[node_id] = Node.load(node_id, self.storage.path)

    def _save_graph(self):
        graph_data = {
            "nodes": {str(nid): node.to_dict() for nid, node in self.nodes.items()},
            "edges": [
                {"from": str(pid), "to": str(nid)}
                for nid, node in self.nodes.items()
                for pid in node.parent_ids
            ],
        }
        self.storage.save_graph(graph_data)

    def add_node(self, node: Node):
        self.nodes[node.id] = node
        for parent_id in node.parent_ids:
            if parent_id in self.nodes:
                if node.id not in self.nodes[parent_id].children:
                    self.nodes[parent_id].children.append(node.id)

    def add_edge(self, child: Node, parent: Node | list[Node]):
        parents = parent if isinstance(parent, list) else [parent]

        child.parent_ids = [p.id for p in parents]
        if len(parents) > 1:
            child.type = ImprovementType.SYNTHETIC

        self.add_node(child)

        for p in parents:
            if child.id not in p.children:
                p.children.append(child.id)

    def get_node(self, node_id: UUID) -> Node | None:
        return self.nodes.get(node_id)

    def result_for(self, node: Node) -> str:
        return node.output

    async def evaluate(self):
        tasks = []
        for node in self.nodes.values():
            if not node.output and node.user_prompt:
                tasks.append(self._generate_node(node))

        if tasks:
            await asyncio.gather(*tasks)

        self._compute_diffs()
        self._persist_all()

    async def _generate_node(self, node: Node):
        config = get_config()
        model = node.model or config.get("models.default", "gpt-4o")
        system_prompt = node.system_prompt or config.get("system_prompt_template", "")

        plan_text = await generate_plan(model, node.user_prompt, system_prompt)
        steps = await generate_steps(model, plan_text, system_prompt)
        node.plan = steps

        full_prompt = node.user_prompt
        if node.parent_ids:
            parent_outputs = [
                self.nodes[pid].output for pid in node.parent_ids if pid in self.nodes
            ]
            if parent_outputs:
                full_prompt = f"Previous version(s):\n\n" + "\n\n---\n\n".join(
                    parent_outputs
                )
                full_prompt += f"\n\nTask: {node.user_prompt}"

        node.output = await generate_output(model, full_prompt, system_prompt)
        node.model = model

    def _compute_diffs(self):
        for node in self.nodes.values():
            if node.parent_ids:
                if len(node.parent_ids) == 1:
                    parent = self.nodes.get(node.parent_ids[0])
                    if parent:
                        node.diff = generic_diff(parent.output, node.output)
                else:
                    combined_parent = "\n\n---\n\n".join(
                        self.nodes[pid].output
                        for pid in node.parent_ids
                        if pid in self.nodes
                    )
                    node.diff = generic_diff(combined_parent, node.output)

    def _persist_all(self):
        for node in self.nodes.values():
            node.save(self.storage.path)
        self._save_graph()
