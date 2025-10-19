from litellm import acompletion


async def generate_output(model: str, user_prompt: str, system_prompt: str = ""):
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": user_prompt})

    response = await acompletion(model=model, messages=messages)
    return response["choices"][0]["message"]["content"]


async def generate_plan(model: str, user_prompt: str, system_prompt: str = ""):
    plan_prompt = f"""Before answering, create a structured plan for how you'll approach this task.
    
Task: {user_prompt}

Provide only the plan, not the actual output."""

    return await generate_output(model, plan_prompt, system_prompt)
