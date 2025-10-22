import { getConfig, ModelProvider, ModelRegistryEntry } from "./config.js";
import { Step } from "./types.js";

const logger = {
  debug: (msg: string) => console.debug(`[DEBUG] llm: ${msg}`),
  info: (msg: string) => console.info(`[INFO] llm: ${msg}`),
};

interface LLMRequestOptions {
  model: string;
  userPrompt: string;
  systemPrompt?: string;
  provider?: ModelProvider;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  maxOutputTokens?: number;
}

interface ResolvedRequest {
  model: string;
  provider: ModelProvider;
  apiKey?: string;
  baseUrl: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  maxOutputTokens?: number;
}

function normalizeBase(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

const MODEL_ALIASES: Record<string, string> = {
  "gemini-1.5-pro": "gemini-1.5-pro-latest",
};

function defaultBaseUrl(provider: ModelProvider): string {
  const config = getConfig();
  switch (provider) {
    case "anthropic":
      return (
        config.get("api.anthropic_base_url") || "https://api.anthropic.com/v1"
      );
    case "google":
      return (
        config.get("api.google_base_url") ||
        "https://generativelanguage.googleapis.com/v1beta/models"
      );
    case "openai":
      return config.get("api.base_url") || "https://api.openai.com/v1";
    default:
      return "";
  }
}

function lookupApiKey(
  provider: ModelProvider,
  entry?: ModelRegistryEntry,
): string | undefined {
  if (entry?.apiKey) return entry.apiKey;
  const config = getConfig();
  switch (provider) {
    case "openai":
      return config.get("api.openai_key");
    case "anthropic":
      return config.get("api.anthropic_key");
    case "google":
      return config.get("api.google_key");
    default:
      return undefined;
  }
}

function resolveRequest(options: LLMRequestOptions): ResolvedRequest {
  const config = getConfig();
  const registry = config.get("models.registry", {}) as Record<
    string,
    ModelRegistryEntry
  >;
  const normalizedModel = MODEL_ALIASES[options.model] ?? options.model;
  const entry = registry?.[options.model] ?? registry?.[normalizedModel];
  const modelId = entry ? normalizedModel : options.model;
  const provider: ModelProvider =
    options.provider || entry?.provider || "openai";

  const entryOptions = (entry?.options ?? {}) as Record<string, any>;

  const baseUrl = options.baseUrl || entry?.baseUrl || defaultBaseUrl(provider);

  const apiKey =
    options.apiKey || entry?.apiKey || lookupApiKey(provider, entry);

  const temperature = options.temperature ?? entryOptions.temperature;
  const topP = options.topP ?? entryOptions.topP;
  const topK = options.topK ?? entryOptions.topK;
  const maxTokens = options.maxTokens ?? entryOptions.maxTokens;
  const maxOutputTokens =
    options.maxOutputTokens ??
    entryOptions.maxOutputTokens ??
    entryOptions.maxTokens;

  return {
    model: modelId,
    provider,
    baseUrl,
    apiKey,
    temperature,
    topP,
    topK,
    maxTokens,
    maxOutputTokens,
  };
}

async function callOpenAI(
  request: ResolvedRequest,
  userPrompt: string,
  systemPrompt?: string,
): Promise<string> {
  if (!request.apiKey) {
    throw new Error("OpenAI API key is required");
  }

  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: userPrompt });

  const body: Record<string, any> = {
    model: request.model,
    messages,
  };
  if (typeof request.temperature === "number") {
    body.temperature = request.temperature;
  }
  if (typeof request.topP === "number") {
    body.top_p = request.topP;
  }
  const maxTokens =
    typeof request.maxTokens === "number"
      ? Math.floor(request.maxTokens)
      : typeof request.maxOutputTokens === "number"
        ? Math.floor(request.maxOutputTokens)
        : undefined;
  if (typeof maxTokens === "number" && maxTokens > 0) {
    body.max_tokens = maxTokens;
  }

  const response = await fetch(
    `${normalizeBase(request.baseUrl)}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${request.apiKey}`,
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    throw new Error(
      `OpenAI API error: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI API returned no content");
  }
  return content;
}

async function callAnthropic(
  request: ResolvedRequest,
  userPrompt: string,
  systemPrompt?: string,
): Promise<string> {
  if (!request.apiKey) {
    throw new Error("Anthropic API key is required");
  }

  const maxOutputTokens =
    typeof request.maxOutputTokens === "number"
      ? Math.max(1, Math.floor(request.maxOutputTokens))
      : undefined;

  const payload: Record<string, unknown> = {
    model: request.model,
    messages: [
      {
        role: "user",
        content: userPrompt,
      },
    ],
    max_output_tokens: maxOutputTokens ?? 1024,
  };

  if (systemPrompt) {
    payload.system = systemPrompt;
  }
  if (typeof request.temperature === "number") {
    payload.temperature = request.temperature;
  }
  if (typeof request.topP === "number") {
    payload.top_p = request.topP;
  }
  if (typeof request.topK === "number") {
    payload.top_k = request.topK;
  }

  const response = await fetch(`${normalizeBase(request.baseUrl)}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": request.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `Anthropic API error: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
  const content = data?.content?.[0]?.text;
  if (!content) {
    throw new Error("Anthropic API returned no content");
  }
  return content;
}

async function callGoogle(
  request: ResolvedRequest,
  userPrompt: string,
  systemPrompt?: string,
): Promise<string> {
  if (!request.apiKey) {
    throw new Error("Google Generative Language API key is required");
  }

  const payload: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: [{ text: userPrompt }],
      },
    ],
  };

  if (systemPrompt) {
    payload.systemInstruction = {
      role: "system",
      parts: [{ text: systemPrompt }],
    };
  }

  const generationConfig: Record<string, number> = {};
  if (typeof request.temperature === "number") {
    generationConfig.temperature = request.temperature;
  }
  if (typeof request.topP === "number") {
    generationConfig.topP = request.topP;
  }
  if (typeof request.topK === "number") {
    generationConfig.topK = request.topK;
  }
  if (typeof request.maxOutputTokens === "number") {
    generationConfig.maxOutputTokens = Math.max(
      1,
      Math.floor(request.maxOutputTokens),
    );
  }
  if (Object.keys(generationConfig).length > 0) {
    payload.generationConfig = generationConfig;
  }

  const url = `${normalizeBase(request.baseUrl)}/${encodeURIComponent(
    request.model,
  )}:generateContent?key=${request.apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `Google Generative Language API error: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
  const candidate = data?.candidates?.[0];
  const parts = Array.isArray(candidate?.content?.parts)
    ? candidate.content.parts
    : [];
  const text = parts
    .map((part: { text?: string }) => part?.text || "")
    .filter(Boolean)
    .join("\n");

  if (!text) {
    throw new Error("Google Generative Language API returned no content");
  }

  return text;
}

