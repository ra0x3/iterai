import { DEFAULT_SETTINGS, ModelConfig, PluginSettings } from "./models";

const MODEL_ALIASES: Record<string, string> = {
  "gemini-1.5-pro": "gemini-1.5-pro-latest",
};

function normalizeModel(model: ModelConfig): ModelConfig {
  if (model.provider !== "google") {
    return model;
  }

  const nextModel = MODEL_ALIASES[model.model];
  if (!nextModel) {
    return model;
  }

  const updatedId =
    model.id === `google:${model.model}` ? `google:${nextModel}` : model.id;
  return {
    ...model,
    model: nextModel,
    id: updatedId,
  };
}

function normalizeSettings(settings: PluginSettings): {
  data: PluginSettings;
  changed: boolean;
} {
  let changed = false;
  const models = settings.models.map((model) => {
    const normalized = normalizeModel(model);
    if (normalized !== model) {
      changed = true;
    }
    return normalized;
  });

  if (!changed) {
    return { data: settings, changed: false };
  }

  return {
    data: {
      ...settings,
      models,
    },
    changed: true,
  };
}

type StorageArea = chrome.storage.StorageArea;

// Gracefully handle dev preview where the Chrome API is unavailable.
const chromeApi: typeof chrome | undefined =
  typeof chrome !== "undefined" ? chrome : undefined;

const SETTINGS_KEY = "itera:settings";
const SECRET_PREFIX = "itera:secret:";

const syncStorage = chromeApi?.storage?.sync as StorageArea | undefined;
const localStorageArea = chromeApi?.storage?.local as StorageArea | undefined;

async function readSyncSettings(): Promise<PluginSettings | undefined> {
  if (!syncStorage) return undefined;
  const result = await syncStorage.get(SETTINGS_KEY);
  return result[SETTINGS_KEY];
}

async function writeSyncSettings(settings: PluginSettings): Promise<void> {
  if (!syncStorage) return;
  await syncStorage.set({ [SETTINGS_KEY]: settings });
}

async function readSecret(key: string): Promise<string | undefined> {
  if (!localStorageArea) return undefined;
  const result = await localStorageArea.get(`${SECRET_PREFIX}${key}`);
  return result[`${SECRET_PREFIX}${key}`];
}

async function writeSecret(key: string, value: string): Promise<void> {
  if (!localStorageArea) return;
  await localStorageArea.set({ [`${SECRET_PREFIX}${key}`]: value });
}

export async function loadSettings(): Promise<PluginSettings> {
  const settings = await readSyncSettings();
  const initial = settings ? settings : DEFAULT_SETTINGS;
  const { data, changed } = normalizeSettings(initial);
  if (changed && settings) {
    await saveSettings(data);
  }
  return data;
}

export async function saveSettings(settings: PluginSettings): Promise<void> {
  const { data } = normalizeSettings(settings);
  await writeSyncSettings(data);
}

export async function loadSecrets(
  providers: string[],
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    providers.map(
      async (provider) => [provider, await readSecret(provider)] as const,
    ),
  );
  return entries.reduce<Record<string, string>>((acc, [provider, secret]) => {
    if (secret) {
      acc[provider] = secret;
    }
    return acc;
  }, {});
}

export async function saveSecret(
  provider: string,
  secret: string,
): Promise<void> {
  await writeSecret(provider, secret);
}

export function onSettingsChanged(
  callback: (settings: PluginSettings) => void,
): () => void {
  if (!chromeApi?.storage?.onChanged) return () => void 0;
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string,
  ) => {
    if (areaName !== "sync") return;
    if (changes[SETTINGS_KEY]?.newValue) {
      callback(changes[SETTINGS_KEY].newValue as PluginSettings);
    }
  };
  chromeApi.storage.onChanged.addListener(listener);
  return () => chromeApi.storage.onChanged.removeListener(listener);
}
