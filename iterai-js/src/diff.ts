import { createPatch } from "diff";

const logger = {
  info: (msg: string) => console.info(`[INFO] diff: ${msg}`),
};

/**
 * Generate a unified diff between two strings
 */
export function genericDiff(a: string, b: string): string {
  return createPatch("comparison", a, b, "A", "B");
}

/**
 * Print a diff with optional color output (for terminal)
 */
export function gitDiff(a: string, b: string, color: boolean = true): void {
  let diff = genericDiff(a, b);

  if (color && typeof window === "undefined") {
    // Node.js terminal colors
    const lines = diff.split("\n").map((line) => {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        return `\x1b[32m${line}\x1b[0m`;
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        return `\x1b[31m${line}\x1b[0m`;
      }
      return line;
    });
    diff = lines.join("\n");
  }

  logger.info(diff);
}

/**
 * Compare two plan texts
 */
export function comparePlan(planA: string, planB: string): string {
  return genericDiff(planA, planB);
}
