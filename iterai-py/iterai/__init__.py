import logging
from logging import Logger

from .node import Node, ImprovementType
from .types import Step
from .dag import DAG
from .diff import generic_diff, git_diff, compare_plan
from .storage import Storage

__version__ = "0.1.0"

__all__ = [
    "Node",
    "ImprovementType",
    "Step",
    "DAG",
    "IterAI",
    "generic_diff",
    "git_diff",
    "compare_plan",
    "Storage",
    "logger",
    "set_log_level",
]

import asyncio

from .config import get_config
from .dag import DAG
from .llm import generate_output
from .node import Node
from .types import ImprovementType


class IterAI:
    def __init__(self, storage_path: str | None = None):
        self.dag = DAG(storage_path)
        self.config = get_config()

    async def create_root(
        self, user_prompt: str, model: str | None = None, system_prompt: str = ""
    ) -> Node:
        model = model or self.config.get("models.default", "gpt-4o")
        system_prompt = system_prompt or self.config.get("system_prompt_template", "")

        node = Node(
            user_prompt=user_prompt,
            system_prompt=system_prompt,
            model=model,
            improvement_type=ImprovementType.STANDARD,
        )

        self.dag.add_node(node)
        await self.dag._generate_node(node)
        node.save(self.dag.storage.path)
        self.dag._save_graph()

        return node

    async def refine(
        self,
        parent: Node,
        model: str | None = None,
        user_prompt: str = "",
        system_prompt: str = "",
    ) -> Node:
        model = model or self.config.get("models.default", "gpt-4o")
        system_prompt = system_prompt or self.config.get("system_prompt_template", "")

        node = Node(
            user_prompt=user_prompt,
            system_prompt=system_prompt,
            model=model,
            parent_ids=[parent.id],
            improvement_type=ImprovementType.STANDARD,
        )

        self.dag.add_edge(node, parent)
        await self.dag._generate_node(node)
        self.dag._compute_diffs()
        node.save(self.dag.storage.path)
        self.dag._save_graph()

        return node

    async def synthesize(
        self,
        parents: list[Node],
        model: str | None = None,
        user_prompt: str = "Combine the best insights from all versions",
        system_prompt: str = "",
    ) -> Node:
        model = model or self.config.get("models.default", "gpt-4o")
        system_prompt = system_prompt or self.config.get("system_prompt_template", "")

        node = Node(
            user_prompt=user_prompt,
            system_prompt=system_prompt,
            model=model,
            parent_ids=[p.id for p in parents],
            improvement_type=ImprovementType.SYNTHETIC,
        )

        self.dag.add_edge(node, parents)
        await self.dag._generate_node(node)
        self.dag._compute_diffs()
        node.save(self.dag.storage.path)
        self.dag._save_graph()

        return node

    async def evaluate_node(self, node: Node, eval_model: str | None = None):
        eval_model = eval_model or "gpt-4o-mini"
        eval_prompt = f"Rate the following text on a scale from 0 to 1, where 1 is excellent. Respond with only the number.\n\n{node.output}"

        score_text = await generate_output(eval_model, eval_prompt)
        try:
            node.score = float(score_text.strip())
        except ValueError:
            node.score = None

        node.save(self.dag.storage.path)

    async def evaluate_all(self, nodes: list[Node], eval_model: str | None = None):
        max_tasks = self.config.get("concurrency.max_tasks", 8)

        semaphore = asyncio.Semaphore(max_tasks)

        async def eval_with_limit(node):
            async with semaphore:
                await self.evaluate_node(node, eval_model)

        await asyncio.gather(*[eval_with_limit(node) for node in nodes])


# Configure package-wide logging once when the package is imported
_handler = logging.StreamHandler()
_handler.setFormatter(
    logging.Formatter(
        fmt="%(asctime)s [%(levelname)s] %(module)s:%(funcName)s:%(lineno)d - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
)

logger: Logger = logging.getLogger("iterai")
if not logger.handlers:
    logger.addHandler(_handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False


def set_log_level(level: str | int):
    """Set the package logger level.

    Args:
        level: Either a string like 'DEBUG', 'INFO', etc., or an int like logging.DEBUG
    """
    if isinstance(level, str):
        level = getattr(logging, level.upper(), logging.INFO)
    logger.setLevel(level)
