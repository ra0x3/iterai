import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { DEFAULT_MODELS, ModelConfig, PluginSettings } from "../shared/models";
import {
  loadSecrets,
  loadSettings,
  onSettingsChanged,
  saveSecret,
  saveSettings,
} from "../shared/storage";
import { SortableModel } from "./SortableModel";
import "./styles.css";

export function OptionsApp(): JSX.Element {
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [systemPrompt, setSystemPrompt] = useState("You are an expert editor...");
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [isLoading, setLoading] = useState(true);

  useEffect(() => {
    async function bootstrap() {
      setLoading(true);
      const settings = await loadSettings();
      const defaultsById = new Map(DEFAULT_MODELS.map((model) => [model.id, model]));
      const merged = settings.models.map((model) => ({
        ...defaultsById.get(model.id),
        ...model,
      }));
      const ordered = merged
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((model, index) => ({ ...model, order: index }));
      setModels(ordered);
      setActiveModels(ordered.filter((model) => model.enabled).map((model) => model.label));
      setSystemPrompt(settings.defaultSystemPrompt);
      const secretValues = await loadSecrets(ordered.map((model) => model.provider));
      setSecrets(secretValues);
      setLoading(false);
    }
    bootstrap();

    const dispose = onSettingsChanged((next: PluginSettings) => {
      const defaultsById = new Map(DEFAULT_MODELS.map((model) => [model.id, model]));
      const merged = next.models.map((model) => ({
        ...defaultsById.get(model.id),
        ...model,
      }));
      const ordered = merged
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((model, index) => ({ ...model, order: index }));
      setModels(ordered);
      setActiveModels(ordered.filter((model) => model.enabled).map((model) => model.label));
      setSystemPrompt(next.defaultSystemPrompt);
    });

    return () => dispose();
  }, []);

  const sensors = useSensors(useSensor(PointerSensor));

  const persistModels = useCallback(
    async (nextModels: ModelConfig[], prompt?: string) => {
      const normalized = nextModels.map((model, index) => ({
        ...model,
        order: index,
      }));
      setModels(normalized);
      setActiveModels(
        normalized.filter((model) => model.enabled).map((model) => model.label),
      );
      await saveSettings({
        models: normalized,
        defaultSystemPrompt: prompt ?? systemPrompt,
        secrets: {},
      });
    },
    [systemPrompt],
  );

  const handleToggle = useCallback(
    async (id: string) => {
      const next = models.map((model) =>
        model.id === id ? { ...model, enabled: !model.enabled } : model,
      );
      await persistModels(next);
    },
    [models, persistModels],
  );

  const handleDragEnd = useCallback(
    async ({ active, over }: DragEndEvent) => {
      if (!over || active.id === over.id) return;
      const oldIndex = models.findIndex((model) => model.id === active.id);
      const newIndex = models.findIndex((model) => model.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;
      const reordered = arrayMove(models, oldIndex, newIndex);
      await persistModels(reordered);
    },
    [models, persistModels],
  );

  const handlePromptChange = useCallback(
    async (prompt: string) => {
      setSystemPrompt(prompt);
      await saveSettings({
        models: models.map((model, index) => ({ ...model, order: index })),
        defaultSystemPrompt: prompt,
        secrets: {},
      });
    },
    [models],
  );

  const handleTunablesChange = useCallback(
    async (id: string, field: "temperature" | "topP" | "maxOutputTokens", value: number | undefined) => {
      const next = models.map((model) =>
        model.id === id ? { ...model, [field]: value } : model,
      );
      await persistModels(next);
    },
    [models, persistModels],
  );

  const handleSecretChange = useCallback(
    async (provider: string, value: string) => {
      setSecrets((prev) => ({ ...prev, [provider]: value }));
      await saveSecret(provider, value);
    },
    [],
  );

  const enabledCount = useMemo(
    () => models.filter((model) => model.enabled).length,
    [models],
  );

  if (isLoading) {
    return (
      <main className="page">
        <p className="muted">Loading Itera settings…</p>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="panel">
        <header className="panel-header">
          <h1>Model Pipeline</h1>
          <p className="muted">
            Toggle providers and drag the rows to define Itera's refinement order.
          </p>
        </header>

        <div className="form-field">
          <label htmlFor="prompt">Default system prompt</label>
          <textarea
            id="prompt"
            value={systemPrompt}
            onChange={(event) => handlePromptChange(event.target.value)}
            rows={3}
          />
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={models.map((model) => model.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="model-list">
              {models.map((model) => (
                <SortableModel
                  key={model.id}
                  model={model}
                  onToggle={() => handleToggle(model.id)}
                  secretValue={secrets[model.provider] ?? ""}
                  onSecretChange={(value) =>
                    handleSecretChange(model.provider, value)
                  }
                  onTunablesChange={(field, value) =>
                    handleTunablesChange(model.id, field, value)
                  }
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>

        <footer className="footer">
          <p>
            {enabledCount} model{enabledCount === 1 ? "" : "s"} active. Runs
            execute sequentially from top to bottom.
          </p>
          <p>
            Secrets live in <code>chrome.storage.local</code> and stay on this device.
          </p>
        </footer>
      </section>
    </main>
  );
}
