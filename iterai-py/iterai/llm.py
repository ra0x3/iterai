import logging
from litellm import acompletion
from typing import List

from .types import Step

logger = logging.getLogger(__name__)


async def generate_output(model: str, user_prompt: str, system_prompt: str = ""):
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": user_prompt})

    logger.debug(f"Calling LLM model={model} with {len(user_prompt)} char prompt")
    response = await acompletion(model=model, messages=messages)
    content = response["choices"][0]["message"]["content"]
    logger.debug(f"LLM response received: {len(content)} chars")
    return content


async def generate_plan(model: str, user_prompt: str, system_prompt: str = ""):
    logger.debug(f"Generating plan for task: {user_prompt[:50]}...")
    plan_prompt = f"""Before answering, create a concise structured plan for how you'll approach this task.

Task: {user_prompt}

Requirements:
- Be brief and to-the-point
- Focus only on essential steps
- Avoid verbose explanations or justifications
- Provide only the plan, not the actual output"""

    plan = await generate_output(model, plan_prompt, system_prompt)
    logger.debug(f"Plan generated: {len(plan)} chars")
    return plan


async def generate_steps(
    model: str, plan_text: str, system_prompt: str = ""
) -> List[Step]:
    """Use the model to convert a free-form plan into ordered, atomic steps.

    The model must return strict JSON of the shape:
    {"steps": [{"order": 1, "text": "..."}, ...]}
    """
    import json

    logger.debug(f"Generating steps from plan ({len(plan_text)} chars)")
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
    logger.debug(f"Generated {len(steps_list)} steps")
    return steps_list


async def compare_plans_llm(
    plan_a: List[Step], plan_b: List[Step], model: str = "gpt-4o-mini"
) -> str:
    """Use an LLM to semantically compare two plans.

    Args:
        plan_a: First plan as List[Step]
        plan_b: Second plan as List[Step]
        model: Model to use for comparison

    Returns:
        A text description of the differences between the two plans
    """
    logger.debug(f"Comparing plans: {len(plan_a)} steps vs {len(plan_b)} steps using {model}")
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
