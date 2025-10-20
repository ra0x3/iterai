export interface ConfigData {
  diff: {
    colorize: boolean;
    plan_comparison: "simple" | "llm";
  };
  models: {
    default: string;
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
    base_url?: string;
  };
}

export const DEFAULT_CONFIG: ConfigData = {
  diff: {
    colorize: true,
    plan_comparison: "simple",
  },
  models: {
    default: "gpt-4o",
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
  },
};

/**
 * Configuration manager for IterAI
 */
export class Config {
  private data: ConfigData;

  constructor(configData?: Partial<ConfigData>) {
    this.data = { ...DEFAULT_CONFIG, ...configData };
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
      if (!(k in current)) {
        current[k] = {};
      }
      current = current[k];
    }
    current[keys[keys.length - 1]] = value;
  }

  getData(): ConfigData {
    return { ...this.data };
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
