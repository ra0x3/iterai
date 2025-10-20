import { Step } from "./types.js";

const logger = {
  debug: (msg: string) => console.debug(`[DEBUG] llm: ${msg}`),
  info: (msg: string) => console.info(`[INFO] llm: ${msg}`),
};

/**
 * Generate output from an LLM using OpenAI-compatible API
 */
export async function generateOutput(
  model: string,
  userPrompt: string,
  systemPrompt: string = "",
  apiKey?: string,
  baseUrl: string = "https://api.openai.com/v1",
): Promise<string> {
  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: userPrompt });

  logger.debug(
    `Calling LLM model=${model} with ${userPrompt.length} char prompt`,
  );

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey || ""}`,
    },
    body: JSON.stringify({
      model,
      messages,
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  logger.debug(`LLM response received: ${content.length} chars`);
  return content;
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
): Promise<string> {
  logger.debug(`Generating plan for task: ${userPrompt.slice(0, 50)}...`);
  const planPrompt = `Before answering, create a concise structured plan for how you'll approach this task.

Task: ${userPrompt}

Requirements:
- Be brief and to-the-point
- Focus only on essential steps
- Avoid verbose explanations or justifications
- Provide only the plan, not the actual output`;

  const plan = await generateOutput(
    model,
    planPrompt,
    systemPrompt,
    apiKey,
    baseUrl,
  );
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
): Promise<Step[]> {
  logger.debug(`Generating steps from plan (${planText.length} chars)`);
  const stepsPrompt = `You are converting a free-form plan into structured steps.
Return STRICT JSON only, no code fences, no commentary, exactly this schema:
{"steps": [{"order": 1, "text": "..."}]}

Input plan:
${planText}`;

  const raw = await generateOutput(
    model,
    stepsPrompt,
    systemPrompt,
    apiKey,
    baseUrl,
  );

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
${planBText}

Provide a concise analysis of what changed and why it might matter.`;

  const result = await generateOutput(
    model,
    comparisonPrompt,
    "",
    apiKey,
    baseUrl,
  );
  logger.debug("Plan comparison complete");
  return result;
}
