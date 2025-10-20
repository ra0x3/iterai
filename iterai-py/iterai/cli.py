#!/usr/bin/env python3
"""CLI for IterAI - demonstrates key use-cases for the library."""

import argparse
import asyncio
import logging
import sys

from . import IterAI, logger


def configure_logging(log_level: str, colorize: bool = False):
    """Configure package logger with the specified level and optional colorization."""
    level = getattr(logging, log_level.upper(), logging.INFO)
    logger.setLevel(level)

    # Update formatter to add color if requested
    if colorize and sys.stdout.isatty():
        try:
            import colorama

            colorama.init(autoreset=True)

            class ColoredFormatter(logging.Formatter):
                COLORS = {
                    "DEBUG": colorama.Fore.CYAN,
                    "INFO": colorama.Fore.GREEN,
                    "WARNING": colorama.Fore.YELLOW,
                    "ERROR": colorama.Fore.RED,
                    "CRITICAL": colorama.Fore.RED + colorama.Style.BRIGHT,
                }

                def format(self, record):
                    levelname = record.levelname
                    if levelname in self.COLORS:
                        record.levelname = f"{self.COLORS[levelname]}{levelname}{colorama.Style.RESET_ALL}"
                    return super().format(record)

            formatter = ColoredFormatter(
                fmt="%(asctime)s [%(levelname)s] %(module)s:%(funcName)s:%(lineno)d - %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            )
            for handler in logger.handlers:
                handler.setFormatter(formatter)
        except ImportError:
            logger.debug("colorama not installed; color output unavailable")


async def demo_basic_workflow(
    user_prompt: str,
    system_prompt: str | None = None,
    storage_path: str | None = None,
    diff_comp: str = "simple",
):
    """Demonstrate basic IterAI workflow: create root, refine, evaluate."""
    logger.info("Starting IterAI demonstration workflow")
    logger.debug(f"User prompt: {user_prompt}")
    logger.debug(f"Storage path: {storage_path or 'default'}")
    logger.debug(f"Plan comparison mode: {diff_comp}")

    # Initialize IterAI
    iterai = IterAI(storage_path=storage_path)
    logger.info("IterAI initialized")

    # Create root node
    logger.info("Creating root node from user prompt")
    root = await iterai.create_root(
        user_prompt=user_prompt,
        system_prompt=system_prompt or "",
        model="gpt-4o-mini",
    )
    logger.info(f"Root node created: {root.id}")
    logger.debug(f"Root plan has {len(root.plan)} steps")
    for step in root.plan:
        logger.debug(f"  Step {step.order}: {step.text}")
    logger.info(f"Root output ({len(root.output)} chars): {root.output[:100]}...")

    # Refine the root node
    logger.info("Creating refinement of root node")
    refined = await iterai.refine(
        root,
        user_prompt="Make this more concise and impactful.",
        model="gpt-4o-mini",
    )
    logger.info(f"Refined node created: {refined.id}")
    logger.debug(f"Refined plan has {len(refined.plan)} steps")
    logger.info(
        f"Refined output ({len(refined.output)} chars): {refined.output[:100]}..."
    )
    logger.debug(f"Diff length: {len(refined.diff)} chars")

    # Create a second refinement with a different approach
    logger.info("Creating alternative refinement")
    alt_refined = await iterai.refine(
        root,
        user_prompt="Make this more detailed and technical.",
        model="gpt-4o-mini",
    )
    logger.info(f"Alternative refined node created: {alt_refined.id}")

    # Compare plans between the two refinements
    logger.info(f"Comparing plans using {diff_comp} mode")
    plan_diff = await refined.diff_plan_async(alt_refined, mode=diff_comp)
    logger.debug(f"Plan diff:\n{plan_diff}")

    # Synthesize the two refinements
    logger.info("Synthesizing both refinements")
    synthesized = await iterai.synthesize(
        [refined, alt_refined],
        user_prompt="Combine the clarity of the first with the depth of the second.",
        model="gpt-4o-mini",
    )
    logger.info(f"Synthesized node created: {synthesized.id}")
    logger.info(
        f"Synthesized output ({len(synthesized.output)} chars): {synthesized.output[:100]}..."
    )

    # Evaluate all nodes
    logger.info("Evaluating all nodes")
    await iterai.evaluate_all(
        [root, refined, alt_refined, synthesized], eval_model="gpt-4o-mini"
    )
    logger.info("Evaluation complete")
    logger.info(f"Root score: {root.score}")
    logger.info(f"Refined score: {refined.score}")
    logger.info(f"Alternative refined score: {alt_refined.score}")
    logger.info(f"Synthesized score: {synthesized.score}")

    # Print summary
    print("\n" + "=" * 80)
    print("ITERAI WORKFLOW SUMMARY")
    print("=" * 80)
    print(f"\nOriginal prompt: {user_prompt}\n")
    print(f"Root node ({root.id}):")
    print(f"  Plan steps: {len(root.plan)}")
    print(f"  Output: {root.output}")
    print(f"  Score: {root.score}\n")

    print(f"Refined node ({refined.id}):")
    print(f"  Plan steps: {len(refined.plan)}")
    print(f"  Output: {refined.output}")
    print(f"  Score: {refined.score}\n")

    print(f"Alternative refined node ({alt_refined.id}):")
    print(f"  Plan steps: {len(alt_refined.plan)}")
    print(f"  Output: {alt_refined.output}")
    print(f"  Score: {alt_refined.score}\n")

    print(f"Plan Comparison ({diff_comp} mode):")
    print(f"  {plan_diff}\n")

    print(f"Synthesized node ({synthesized.id}):")
    print(f"  Plan steps: {len(synthesized.plan)}")
    print(f"  Output: {synthesized.output}")
    print(f"  Score: {synthesized.score}\n")
    print("=" * 80)
    print(f"Graph stored at: {iterai.dag.storage.path}")
    print("=" * 80)


def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="IterAI - Iterative refinement and synthesis of LLM outputs",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Basic usage with default settings
  iterai --user-prompt "Write a technical blog post about async Python"

  # With custom system prompt and storage path
  iterai --user-prompt "Explain neural networks" \\
         --system-prompt "You are a patient teacher" \\
         --path ./my-project

  # With debug logging and color
  iterai --user-prompt "Write a haiku" \\
         --log-level debug \\
         --colorize

Note: This CLI demonstrates IterAI's core workflow - create, refine, synthesize, evaluate.
      For production use, import IterAI as a library in your Python code.
        """,
    )

    parser.add_argument(
        "--demo",
        action="store_true",
        help="Run the demonstration workflow (create, refine, synthesize, evaluate)",
    )

    parser.add_argument(
        "--user-prompt",
        type=str,
        required=False,
        help="The initial user prompt for content generation (required with --demo)",
    )

    parser.add_argument(
        "--system-prompt",
        type=str,
        default=None,
        help="System prompt for the LLM (uses IterAI default if not specified)",
    )

    parser.add_argument(
        "--path",
        type=str,
        default=None,
        help="Path to save the IterAI graph (defaults to ~/.config/iterai)",
    )

    parser.add_argument(
        "--log-level",
        type=str,
        default="info",
        choices=["debug", "info", "warning", "error", "critical"],
        help="Logging level (default: info)",
    )

    parser.add_argument(
        "--colorize",
        action="store_true",
        help="Enable colored logging output (requires colorama)",
    )

    parser.add_argument(
        "--diff-comp",
        type=str,
        default="simple",
        choices=["simple", "llm"],
        help="Plan comparison mode: 'simple' for text diff, 'llm' for semantic analysis (default: simple)",
    )

    args = parser.parse_args()

    configure_logging(args.log_level, args.colorize)

    if not args.user_prompt:
        parser.error("--user-prompt is required when using --demo")

    if args.demo:
        try:
            asyncio.run(
                demo_basic_workflow(
                    user_prompt=args.user_prompt,
                    system_prompt=args.system_prompt,
                    storage_path=args.path,
                    diff_comp=args.diff_comp,
                )
            )
        except Exception as e:
            logger.error(f"Workflow failed: {e}", exc_info=True)
            sys.exit(1)
    else:
        print("IterAI - Iterative refinement and synthesis of LLM outputs")
        print("\nTo run the demonstration workflow, use:")
        print('  iterai --demo --user-prompt "Your prompt here"\n')
        print("For more information, run:")
        print("  iterai --help")
        sys.exit(0)


if __name__ == "__main__":
    main()
