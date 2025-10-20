# 🧠 IterAi Design Document

> A local-first, graph-based LLM refinement engine with **transparent planning**, **diff-based evolution**, and **multi-model synthesis**.
> Think of it as *Git for reasoning and idea evolution.*

---

## 🧭 Purpose

IterAi is designed to **make reasoning transparent** — not just the outputs of LLMs, but their **thinking, planning, and refinement process**.

Modern LLM frameworks focus on *outcomes*; IterAI focuses on *provenance* — how an idea evolves across iterations, models, and synthesis stages.

The system provides:
- A **local DAG** of reasoning steps (no cloud, no RDS, no hidden orchestration)
- **Unified diff tracking** between model generations
- **Plan comparison** across models for interpretability
- **Async-first** multi-model execution
- A **transparent, auditable, and reproducible** history of model reasoning

---

## ⚙️ Core Architecture

### 🧩 Conceptual Model

Each node in IterAI represents a **unit of reasoning** — a single model’s response to a `user_prompt` under some `system_prompt`.
Edges connect nodes, forming a **directed acyclic graph (DAG)** representing evolution or synthesis of ideas.

The IterAI runtime handles:
1. Generating a **plan** (a structured outline of the model’s intended reasoning)
2. Generating **output** (based on that plan)
3. Recording **diffs** between nodes (both textual and semantic)
4. Optionally **synthesizing** outputs from multiple nodes into a unified child
5. **Scoring** each node (evaluation or meta-analysis)
6. Persisting everything **locally** for full transparency

---

### 🧠 Node Schema

| Field | Type | Description |
|--------|------|-------------|
| `id` | UUID | Unique node identifier |
| `parent_ids` | list[UUID] | Parent nodes (1→1 for refinement, N→1 for synthesis) |
| `user_prompt` | str | The user’s direct request (“Summarize this”, “Improve this draft”) |
| `system_prompt` | str | The contextual role prompt (configurable; “You are an editor…”) |
| `output` | str | Model’s textual output |
| `plan` | str | Model’s pre-output reasoning plan |
| `model` | str | LLM used for this node |
| `diff` | str | Git-style unified diff (from parent to this node) |
| `score` | float | Optional evaluation metric (0–1) |
| `type` | ImprovementType | `"standard"` or `"synthetic"` |
| `children` | list[UUID] | Child nodes |
| `created_at` | datetime | Timestamp |
| `metadata` | dict | Arbitrary metadata (hyperparams, evaluation notes, etc.) |

---

### 🔀 Improvement Types

```python
from enum import Enum

class ImprovementType(Enum):
    STANDARD = "standard"   # Single-parent refinement (1→1)
    SYNTHETIC = "synthetic" # Multi-parent synthesis (N→1)
```

#### 🟩 Standard Improvements
A single model improving a single parent output.
E.g. “Make this paragraph more concise.”

#### 🟦 Synthetic Improvements
A model merges multiple sibling outputs into a unified one.
E.g. “Combine the best ideas from version A and B.”

---

## 📂 File-Based Persistence

IterAI intentionally avoids RDS or external databases.
Everything is stored in the local filesystem under `~/.config/iterai`.

```
~/.config/iterai/
  ├── graph.json              # DAG metadata (nodes + edges)
  ├── nodes/
  │   ├── {uuid}/
  │   │   ├── output.txt      # Model output
  │   │   ├── plan.txt        # Pre-generation plan
  │   │   ├── diff.patch      # Unified diff from parent(s)
  │   │   └── meta.json       # Model, score, timestamps
  └── config.toml             # User configuration (models, colors, concurrency)
```

### Configuration (`config.toml`)

| Key | Description | Example |
|------|-------------|----------|
| `diff.colorize` | Enable ANSI color diffs | `true` |
| `models.default` | Default LLM | `"gpt-4o"` |
| `concurrency.max_tasks` | Max async tasks | `8` |
| `storage.path` | Custom config directory | `"~/.config/iterai"` |
| `system_prompt_template` | Default role prompt | `"You are an expert editor..."` |

---

## ⚡ Asynchronous Engine

All model interactions are asynchronous using **LiteLLM** for model abstraction.

```python
from litellm import acompletion

async def generate_output(model, user_prompt, system_prompt=""):
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": user_prompt})

    response = await acompletion(model=model, messages=messages)
    return response['choices'][0]['message']['content']
```

Parallel refinement and evaluation tasks run concurrently via `asyncio.gather`.

---

## 🧮 Diff and Comparison System

### `generic_diff(A, B)`
Produces a unified diff for any two text strings.

```python
import difflib

def generic_diff(a: str, b: str) -> str:
    return ''.join(difflib.unified_diff(
        a.splitlines(keepends=True),
        b.splitlines(keepends=True),
        fromfile='A',
        tofile='B'
    ))
```

### `git_diff(A, B, color=True)`
Produces a Git-style colorized diff.

```python
def git_diff(a: str, b: str, color=True):
    diff = generic_diff(a, b)
    if color:
        diff = diff.replace('+', '\033[32m+\033[0m').replace('-', '\033[31m-\033[0m')
    print(diff)
```

### `compare_plan(A, B)`
Compares two models’ **reasoning plans**, not their outputs.

```python
def compare_plan(plan_a: str, plan_b: str) -> str:
    """Compare two reasoning strategies for transparency."""
    return generic_diff(plan_a, plan_b)
```

