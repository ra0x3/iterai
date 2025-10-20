import { ImprovementType, Step } from "./types.js";
import { genericDiff } from "./diff.js";
import { comparePlansLLM } from "./llm.js";

export interface NodeData {
  id: string;
  parent_ids: string[];
  user_prompt: string;
  system_prompt: string;
  output: string;
  plan: Array<{ order: number; text: string }>;
  model: string;
  diff: string;
  score: number | null;
  type: string;
  children: string[];
  created_at: string;
  metadata: Record<string, any>;
}

/**
 * A node in the iterative refinement DAG
 */
export class Node {
  public id: string;
  public parent_ids: string[];
  public user_prompt: string;
  public system_prompt: string;
  public output: string;
  public plan: Step[];
  public model: string;
  public diff: string;
  public score: number | null;
  public type: ImprovementType;
  public children: string[];
  public created_at: Date;
  public metadata: Record<string, any>;

  constructor(
    userPrompt: string = "",
    systemPrompt: string = "",
    model: string = "",
    parentIds: string[] = [],
    improvementType: ImprovementType = ImprovementType.STANDARD,
    nodeId?: string,
  ) {
    this.id = nodeId || crypto.randomUUID();
    this.parent_ids = parentIds;
    this.user_prompt = userPrompt;
    this.system_prompt = systemPrompt;
    this.output = "";
    this.plan = [];
    this.model = model;
    this.diff = "";
    this.score = null;
    this.type = improvementType;
    this.children = [];
    this.created_at = new Date();
    this.metadata = {};
  }

  toDict(): NodeData {
    return {
      id: this.id,
      parent_ids: this.parent_ids,
      user_prompt: this.user_prompt,
      system_prompt: this.system_prompt,
      output: this.output,
      plan: this.plan.map((s) => s.toDict()),
      model: this.model,
      diff: this.diff,
      score: this.score,
      type: this.type,
      children: this.children,
      created_at: this.created_at.toISOString(),
      metadata: this.metadata,
    };
  }

  static fromDict(data: NodeData): Node {
    const node = new Node(
      data.user_prompt,
      data.system_prompt,
      data.model,
      data.parent_ids,
      data.type as ImprovementType,
      data.id,
    );
    node.output = data.output;
    node.plan = (data.plan || []).map((sd) => Step.fromDict(sd));
    node.diff = data.diff;
    node.score = data.score;
    node.children = data.children;
    node.created_at = new Date(data.created_at);
    node.metadata = data.metadata;
    return node;
  }

  steps(): Step[] {
    return this.plan;
  }

  /**
   * Compare this node's plan with another node's plan
   */
  diffPlan(
    other: Node,
    mode: "simple" | "llm" = "simple",
  ): string | Promise<string> {
    if (mode === "llm") {
      return this.diffPlanAsync(other, mode);
    }
    const selfText = this.plan.map((s) => `${s.order}. ${s.text}`).join("\n");
    const otherText = other.plan.map((s) => `${s.order}. ${s.text}`).join("\n");
    return genericDiff(selfText, otherText);
  }

  /**
   * Async version of diffPlan for LLM mode
   */
  async diffPlanAsync(
    other: Node,
    mode: "simple" | "llm" = "simple",
  ): Promise<string> {
    if (mode === "llm") {
      return await comparePlansLLM(this.plan, other.plan);
    }
    const selfText = this.plan.map((s) => `${s.order}. ${s.text}`).join("\n");
    const otherText = other.plan.map((s) => `${s.order}. ${s.text}`).join("\n");
    return genericDiff(selfText, otherText);
  }
}
