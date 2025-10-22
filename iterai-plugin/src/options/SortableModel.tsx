import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import type { CSSProperties } from "react";
import { ModelConfig } from "../shared/models";

interface SortableModelProps {
  model: ModelConfig;
  onToggle: () => void;
  secretValue: string;
  onSecretChange: (value: string) => void;
  onTunablesChange: (
    field: "temperature" | "topP" | "maxOutputTokens",
    value: number | undefined,
  ) => void;
}

export function SortableModel({
  model,
  onToggle,
  secretValue,
  onSecretChange,
  onTunablesChange,
}: SortableModelProps): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: model.id,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const parseNumber = (value: string): number | undefined => {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  return (
    <li ref={setNodeRef} style={style} className="model-item">
      <div className="model-row">
        <button
          type="button"
          className={`toggle ${model.enabled ? "toggle--on" : "toggle--off"}`}
          onClick={onToggle}
          title={model.enabled ? "Disable model" : "Enable model"}
        >
          <span className="toggle__thumb" />
        </button>
        <div className="model-meta">
          <p className="model-title">{model.label}</p>
          <p className="model-subtitle">
            {model.provider.toUpperCase()} · {model.model}
          </p>
        </div>
        <button
          type="button"
          className="model-grip"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
        >
          ☰
        </button>
      </div>
      {model.requiresApiKey && (
        <div className="form-field form-field--inline">
          <label htmlFor={`secret-${model.id}`}>API key</label>
          <input
            id={`secret-${model.id}`}
            type="password"
            autoComplete="off"
            value={secretValue}
            placeholder={`Paste ${model.provider.charAt(0).toUpperCase() + model.provider.slice(1)} token`}
            onChange={(event) => onSecretChange(event.target.value)}
          />
        </div>
      )}

      <div className="tunables">
        <div className="tunables__field">
          <label htmlFor={`temp-${model.id}`}>Temperature</label>
          <input
            id={`temp-${model.id}`}
            type="number"
            step="0.1"
            min="0"
            max="2"
            value={typeof model.temperature === "number" ? model.temperature : ""}
            onChange={(event) =>
              onTunablesChange("temperature", parseNumber(event.target.value))
            }
          />
        </div>
        <div className="tunables__field">
          <label htmlFor={`topp-${model.id}`}>Top P</label>
          <input
            id={`topp-${model.id}`}
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={typeof model.topP === "number" ? model.topP : ""}
            onChange={(event) =>
              onTunablesChange("topP", parseNumber(event.target.value))
            }
          />
        </div>
        <div className="tunables__field">
          <label htmlFor={`max-${model.id}`}>Max output tokens</label>
          <input
            id={`max-${model.id}`}
            type="number"
            min="1"
            step="1"
            value={
              typeof model.maxOutputTokens === "number"
                ? model.maxOutputTokens
                : ""
            }
            onChange={(event) =>
              onTunablesChange("maxOutputTokens", parseNumber(event.target.value))
            }
          />
        </div>
      </div>
    </li>
  );
}
