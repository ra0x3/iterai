import {
  DEFAULT_CONFIG,
  Config,
  IterAI,
  setGlobalConfig,
} from "@itera/index";
import { ModelConfig, PluginSettings } from "../shared/models";
import { loadSecrets, loadSettings, onSettingsChanged } from "../shared/storage";

let iteraiInstance: IterAI | null = null;
let currentSettings: PluginSettings | null = null;
let enabledModelOrder: ModelConfig[] = [];

function buildRegistry(models: ModelConfig[]): Record<string, any> {
  return models.reduce<Record<string, any>>((acc, model) => {
    const options: Record<string, number> = {};
    if (typeof model.temperature === "number") {
      options.temperature = model.temperature;
    }
    if (typeof model.topP === "number") {
      options.topP = model.topP;
    }
    if (typeof model.maxOutputTokens === "number") {
      options.maxOutputTokens = model.maxOutputTokens;
      if (model.provider === "openai") {
        options.maxTokens = model.maxOutputTokens;
      }
    }

    acc[model.model] = {
      provider: model.provider,
      label: model.label,
      ...(model.baseUrl ? { baseUrl: model.baseUrl } : {}),
      ...(Object.keys(options).length > 0 ? { options } : {}),
    };
    return acc;
  }, {});
}

function ensureItera(): IterAI {
  if (!iteraiInstance) {
    throw new Error("Itera is not initialised yet");
  }
  return iteraiInstance;
}

async function configureItera(settings: PluginSettings): Promise<void> {
  currentSettings = settings;
  enabledModelOrder = settings.models
    .filter((model) => model.enabled)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const uniqueProviders = Array.from(
    new Set(settings.models.map((model) => model.provider)),
  );
  const secrets = await loadSecrets(uniqueProviders);

  const registry = buildRegistry(settings.models);

  const config = new Config({
    ...DEFAULT_CONFIG,
    system_prompt_template: settings.defaultSystemPrompt,
    models: {
      ...DEFAULT_CONFIG.models,
      default: enabledModelOrder[0]?.model ?? DEFAULT_CONFIG.models.default,
      registry,
    },
  });

  config.set("pipeline.providers", enabledModelOrder.map((model) => ({
    id: model.id,
    model: model.model,
    label: model.label,
    provider: model.provider,
    order: model.order,
  })));
  config.set("models.registry", registry);
  if (secrets.openai) {
    config.set("api.openai_key", secrets.openai);
  }
  if (secrets.anthropic) {
    config.set("api.anthropic_key", secrets.anthropic);
  }
  if (secrets.google) {
    config.set("api.google_key", secrets.google);
  }

  setGlobalConfig(config);

  const primaryKey = secrets.openai || secrets.anthropic || secrets.google || "";
  const baseUrl = config.get("api.base_url", "https://api.openai.com/v1");
  iteraiInstance = new IterAI("plugin-storage", primaryKey, baseUrl);
}

async function bootstrap(): Promise<void> {
  const settings = await loadSettings();
  await configureItera(settings);
}

void bootstrap();

onSettingsChanged((settings) => {
  void configureItera(settings);
});

async function runPipeline(
  userPrompt: string,
  systemPrompt?: string,
): Promise<any[]> {
  const iterai = ensureItera();
  if (!currentSettings) {
    throw new Error("Settings are not loaded yet");
  }
  if (enabledModelOrder.length === 0) {
    throw new Error("Enable at least one model in the options page");
  }

  const prompt = userPrompt.trim();
  if (!prompt) {
    throw new Error("Prompt cannot be empty");
  }

  const sysPrompt = systemPrompt ?? currentSettings.defaultSystemPrompt;
  const nodes: any[] = [];
  let previousNode: any | null = null;

  for (const [index, model] of enabledModelOrder.entries()) {
    if (index === 0) {
      const node = await iterai.createRoot(prompt, model.model, sysPrompt);
      nodes.push(node.toDict());
      previousNode = node;
    } else {
      if (!previousNode) {
        throw new Error("Previous node missing for refinement");
      }
      const node = await iterai.refine(previousNode, model.model, prompt, sysPrompt);
      nodes.push(node.toDict());
      previousNode = node;
    }
  }

  return nodes;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    return false;
  }

  const respond = (payload: unknown) => {
    sendResponse({ ok: true, data: payload });
  };
  const fail = (error: unknown) => {
    console.error("Itera background error", error);
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  };

  switch (message.type) {
    case "itera:get-config": {
      respond({
        settings: currentSettings,
        enabledModels: enabledModelOrder,
      });
      return true;
    }
    case "itera:create-root": {
      (async () => {
        const iterai = ensureItera();
        const node = await iterai.createRoot(
          message.userPrompt,
          message.model,
          message.systemPrompt,
        );
        respond({ node: node.toDict() });
      })().catch(fail);
      return true;
    }
    case "itera:refine": {
      (async () => {
        const iterai = ensureItera();
        const parentId: string | undefined = message.parentId;
        if (!parentId) {
          throw new Error("parentId is required for refine");
        }
        const parent = iterai.dag.getNode(parentId);
        if (!parent) {
          throw new Error(`Parent node ${parentId} not found`);
        }
        const node = await iterai.refine(
          parent,
          message.model,
          message.userPrompt,
          message.systemPrompt,
        );
        respond({ node: node.toDict() });
      })().catch(fail);
      return true;
    }
    case "itera:run-pipeline": {
      (async () => {
        const nodes = await runPipeline(
          message.userPrompt,
          message.systemPrompt,
        );
        respond({ nodes });
      })().catch(fail);
      return true;
    }
    default:
      return false;
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (
    changes["itera:secret:openai"] ||
    changes["itera:secret:anthropic"] ||
    changes["itera:secret:google"]
  ) {
    if (currentSettings) {
      void configureItera(currentSettings);
    }
  }
});
