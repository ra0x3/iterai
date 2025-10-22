import { useEffect, useMemo, useState } from "react";
import { loadSettings } from "../shared/storage";
import { InfoTooltip } from "../shared/InfoTooltip";
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
  const [expandedNodes, setExpandedNodes] = useState<string[]>([]);

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
    setExpandedNodes([]);
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

  const toggleExpanded = (id: string) => {
    setExpandedNodes((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    );
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
      <header className="popup-header">
        <img src="/imgs/logo.png" alt="IterAI logo" className="logo-mark" />
        <div>
          <h2>IterAI Pipeline</h2>
          <p className="muted">
            {isLoading
              ? "Loading settings…"
              : activeModels.length > 0
              ? `${activeModels.length} model${activeModels.length === 1 ? "" : "s"} ready`
              : "Enable models from the options page to begin"}
          </p>
        </div>
      </header>

      <section className="form-field">
        <label htmlFor="iterai-prompt" className="label-with-info">
          Prompt
          <InfoTooltip
            text="Describe what you want IterAI to accomplish. We'll send this to the configured models."
            ariaLabel="What is a prompt?"
            offsetX={150}
          />
        </label>
        <textarea
          id="iterai-prompt"
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
        <label htmlFor="iterai-system-prompt" className="label-with-info">
          System prompt
          <InfoTooltip
            text="Context that guides every model run. Use it to define tone, constraints, or rules."
            ariaLabel="What is a system prompt?"
          />
        </label>
        <textarea
          id="iterai-system-prompt"
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
                <div className="result-body">
                  <p className="model-title">{node.model}</p>
                  <p className="model-subtitle">
                    {node.metadata?.provider
                      ? `${PROVIDER_LABEL[node.metadata.provider] ?? node.metadata.provider} • `
                      : ""}
                    Node: {node.id.slice(0, 8)}…
                  </p>
                  <p className="muted output-preview">
                    {node.output
                      ? expandedNodes.includes(node.id)
                        ? node.output
                        : `${node.output.slice(0, 75)}${
                            node.output.length > 75 ? "…" : ""
                          }`
                      : "No output"}
                  </p>
                  {node.output && node.output.length > 75 && (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => toggleExpanded(node.id)}
                    >
                      {expandedNodes.includes(node.id) ? "Show less" : "Show more"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {isRunning && (
        <div className="progress" role="status" aria-live="polite">
          <div className="progress__track" aria-hidden="true">
            <div className="progress__bar" />
          </div>
          <span className="progress__label">Running pipeline…</span>
        </div>
      )}

      <div className="button-row">
        <button type="button" onClick={handleOpenOptions}>
          Configure models
        </button>
      </div>
    </div>
  );
}
