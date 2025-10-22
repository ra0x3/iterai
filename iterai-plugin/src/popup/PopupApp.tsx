import { useEffect, useMemo, useState } from "react";
import { loadSettings } from "../shared/storage";
import "../options/styles.css";

interface BackgroundResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

interface RunPipelineResult {
  nodes: Array<{
    id: string;
    model: string;
    output: string;
    parent_ids: string[];
    metadata?: { provider?: string };
  }>;
}

const PROVIDER_LABEL: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  custom: "Custom",
};

function hasChromeApi(): boolean {
  return typeof chrome !== "undefined" && !!chrome.runtime;
}

async function queryActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  if (!hasChromeApi() || !chrome.tabs?.query) return undefined;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function fetchPromptFromPage(): Promise<string> {
  const tab = await queryActiveTab();
  if (!tab?.id || !chrome.tabs?.sendMessage) return "";
  try {
    const response = await chrome.tabs.sendMessage<{ prompt?: string }>(tab.id, {
      type: "itera:get-page-prompt",
    });
    return response?.prompt ?? "";
  } catch (error) {
    console.warn("Unable to read prompt from page", error);
    return "";
  }
}

async function sendBackgroundMessage<T>(
  message: Record<string, unknown>,
): Promise<T> {
  if (!hasChromeApi()) {
    throw new Error("Chrome runtime API unavailable outside extension context");
  }
  return new Promise<T>((resolve, reject) => {
    chrome.runtime.sendMessage<BackgroundResponse<T>>(message, (response) => {
      if (!response) {
        reject(new Error(chrome.runtime.lastError?.message ?? "No response"));
        return;
      }
      if (response.ok) {
        resolve(response.data as T);
      } else {
        reject(new Error(response.error ?? "Unknown error"));
      }
    });
  });
}

export function PopupApp(): JSX.Element {
  const [activeModels, setActiveModels] = useState<string[]>([]);
  const [systemPrompt, setSystemPrompt] = useState("You are an expert editor...");
  const [prompt, setPrompt] = useState("");
  const [isLoading, setLoading] = useState(true);
  const [isRunning, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<RunPipelineResult["nodes"]>([]);

  useEffect(() => {
    async function hydrate() {
      const settings = await loadSettings();
      const enabled = settings.models
        .filter((model) => model.enabled)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setActiveModels(enabled.map((model) => model.label));
      setSystemPrompt(settings.defaultSystemPrompt);
      setLoading(false);

      const pagePrompt = await fetchPromptFromPage();
      if (pagePrompt) {
        setPrompt(pagePrompt);
      }
    }
    hydrate();
  }, []);

  const canRun = useMemo(() => {
    return !isRunning && !isLoading && activeModels.length > 0 && prompt.trim().length > 0;
  }, [activeModels.length, isLoading, isRunning, prompt]);

  const handleRefreshPrompt = async () => {
    const pagePrompt = await fetchPromptFromPage();
    setPrompt(pagePrompt);
  };

  const handleRunPipeline = async () => {
    setRunning(true);
    setError(null);
    setResults([]);
    try {
      const data = await sendBackgroundMessage<RunPipelineResult>({
        type: "itera:run-pipeline",
        userPrompt: prompt,
        systemPrompt,
      });
      setResults(data.nodes);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  const handleOpenOptions = () => {
    if (hasChromeApi() && chrome.runtime?.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open("/options.html", "_blank");
    }
  };

  return (
    <div className="popup">
      <header>
        <h2>Itera Pipeline</h2>
        <p className="muted">
          {isLoading
            ? "Loading settings…"
            : activeModels.length > 0
            ? `${activeModels.length} model${activeModels.length === 1 ? "" : "s"} ready`
            : "Enable models from the options page to begin"}
        </p>
      </header>

      <section className="form-field">
        <label htmlFor="itera-prompt">Prompt</label>
        <textarea
          id="itera-prompt"
          rows={4}
          value={prompt}
          placeholder="Read prompt from ChatGPT or paste manually"
          onChange={(event) => setPrompt(event.target.value)}
        />
        <div className="button-row">
          <button type="button" onClick={handleRefreshPrompt} disabled={isRunning}>
            Pull from page
          </button>
        </div>
      </section>

      <section className="form-field">
        <label htmlFor="itera-system-prompt">System prompt</label>
        <textarea
          id="itera-system-prompt"
          rows={3}
          value={systemPrompt}
          onChange={(event) => setSystemPrompt(event.target.value)}
        />
      </section>

      <button type="button" onClick={handleRunPipeline} disabled={!canRun}>
        {isRunning ? "Running…" : "Run pipeline"}
      </button>

      {error && <p className="error">{error}</p>}

      {results.length > 0 && (
        <section className="results">
          <h3>Latest run</h3>
          <ol>
            {results.map((node, index) => (
              <li key={node.id}>
                <span className="index">{index + 1}</span>
                <div>
                  <p className="model-title">{node.model}</p>
                  <p className="model-subtitle">
                    {node.metadata?.provider
                      ? `${PROVIDER_LABEL[node.metadata.provider] ?? node.metadata.provider} • `
                      : ""}
                    Node: {node.id.slice(0, 8)}…
                  </p>
                  <p className="muted output-preview">
                    {node.output
                      ? `${node.output.slice(0, 90)}${
                          node.output.length > 90 ? "…" : ""
                        }`
                      : "No output"}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="button-row">
        <button type="button" onClick={handleOpenOptions}>
          Configure models
        </button>
      </div>
    </div>
  );
}