> This is a key differentiator:
> IterAI doesn’t just compare *what* models say — it compares *how* they intend to reason.*

---

## 🧱 DAG Runtime API

Users typically interact through a high-level `DAG` or `IterAI` API.

### Example Flow

```python
graph = DAG()

root = Node(user_prompt="Update this paragraph", model="openai.GPT5")
graph.add_node(root)

nodeA = Node(system_prompt="You should improve this", model="google.GEMINI")
graph.add_edge(nodeA, parent=root, type=Edge.Standard)

nodeB = Node(system_prompt="You should improve this and be aware of LLM speak",
             model="anthropic.Claude4.5", type=Edge.Standard)
graph.add_edge(nodeB, parent=root, type=Edge.Standard)

nodeC = Node(system_prompt="Summarize all these", model="google.GEMINI", type=Edge.Synthetic)
graph.add_edge(nodeC, parent=[nodeA, nodeB])

await graph.evaluate()  # Run diffs, scoring, persistence

git_diff(graph.result_for(nodeA), graph.result_for(nodeC))
```

In practice, users rarely construct nodes manually; they use a simple runtime interface:

```python
prog = IterAI()
root = await prog.create_root("Summarize this document", "gpt-4o")
refined = await prog.refine(root, "claude-3-opus", "Make it more concise")
synthesis = await prog.synthesize([root, refined], "gemini-2.0", "Combine the best insights")
await prog.evaluate_all([refined, synthesis])
```

---

## 🧠 Planning Transparency

IterAI treats *plans* as first-class citizens — structured descriptions of *how* a model intends to act before producing output.

### Example

```
User Prompt:
"Summarize the pros and cons of electric vehicles."

GPT-4 Plan:
1. Outline main points.
2. Highlight environmental and cost benefits.
3. Discuss battery sourcing challenges.

Claude 3 Plan:
- Begin with context on EV adoption.
- Balance tone between pros/cons.
- Close with forward-looking statement.
```

When compared via `compare_plan(A, B)`, you can see models’ different reasoning styles and heuristics.

This makes IterAI useful not just for *generation*, but for *research on model cognition and interpretability*.

---

## 🔄 Iterative Refinement Cycle

IterAI’s evolution loop alternates between **exploration** and **convergence**.

1. **Exploration (Simple Diffs):**
   - Spawn variants from multiple models.
   - Record their diffs and plans.

2. **Evaluation:**
   - Score each variant via another model or heuristic.

3. **Convergence (Summary Diffs):**
   - Merge top variants into a synthetic node.
   - Record the merge diff and reasoning.

4. **Repeat:**
   - Continue until convergence criteria met (score plateau, quality threshold).

This mirrors an **evolutionary search** pattern:
- Exploration = mutation
- Evaluation = selection
- Synthesis = recombination

---

## 🧩 Evaluation System

Each node can be automatically scored (e.g., 0–1 scale).

```python
async def evaluate(node):
    eval_prompt = f"""
    Rate the following text (0–1):
    {node.output}
    """
    score_text = await generate_output("gpt-4o-mini", eval_prompt)
    node.score = float(score_text.strip()) if score_text.replace('.', '', 1).isdigit() else None
```

Evaluation metrics can combine:
- LLM self-evaluation
- Diff magnitude
- Token length ratio
- Semantic similarity
- Consensus agreement among models

---

## 🧠 Design Principles

| Principle | Description |
|------------|--------------|
| **Local-first** | Everything runs locally under `~/.config/iterai`; no database dependencies |
| **Transparent** | Every prompt, plan, diff, and evaluation is inspectable |
| **Composable** | Any model, any provider (via LiteLLM) |
| **Async-native** | Fully concurrent generation, evaluation, and diffing |
| **Deterministic** | Caching and reproducible runs supported |
| **Auditable** | Reconstruct reasoning trees and verify evolution history |

---

## 🧰 CLI (Future)

The CLI will provide a Git-like interface:

| Command | Description |
|----------|--------------|
| `iterai new` | Create a root node |
| `iterai refine` | Create a new refinement |
| `iterai synthesize` | Merge multiple nodes |
| `iterai eval` | Evaluate nodes |
| `iterai diff` | Compare outputs or plans |
| `iterai log` | Show reasoning lineage |
| `iterai visualize` | Render DAG graphically |

---

## 📊 Future Directions

- [ ] Rich TUI (text-based UI for reviewing diffs)
- [ ] Semantic diff summaries via LLMs
- [ ] Cross-model reasoning analytics
- [ ] Web-based DAG visualization (Cytoscape.js)
- [ ] Plan quality scoring
- [ ] Collaborative graph merging
- [ ] “Reasoning Time Machine” for replaying node evolution

---

## 🧩 Summary

| Component | Description |
|------------|--------------|
| **Storage** | Local file-based DAG in `~/.config/iterai` |
| **Execution** | Async with LiteLLM |
| **Diffing** | Git-style text diffs + optional color |
| **Node Types** | `Standard` (1→1) and `Synthetic` (N→1) |
| **Planning** | Models generate and store reasoning plans |
| **Comparison** | `compare_plan(A, B)` for cross-model transparency |
| **Evaluation** | Automated scoring and analysis |
| **UX** | Abstracted DAG API for simple workflows |

---

> “IterAI doesn’t just track what models say —
> it tracks how they think, plan, and evolve.”
