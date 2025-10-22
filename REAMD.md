# iterai

## Package Layout
- `iterai-js/`: TypeScript SDK and DAG runtime exported as the `iterai` npm package.
- `iterai-py/`: Python bindings + CLI, published as the Poetry package `iterai`.
- `iterai-plugin/`: Chromium extension (React + Vite) that consumes the JS SDK via `import { IterAI } from "@itera/index"` and stores UI preferences/secrets in Chrome storage.
- `docs/`: Design notes and deep-dives (`docs/DESIGN_v1.md`).

## Installing & Building
- `iterai-js`: `npm install && npm run build` to emit `dist/`. Use `npm run dev` while editing TypeScript.
- `iterai-py`: `poetry install` followed by `poetry run pytest` / `poetry run black iterai tests`.
- `iterai-plugin`:
  1. `cd iterai-plugin && npm install`
  2. `npm run dev` for a hot-reloading options/popup UI (served at http://localhost:5173).
  3. `npm run build` to produce `iterai-plugin/dist/` for loading as an unpacked extension.

## Extension Data Flow
1. Options UI (`src/options`) stores enabled providers, ordering, and default prompts in `chrome.storage.sync`, while provider secrets are persisted in `chrome.storage.local`.
2. The background service worker (`src/background/index.ts`) listens for storage changes, rehydrates its IterAI instance, registers provider metadata (`models.registry`), and mirrors enabled model order into `Config`.
3. Popup UI (`src/popup`) fetches the current pipeline order, pulls the active ChatGPT prompt, and triggers pipeline runs via the background worker.
4. The content script (`src/content/index.ts`) watches ChatGPT and responds to `itera:get-page-prompt` messages with the active textarea value.
5. Background routing forwards prompts to IterAI (`IterAI.createRoot`, `IterAI.refine`) sequentially, resolving per-model API base URLs and keys (OpenAI, Claude, Gemini) before invoking the SDK.

## Secrets & Configuration
- API keys stay in `chrome.storage.local` (device-only). Reset them from the options page; they are never synced or written to git.
- Default system prompt mirrors `DEFAULT_CONFIG.system_prompt_template`. Updates from the extension propagate through `setGlobalConfig` so CLI/SDK users share behavior.
- To add providers, extend `DEFAULT_MODELS` in `iterai-plugin/src/shared/models.ts` and update background key mapping.
- Tunable fields like temperature, top-p, and max output tokens flow through `models.registry` and reach both the JS SDK and Python CLI.

## Next Steps
- Surface run/batch progress and node diffs from the background worker in the popup UI.
- Add automated Vitest coverage for extension logic (storage helpers, pipeline transforms).
- Allow per-provider overrides (temperature, max tokens) from the options UI and flow them through `models.registry`.
