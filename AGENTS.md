# Repository Guidelines

## Project Structure & Module Organization
- `iterai-js/`: TypeScript engine; `src/` hosts DAG, diff, LLM, and config modules, `tests/` contains Vitest suites, `dist/` is build output.
- `iterai-py/`: Python bindings and CLI; core code mirrors the TS modules under `iterai/`, with tests in `tests/` and distributable artifacts in `dist/`.
- `docs/`: Long-form architecture notes (start with `docs/DESIGN_v1.md`) that should be kept in sync with code-level changes.

## Build, Test, and Development Commands
- `cd iterai-js && npm install && npm run build`: install dependencies and emit compiled JS to `dist/`.
- `cd iterai-js && npm run dev`: TypeScript incremental build/watch loop for live development.
- `cd iterai-js && npm run lint` / `npm run format`: enforce ESLint + Prettier standards on `src/**/*.ts`.
- `cd iterai-js && npm run test`: execute the Vitest suite.
- `cd iterai-py && poetry install`: resolve Python dependencies into the managed virtualenv.
- `cd iterai-py && poetry run pytest`: run the async-aware pytest suite.
- `cd iterai-py && poetry run black iterai tests`: apply formatting before committing.

## Coding Style & Naming Conventions
- TypeScript: ES modules, 2-space indent, PascalCase classes (`Node`), camelCase functions (`genericDiff`), and barrel exports via `src/index.ts`.
- Python: Black-enforced 88-column width, 4-space indent, snake_case modules (`storage.py`) and functions, PascalCase classes, and shared enums (`ImprovementType`).
- Keep shared data structures synchronized across languages; update both SDKs when adding new DAG fields or config knobs.

## Testing Guidelines
- JavaScript tests live in `iterai-js/tests` and follow the `*.test.ts` pattern with Vitest assertions.
- Python tests live in `iterai-py/tests`; mirror JS scenarios when adding new graph behaviors or storage flows.
- Prefer deterministic prompts/fixtures and include async coverage where nodes interact with LiteLLM stubs.

## Commit & Pull Request Guidelines
- Use `type: short-description` commit prefixes (e.g. `enhancement: add iterai-js + iterai-py`) and keep subject lines in the imperative mood.
- Bundle related cross-language changes into one PR, describe the behavioral impact, and call out config or storage migrations explicitly.
- Link tracking issues, note test coverage (`npm run test`, `poetry run pytest`), and attach CLI output or screenshots when touching user-facing commands.

## Configuration Notes
- Runtime state persists under `~/.config/iterai`; never commit artifacts from this directory.
- Document new configuration keys in both SDKs and refresh `docs/DESIGN_v1.md` when defaults or behaviors shift.
- Multi-provider routing is driven by `models.registry` in the JS config; ensure new models include `provider`, optional `baseUrl`, and any `options` (e.g., `maxOutputTokens`).
