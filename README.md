[![GitHub](https://img.shields.io/badge/github-ra0x3%2Fiterai-181717?logo=github)](https://github.com/ra0x3/iterai)
[![Stars](https://img.shields.io/github/stars/ra0x3/iterai?style=flat&logo=github)](https://github.com/ra0x3/iterai/stargazers)
[![Issues](https://img.shields.io/github/issues/ra0x3/iterai?style=flat)](https://github.com/ra0x3/iterai/issues)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat)](https://github.com/ra0x3/iterai/issues/new/choose)

# iterai

Local-first LLM refinement that keeps the entire reasoning graph on your machine, with shared TypeScript + Python runtimes and a browser companion plugin.

## Background
IterAI treats every model interaction as a node in a transparent, diffable DAG so you can track how ideas change across prompts, models, and synthesis passes. The TypeScript engine powers the DAG, diffing, and LiteLLM routing; the Python package wraps the same primitives for notebook, script, or CLI workflows; and a browser plugin exposes the engine inside ChatGPT-like UIs.

- **Transparent provenance** – each node records plan, output, diff, score, and metadata under `~/.config/iterai` for reproducible audits.
- **Multi-model orchestration** – route OpenAI, Anthropic, and Google models through a shared registry with per-model overrides.
- **Iterative + synthetic workflows** – refine a single chain or synthesize multiple branches to compare strategies side-by-side.
- **Language parity** – shared schemas and configs ensure that TypeScript, Python, and extension users see the same defaults.
- **Deep dives available** – start with `docs/DESIGN_v1.md` for architecture, storage, and roadmap context.

## Usage
### JavaScript SDK (`iterai-js`)
- Install in your project: `npm install iterai` (or add the local `iterai-js` workspace while developing).
- Configure credentials and registry via the provided `Config` before instantiating the runtime.
- The SDK persists graph state under `~/.config/iterai` by default; override `storagePath` when constructing `IterAI` if desired.

```ts
import { Config, IterAI, setGlobalConfig } from "iterai";

const config = new Config();
config.set("api.openai_key", process.env.OPENAI_API_KEY ?? "");
config.set("models.registry.gpt-4o.provider", "openai");
setGlobalConfig(config);

async function main() {
  const iterai = new IterAI();
  const root = await iterai.createRoot("Draft a product vision statement");
  const refined = await iterai.refine(root, undefined, "Tighten it to 120 words");

  console.log(refined.output);
}

main().catch(console.error);
```

### Python SDK & CLI (`iterai-py`)
- Install with `pip install iterai` (or run `poetry install` inside `iterai-py/` when hacking on the repo).
- API keys and model registry entries are read from `~/.config/iterai/config.toml`; edit that file or use environment-specific overrides.
- The async-first API mirrors the TypeScript surface area, making it easy to script refinements or synthesize branches.

```python
import asyncio
from iterai import IterAI

async def main() -> None:
    iterai = IterAI()
    root = await iterai.create_root("Draft a product vision statement")
    refined = await iterai.refine(root, user_prompt="Tighten it to 120 words")
    print(refined.output)

asyncio.run(main())
```

Run CLI helpers with `poetry run iterai --help` once the virtualenv is bootstrapped.

### Browser Plugin (`iterai-plugin`)
- Bootstrap: `cd iterai-plugin && npm install`.
- Development build: `npm run dev` to serve the React UI at `http://localhost:5173` while you iterate.
- Load into Chromium: `npm run build`, then add the generated `iterai-plugin/dist/` directory as an unpacked extension.
- The options page manages provider ordering and secrets (stored in `chrome.storage`), while the popup triggers DAG runs through the background worker powered by the JS SDK.

## Development
### Repository layout
- `iterai-js/` – TypeScript engine, exported via `iterai` npm package.
- `iterai-py/` – Python bindings, async CLI, and shared schemas.
- `iterai-plugin/` – Chromium extension consuming the JS SDK.
- `docs/` – architecture, storage, and design notes (keep `DESIGN_v1.md` aligned with behavioral changes).

### Environment setup
- JavaScript: `cd iterai-js && npm install && npm run build` (or `npm run dev` for watch mode).
- Python: `cd iterai-py && poetry install` to create the managed virtualenv.
- Plugin: `cd iterai-plugin && npm install` followed by `npm run dev` or `npm run build`.

### Testing & quality
- JavaScript SDK: `cd iterai-js && npm run lint && npm run test`.
- Python package: `cd iterai-py && poetry run pytest` and `poetry run black iterai tests`.
- Keep fixtures deterministic and mirror scenarios across TypeScript and Python when adding new graph behaviors.

### Documentation & contribution flow
- Update shared configuration tables and behavioral notes in both SDKs when adding registry fields or config knobs.
- Refresh `docs/DESIGN_v1.md` and relevant README sections when defaults or storage flows change.
- Follow commit conventions (`type: short-description`), bundle cross-language changes in one PR, and link test output (`npm run test`, `poetry run pytest`) before requesting review.
