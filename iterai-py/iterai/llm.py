import logging
from typing import Dict, List, Tuple, Any

from litellm import acompletion

from .config import get_config
from .types import Step

logger = logging.getLogger(__name__)


def _resolve_model_entry(model: str) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    config = get_config()
    registry = config.get("models.registry", {}) or {}
    entry = registry.get(model, {}) or {}
    options = entry.get("options", {}) or {}
    return entry, options


def _apply_generation_options(entry: Dict[str, Any], options: Dict[str, Any]) -> Dict[str, Any]:
    kwargs: Dict[str, Any] = {}

    base_url = entry.get("baseUrl") or entry.get("base_url")
    api_key = entry.get("apiKey") or entry.get("api_key")
    if base_url:
        kwargs["api_base"] = base_url
    if api_key:
        kwargs["api_key"] = api_key

    temperature = options.get("temperature")
    if temperature is not None:
        kwargs["temperature"] = float(temperature)

    top_p = options.get("topP") or options.get("top_p")
    if top_p is not None:
        kwargs["top_p"] = float(top_p)

    top_k = options.get("topK") or options.get("top_k")
    if top_k is not None:
        kwargs["top_k"] = int(top_k)

    max_tokens = options.get("maxTokens") or options.get("max_tokens")
    if max_tokens is not None:
        kwargs["max_tokens"] = int(max_tokens)

    max_output_tokens = options.get("maxOutputTokens") or options.get("max_output_tokens")
    if max_output_tokens is not None:
        kwargs["max_output_tokens"] = int(max_output_tokens)

    return kwargs


async def generate_output(model: str, user_prompt: str, system_prompt: str = ""):
    entry, options = _resolve_model_entry(model)
    completion_kwargs = _apply_generation_options(entry, options)

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": user_prompt})

    logger.debug(
        "Calling LLM model=%s with %s char prompt (options=%s)",
        model,
        len(user_prompt),
        completion_kwargs,
    )
    response = await acompletion(model=model, messages=messages, **completion_kwargs)
    content = response["choices"][0]["message"]["content"]
    logger.debug("LLM response received: %s chars", len(content))
    return content


async def generate_plan(model: str, user_prompt: str, system_prompt: str = ""):
    logger.debug("Generating plan for task: %s...", user_prompt[:50])
    plan_prompt = f"""Before answering, create a concise structured plan for how you'll approach this task.

Task: {user_prompt}

Requirements:
- Be brief and to-the-point
- Focus only on essential steps
- Avoid verbose explanations or justifications
- Provide only the plan, not the actual output"""

    plan = await generate_output(model, plan_prompt, system_prompt)
    logger.debug("Plan generated: %s chars", len(plan))
    return plan


async def generate_steps(
    model: str, plan_text: str, system_prompt: str = ""
) -> List[Step]:
    """Use the model to convert a free-form plan into ordered, atomic steps.

    The model must return strict JSON of the shape:
    {"steps": [{"order": 1, "text": "..."}, ...]}
    """
    import json

    logger.debug("Generating steps from plan (%s chars)", len(plan_text))
    steps_prompt = f"""
You are converting a free-form plan into structured steps.
Return STRICT JSON only, no code fences, no commentary, exactly this schema:
{{"steps": [{{"order": 1, "text": "..."}}]}}

Input plan:
{plan_text}
"""

    raw = await generate_output(model, steps_prompt, system_prompt)

    def _strip_code_fences(s: str) -> str:
        s = s.strip()
        if s.startswith("```") and s.endswith("```"):
            s = s.strip("`")
            if "\n" in s:
                s = s.split("\n", 1)[1]
        return s.strip()

    text = _strip_code_fences(raw)

    steps_list: List[Step] = []
    try:
        data = json.loads(text)
        items = data.get("steps", []) if isinstance(data, dict) else []
        for item in items:
            try:
                order_val = int(item.get("order"))
                text_val = str(item.get("text", "")).strip()
                if text_val:
                    steps_list.append(Step(order=order_val, text=text_val))
            except Exception:
                continue
    except Exception:
        logger.debug("Failed to parse JSON steps; falling back to heuristic parse")
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            num = None
            rest = None
            for sep in [". ", ") ", ".", ")", " - ", " -", "- ", "-"]:
                if sep in line:
                    left, right = line.split(sep, 1)
                    if left.strip().isdigit():
                        num = int(left.strip())
                        rest = right.strip()
                        break
            if num is None:
                num = len(steps_list) + 1
                rest = line
            steps_list.append(Step(order=num, text=rest))

    if not steps_list:
        logger.info(
            "Model returned no steps; creating a single fallback step from plan text"
        )
        steps_list = [Step(order=1, text=plan_text.strip() or "Plan")]

    steps_list.sort(key=lambda s: s.order)
    for idx, s in enumerate(steps_list, start=1):
        s.order = idx
    logger.debug("Generated %s steps", len(steps_list))
    return steps_list


async def compare_plans_llm(
    plan_a: List[Step], plan_b: List[Step], model: str = "gpt-4o-mini"
) -> str:
    """Use an LLM to semantically compare two plans."""
    logger.debug(
        "Comparing plans: %s steps vs %s steps using %s",
        len(plan_a),
        len(plan_b),
        model,
    )
    plan_a_text = "\n".join(f"{s.order}. {s.text}" for s in plan_a)
    plan_b_text = "\n".join(f"{s.order}. {s.text}" for s in plan_b)

    comparison_prompt = f"""Compare these two plans and explain the key differences in approach, ordering, and content.

Plan A:
{plan_a_text}

Plan B:
{plan_b_text}

Provide a concise analysis of what changed and why it might matter."""

    result = await generate_output(model, comparison_prompt)
    logger.debug("Plan comparison complete")
    return result
