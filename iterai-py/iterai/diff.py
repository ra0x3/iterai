import difflib
import logging

logger = logging.getLogger(__name__)


def generic_diff(a: str, b: str) -> str:
    return "".join(
        difflib.unified_diff(
            a.splitlines(keepends=True),
            b.splitlines(keepends=True),
            fromfile="A",
            tofile="B",
        )
    )


def git_diff(a: str, b: str, color=True):
    diff = generic_diff(a, b)
    if color:
        lines = []
        for line in diff.split("\n"):
            if line.startswith("+") and not line.startswith("+++"):
                lines.append(f"\033[32m{line}\033[0m")
            elif line.startswith("-") and not line.startswith("---"):
                lines.append(f"\033[31m{line}\033[0m")
            else:
                lines.append(line)
        diff = "\n".join(lines)
    logger.info(diff)


def compare_plan(plan_a: str, plan_b: str) -> str:
    return generic_diff(plan_a, plan_b)
