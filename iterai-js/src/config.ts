export type ModelProvider = "openai" | "anthropic" | "google" | "custom";

export interface ModelTunableOptions {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  maxOutputTokens?: number;
}

export interface ModelRegistryEntry {
  provider: ModelProvider;
  label?: string;
  baseUrl?: string;
  apiKey?: string;
  options?: ModelTunableOptions;
}

export interface ConfigData {
  diff: {
    colorize: boolean;
    plan_comparison: "simple" | "llm";
  };
  models: {
    default: string;
    registry: Record<string, ModelRegistryEntry>;
  };
  concurrency: {
    max_tasks: number;
  };
  storage: {
    path: string;
  };
  system_prompt_template: string;
  api?: {
    openai_key?: string;
    anthropic_key?: string;
    google_key?: string;
    base_url?: string;
    anthropic_base_url?: string;
    google_base_url?: string;
  };
}

export const DEFAULT_MODEL_REGISTRY: Record<string, ModelRegistryEntry> = {
  "gpt-4o": {
    provider: "openai",
    label: "OpenAI GPT-4o",
    options: {
      temperature: 0.2,
      topP: 0.9,
      maxTokens: 2048,
    },
  },
  "gpt-4": {
    provider: "openai",
    label: "OpenAI GPT-4",
    options: {
      temperature: 0.2,
      topP: 0.9,
      maxTokens: 2048,
    },
  },
  "claude-3-5-sonnet-20240620": {
    provider: "anthropic",
    label: "Anthropic Claude 3.5",
    baseUrl: "https://api.anthropic.com/v1",
    options: {
      temperature: 0.3,
      topP: 0.95,
      maxOutputTokens: 2048,
    },
  },
  "gemini-1.5-pro-latest": {
    provider: "google",
    label: "Google Gemini 1.5 Pro",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    options: {
      temperature: 0.4,
      topP: 0.9,
      maxOutputTokens: 2048,
    },
  },
};

export const DEFAULT_CONFIG: ConfigData = {
  diff: {
    colorize: true,
    plan_comparison: "simple",
  },
  models: {
    default: "gpt-4o",
    registry: DEFAULT_MODEL_REGISTRY,
  },
  concurrency: {
    max_tasks: 8,
  },
  storage: {
    path: "iterai-storage",
  },
  system_prompt_template: "You are an expert editor...",
  api: {
    base_url: "https://api.openai.com/v1",
    anthropic_base_url: "https://api.anthropic.com/v1",
    google_base_url: "https://generativelanguage.googleapis.com/v1beta/models",
  },
};

/**
 * Configuration manager for IterAI
 */
export class Config {
  private data: ConfigData;

  constructor(configData?: Partial<ConfigData>) {
    this.data = {
      ...DEFAULT_CONFIG,
      ...configData,
      models: {
        ...DEFAULT_CONFIG.models,
        ...(configData?.models ?? {}),
        registry: {
          ...DEFAULT_CONFIG.models.registry,
          ...(configData?.models?.registry ?? {}),
        },
      },
    };
  }

  get(key: string, defaultValue?: any): any {
    const keys = key.split(".");
    let value: any = this.data;
    for (const k of keys) {
      if (value && typeof value === "object" && k in value) {
        value = value[k];
      } else {
        return defaultValue;
      }
    }
    return value !== undefined ? value : defaultValue;
  }

  set(key: string, value: any): void {
    const keys = key.split(".");
    let current: any = this.data;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in current) || typeof current[k] !== "object") {
        current[k] = {};
      }
      current = current[k];
    }
    current[keys[keys.length - 1]] = value;
  }

  getData(): ConfigData {
    return JSON.parse(JSON.stringify(this.data));
  }
}

let globalConfig: Config | null = null;

export function getConfig(): Config {
  if (!globalConfig) {
    globalConfig = new Config();
  }
  return globalConfig;
}

export function setGlobalConfig(config: Config): void {
  globalConfig = config;
}
