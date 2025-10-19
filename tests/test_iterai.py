import asyncio
import pytest

from iterai import __version__, IterAI
from iterai.config import Config, DEFAULT_CONFIG
from iterai.diff import generic_diff, compare_plan
from iterai.node import Node
from iterai.storage import Storage
from iterai.dag import DAG
from iterai.types import ImprovementType


def test_version_present():
    assert isinstance(__version__, str) and len(__version__) > 0


def test_config_defaults(tmp_path):
    cfg = Config(config_path=str(tmp_path / "config.toml"))
    assert cfg.get("models.default") == DEFAULT_CONFIG["models"]["default"]
    assert cfg.get("storage.path") == DEFAULT_CONFIG["storage"]["path"]
    cfg.save()
    assert (tmp_path / "config.toml").exists()


def test_generic_diff_simple():
    a = "hello\n"
    b = "hello\nworld\n"
    diff = generic_diff(a, b)
    assert "+world" in diff
    assert "--- A" in diff or "+++ B" in diff


def test_compare_plan_non_empty():
    assert isinstance(compare_plan("plan a", "plan b"), str)


def test_node_save_and_load(tmp_path):
    node = Node(
        user_prompt="u",
        system_prompt="s",
        model="m",
        improvement_type=ImprovementType.STANDARD,
    )
    node.output = "out"
    node.plan = "plan"
    node.diff = "diff"
    node.score = 0.75
    node.metadata = {"k": "v"}

    node.save(tmp_path)
    loaded = Node.load(node.id, tmp_path)

    assert loaded.id == node.id
    assert loaded.output == "out"
    assert loaded.plan == "plan"
    assert loaded.type == node.type
    assert loaded.metadata == {"k": "v"}


def test_storage_graph_and_node_exists(tmp_path):
    storage = Storage(str(tmp_path))
    graph = {"nodes": {}, "edges": []}
    storage.save_graph(graph)
    assert storage.load_graph() == graph

    node = Node(user_prompt="x")
    node.save(storage.path)
    assert storage.node_exists(node.id)


@pytest.mark.asyncio
async def test_dag_plan_and_output_generation(tmp_path):
    dag = DAG(str(tmp_path))

    node = Node(user_prompt="Write a one-sentence greeting.", model="gpt-4o-mini")
    dag.add_node(node)
    await dag._generate_node(node)

    assert isinstance(node.plan, str) and len(node.plan) > 0
    assert isinstance(node.output, str) and len(node.output) > 0
    assert node.plan != node.output


@pytest.mark.asyncio
async def test_dag_standard_edge_and_diff(tmp_path):
    dag = DAG(str(tmp_path))

    parent = Node(user_prompt="Say hello.", model="gpt-4o-mini")
    dag.add_node(parent)
    await dag._generate_node(parent)

    child = Node(
        user_prompt="Make it more enthusiastic.",
        parent_ids=[parent.id],
        model="gpt-4o-mini",
    )
    dag.add_edge(child, parent)
    await dag._generate_node(child)

    dag._compute_diffs()

    assert child.type == ImprovementType.STANDARD
    assert parent.id in child.parent_ids
    assert child.id in parent.children
    assert isinstance(child.diff, str)
    assert len(child.diff) > 0


@pytest.mark.asyncio
async def test_dag_synthetic_edge_and_diff(tmp_path):
    dag = DAG(str(tmp_path))

    p1 = Node(user_prompt="Write a tagline about speed.", model="gpt-4o-mini")
    p2 = Node(user_prompt="Write a tagline about reliability.", model="gpt-4o-mini")
    dag.add_node(p1)
    dag.add_node(p2)
    await dag._generate_node(p1)
    await dag._generate_node(p2)

    synth = Node(user_prompt="Combine the best of both.", model="gpt-4o-mini")
    dag.add_edge(synth, [p1, p2])
    await dag._generate_node(synth)

    dag._compute_diffs()

    assert synth.type == ImprovementType.SYNTHETIC
    assert set(synth.parent_ids) == {p1.id, p2.id}
    assert synth.id in p1.children and synth.id in p2.children
    assert isinstance(synth.diff, str) and len(synth.diff) > 0


@pytest.mark.asyncio
async def test_graph_persistence_and_reload(tmp_path):
    dag = DAG(str(tmp_path))

    parent = Node(user_prompt="A.", model="gpt-4o-mini")
    dag.add_node(parent)
    await dag._generate_node(parent)

    child = Node(user_prompt="B.", model="gpt-4o-mini")
    dag.add_edge(child, parent)
    await dag._generate_node(child)

    dag._compute_diffs()
    dag._persist_all()

    # Reload a new DAG from the same storage and verify graph integrity
    dag2 = DAG(str(tmp_path))
    p2 = dag2.get_node(parent.id)
    c2 = dag2.get_node(child.id)

    assert p2 is not None and c2 is not None
    assert c2.id in p2.children
    assert p2.id in c2.parent_ids


@pytest.mark.asyncio
async def test_iterai_end_to_end_standard_and_synthetic(tmp_path):
    it = IterAI(storage_path=str(tmp_path))

    # Create two independent roots
    r1 = await it.create_root(
        "Write a playful sentence about speed.", model="gpt-4o-mini"
    )
    r2 = await it.create_root(
        "Write a reassuring sentence about reliability.", model="gpt-4o-mini"
    )

    assert isinstance(r1.plan, str) and len(r1.plan) > 0
    assert isinstance(r1.output, str) and len(r1.output) > 0

    # Refine r1 (standard)
    refined = await it.refine(
        r1, model="gpt-4o-mini", user_prompt="Make it more concise."
    )
    assert refined.type == ImprovementType.STANDARD
    assert refined.parent_ids == [r1.id]
    assert isinstance(refined.diff, str)

    # Synthesize r1 and r2 (synthetic)
    synth = await it.synthesize(
        [r1, r2], model="gpt-4o-mini", user_prompt="Combine both ideas elegantly."
    )
    assert synth.type == ImprovementType.SYNTHETIC
    assert set(synth.parent_ids) == {r1.id, r2.id}
    assert isinstance(synth.diff, str)