async function requestLLM(options: LLMRequestOptions): Promise<string> {
  const resolved = resolveRequest(options);
  const { provider, model } = resolved;
  logger.debug(
    `Calling LLM provider=${provider} model=${model} promptLength=${options.userPrompt.length}`,
  );

  switch (provider) {
    case "openai":
      return callOpenAI(resolved, options.userPrompt, options.systemPrompt);
    case "anthropic":
      return callAnthropic(resolved, options.userPrompt, options.systemPrompt);
    case "google":
      return callGoogle(resolved, options.userPrompt, options.systemPrompt);
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

/**
 * Generate output from a configured LLM provider
 */
export async function generateOutput(
  model: string,
  userPrompt: string,
  systemPrompt: string = "",
  apiKey?: string,
  baseUrl?: string,
  provider?: ModelProvider,
): Promise<string> {
  return requestLLM({
    model,
    userPrompt,
    systemPrompt,
    apiKey,
    baseUrl,
    provider,
  });
}

/**
 * Generate a plan for approaching a task
 */
export async function generatePlan(
  model: string,
  userPrompt: string,
  systemPrompt: string = "",
  apiKey?: string,
  baseUrl?: string,
  provider?: ModelProvider,
): Promise<string> {
  logger.debug(`Generating plan for task: ${userPrompt.slice(0, 50)}...`);
  const planPrompt = `Before answering, create a concise structured plan for how you'll approach this task.

Task: ${userPrompt}

Requirements:
- Be brief and to-the-point
- Focus only on essential steps
- Avoid verbose explanations or justifications
- Provide only the plan, not the actual output`;

  const plan = await requestLLM({
    model,
    userPrompt: planPrompt,
    systemPrompt,
    apiKey,
    baseUrl,
    provider,
  });
  logger.debug(`Plan generated: ${plan.length} chars`);
  return plan;
}

/**
 * Convert a free-form plan into structured steps using LLM
 */
export async function generateSteps(
  model: string,
  planText: string,
  systemPrompt: string = "",
  apiKey?: string,
  baseUrl?: string,
  provider?: ModelProvider,
): Promise<Step[]> {
  logger.debug(`Generating steps from plan (${planText.length} chars)`);
  const stepsPrompt = `You are converting a free-form plan into structured steps.
Return STRICT JSON only, no code fences, no commentary, exactly this schema:
{"steps": [{"order": 1, "text": "..."}]}

Input plan:
${planText}`;

  const raw = await requestLLM({
    model,
    userPrompt: stepsPrompt,
    systemPrompt,
    apiKey,
    baseUrl,
    provider,
  });

  // Strip code fences if present
  const stripCodeFences = (s: string): string => {
    s = s.trim();
    if (s.startsWith("```") && s.endsWith("```")) {
      s = s.replace(/^```\w*\n?/, "").replace(/```$/, "");
    }
    return s.trim();
  };

  const text = stripCodeFences(raw);

  const stepsList: Step[] = [];
  try {
    const data = JSON.parse(text);
    const items = Array.isArray(data.steps) ? data.steps : [];
    for (const item of items) {
      try {
        const order = parseInt(String(item.order), 10);
        const stepText = String(item.text || "").trim();
        if (stepText) {
          stepsList.push(new Step(order, stepText));
        }
      } catch {
        continue;
      }
    }
  } catch {
    logger.debug("Failed to parse JSON steps; falling back to heuristic parse");
    // Fallback to line-by-line parsing
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let num: number | null = null;
      let rest: string | null = null;

      for (const sep of [". ", ") ", ".", ")", " - ", " -", "- ", "-"]) {
        if (trimmed.includes(sep)) {
          const [left, right] = trimmed.split(sep, 2);
          if (left.trim().match(/^\d+$/)) {
            num = parseInt(left.trim(), 10);
            rest = right.trim();
            break;
          }
        }
      }

      if (num === null) {
        num = stepsList.length + 1;
        rest = trimmed;
      }
      if (rest) {
        stepsList.push(new Step(num, rest));
      }
    }
  }

  if (stepsList.length === 0) {
    logger.info(
      "Model returned no steps; creating a single fallback step from plan text",
    );
    stepsList.push(new Step(1, planText.trim() || "Plan"));
  }

  // Normalize order to 1..N
  stepsList.sort((a, b) => a.order - b.order);
  stepsList.forEach((s, idx) => {
    s.order = idx + 1;
  });

  logger.debug(`Generated ${stepsList.length} steps`);
  return stepsList;
}

/**
 * Use an LLM to semantically compare two plans
 */
export async function comparePlansLLM(
  planA: Step[],
  planB: Step[],
  model: string = "gpt-4o-mini",
  apiKey?: string,
  baseUrl?: string,
  provider?: ModelProvider,
): Promise<string> {
  logger.debug(
    `Comparing plans: ${planA.length} steps vs ${planB.length} steps using ${model}`,
  );
  const planAText = planA.map((s) => `${s.order}. ${s.text}`).join("\n");
  const planBText = planB.map((s) => `${s.order}. ${s.text}`).join("\n");

  const comparisonPrompt = `Compare these two plans and explain the key differences in approach, ordering, and content.

Plan A:
${planAText}

Plan B:
${planBText}`;

  return requestLLM({
    model,
    userPrompt: comparisonPrompt,
    apiKey,
    baseUrl,
    provider,
  });
}
