export type ModelProvider = "openai" | "anthropic" | "google" | "custom";

export interface ModelConfig {
  id: string;
  provider: ModelProvider;
  label: string;
  model: string;
  enabled: boolean;
  order: number;
  requiresApiKey: boolean;
  baseUrl?: string;
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
}

export const DEFAULT_MODELS: ModelConfig[] = [
  {
    id: "openai:gpt-4o",
    provider: "openai",
    label: "OpenAI GPT-4o",
    model: "gpt-4o",
    enabled: true,
    order: 0,
    requiresApiKey: true,
    temperature: 0.2,
    topP: 0.9,
    maxOutputTokens: 2048,
  },
  {
    id: "openai:gpt-4",
    provider: "openai",
    label: "OpenAI GPT-4",
    model: "gpt-4",
    enabled: false,
    order: 1,
    requiresApiKey: true,
    temperature: 0.2,
    topP: 0.9,
    maxOutputTokens: 2048,
  },
  {
    id: "anthropic:claude-3-5",
    provider: "anthropic",
    label: "Anthropic Claude 3.5",
    model: "claude-3-5-sonnet-20240620",
    enabled: false,
    order: 2,
    requiresApiKey: true,
    baseUrl: "https://api.anthropic.com/v1",
    temperature: 0.3,
    topP: 0.95,
    maxOutputTokens: 2048,
  },
  {
    id: "google:gemini-1.5-pro-latest",
    provider: "google",
    label: "Gemini 1.5 Pro",
    model: "gemini-1.5-pro-latest",
    enabled: false,
    order: 3,
    requiresApiKey: true,
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    temperature: 0.4,
    topP: 0.9,
    maxOutputTokens: 2048,
  },
];

export type SecretsByProvider = Partial<Record<ModelProvider, string>>;

export interface PluginSettings {
  models: ModelConfig[];
  defaultSystemPrompt: string;
  secrets: SecretsByProvider;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  models: DEFAULT_MODELS,
  defaultSystemPrompt: "You are an expert editor...",
  secrets: {},
};
