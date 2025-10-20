/**
 * IterAI - Iterative refinement and synthesis of LLM outputs
 *
 * A local-first, graph-based LLM refinement engine with transparent planning,
 * diff-based evolution, and multi-model synthesis.
 */

export { Node } from "./node.js";
export { Step, ImprovementType } from "./types.js";
export { DAG } from "./dag.js";
export { IterAI } from "./iterai.js";
export { Storage } from "./storage.js";
export {
  Config,
  getConfig,
  setGlobalConfig,
  DEFAULT_CONFIG,
} from "./config.js";
export { genericDiff, gitDiff, comparePlan } from "./diff.js";
export {
  generateOutput,
  generatePlan,
  generateSteps,
  comparePlansLLM,
} from "./llm.js";

export const version = "0.1.0";
