![IterAI logo](public/img/logo-with-text.png)

# IterAI Plugin

Chromium extension that configures IterAI model pipelines and connects browser prompts to the local refinement DAG.

## Getting Started

```bash
cd iterai-plugin
npm install
npm run dev
```

- Visit `chrome://extensions`, enable **Developer mode**, then **Load unpacked** and point to `iterai-plugin/dist` after running `npm run build`.
- The options page lets you toggle providers, drag to reorder them, and paste API keys. Order is synced across devices via `chrome.storage.sync`, while secrets stay local in `chrome.storage.local`.
- Expand a provider row to adjust temperature, top-p, and max output tokens before saving the pipeline.
- The popup pulls the active ChatGPT prompt, lets you tweak the system prompt, and runs the configured models sequentially—OpenAI, Anthropic Claude, Google Gemini, or any custom entry you add to the registry.

## Code Structure

- `src/options/`: React UI for model management, powered by `@dnd-kit` for drag-and-drop reordering.
- `src/shared/`: Shared model definitions and storage helpers used by options, popup, and background.
- `src/background/index.ts`: Service worker that hydrates `IterAI`, registers provider metadata (`models.registry`), injects API keys, and responds to runtime messages (`itera:run-pipeline`, `itera:create-root`, `itera:refine`).
- `src/content/index.ts`: Content script scoped to `https://chat.openai.com/*`; exposes the active prompt via `itera:get-page-prompt` messages.
- `src/popup/`: UI that displays the ordered pipeline, pulls prompts from the page, and triggers background runs.

## Provider Notes

- OpenAI keys use the standard `https://api.openai.com/v1` REST interface.
- Anthropic calls target `https://api.anthropic.com/v1/messages` with the `anthropic-version: 2023-06-01` header.
- Google Gemini calls hit `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key=...` and require a browser-safe API key.
- Additional providers can be added by extending `DEFAULT_MODELS` in `src/shared/models.ts` and ensuring the background registry includes the correct base URL and options (e.g., `maxOutputTokens`).

## Roadmap

- Surface run progress and node diffs in the popup UI.
- Allow per-provider overrides (temperature, max tokens) from the options page.
- Persist execution history inside extension storage and surface DAG snapshots for quick inspection.
