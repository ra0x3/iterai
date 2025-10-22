import { Node } from "./node.js";
import { Storage } from "./storage.js";
import { getConfig, ModelProvider } from "./config.js";
import { generateOutput, generatePlan, generateSteps } from "./llm.js";
import { genericDiff } from "./diff.js";
import { ImprovementType } from "./types.js";

/**
 * Directed Acyclic Graph for managing iterative refinements
 */
export class DAG {
  public nodes: Map<string, Node>;
  public storage: Storage;

  constructor(storagePath?: string) {
    this.nodes = new Map();
    this.storage = new Storage(storagePath);
    this.loadGraph();
  }

  private loadGraph(): void {
    const graphData = this.storage.loadGraph();
    for (const nodeIdStr of Object.keys(graphData.nodes)) {
      if (this.storage.nodeExists(nodeIdStr)) {
        const loadedData = this.storage.loadNode(nodeIdStr);
        if (loadedData) {
          this.nodes.set(nodeIdStr, Node.fromDict(loadedData));
        }
      }
    }
  }

  private saveGraph(): void {
    const graphData = {
      nodes: Object.fromEntries(
        Array.from(this.nodes.entries()).map(([id, node]) => [
          id,
          node.toDict(),
        ]),
      ),
      edges: Array.from(this.nodes.values()).flatMap((node) =>
        node.parent_ids.map((pid) => ({ from: pid, to: node.id })),
      ),
    };
    this.storage.saveGraph(graphData);
  }

  addNode(node: Node): void {
    this.nodes.set(node.id, node);
    for (const parentId of node.parent_ids) {
      const parent = this.nodes.get(parentId);
      if (parent && !parent.children.includes(node.id)) {
        parent.children.push(node.id);
      }
    }
  }

  addEdge(child: Node, parent: Node | Node[]): void {
    const parents = Array.isArray(parent) ? parent : [parent];
    child.parent_ids = parents.map((p) => p.id);
    if (parents.length > 1) {
      child.type = ImprovementType.SYNTHETIC;
    }
    this.addNode(child);
    for (const p of parents) {
      if (!p.children.includes(child.id)) {
        p.children.push(child.id);
      }
    }
  }

  getNode(nodeId: string): Node | undefined {
    return this.nodes.get(nodeId);
  }

  resultFor(node: Node): string {
    return node.output;
  }

  async evaluate(): Promise<void> {
    const tasks: Promise<void>[] = [];
    for (const node of this.nodes.values()) {
      if (!node.output && node.user_prompt) {
        tasks.push(this.generateNode(node));
      }
    }
    if (tasks.length > 0) {
      await Promise.all(tasks);
    }
    this.computeDiffs();
    this.persistAll();
  }

  async generateNode(
    node: Node,
    apiKey?: string,
    baseUrl?: string,
  ): Promise<void> {
    const config = getConfig();
    const model = node.model || config.get("models.default", "gpt-4o");
    const systemPrompt =
      node.system_prompt || config.get("system_prompt_template", "");

    const registry = config.get("models.registry", {} as Record<string, any>);
    if (registry?.[model]?.provider && !node.metadata.provider) {
      node.metadata.provider = registry[model].provider;
    }
    const provider = node.metadata.provider as ModelProvider | undefined;

    const planText = await generatePlan(
      model,
      node.user_prompt,
      systemPrompt,
      apiKey,
      baseUrl,
      provider,
    );
    const steps = await generateSteps(
      model,
      planText,
      systemPrompt,
      apiKey,
      baseUrl,
      provider,
    );
    node.plan = steps;

    let fullPrompt = node.user_prompt;
    if (node.parent_ids.length > 0) {
      const parentOutputs = node.parent_ids
        .map((pid) => this.nodes.get(pid)?.output)
        .filter((o) => o);
      if (parentOutputs.length > 0) {
        fullPrompt = `Previous version(s):\n\n${parentOutputs.join("\n\n---\n\n")}`;
        fullPrompt += `\n\nTask: ${node.user_prompt}`;
      }
    }

    node.output = await generateOutput(
      model,
      fullPrompt,
      systemPrompt,
      apiKey,
      baseUrl,
      provider,
    );
    node.model = model;
  }

  private computeDiffs(): void {
    for (const node of this.nodes.values()) {
      if (node.parent_ids.length > 0) {
        if (node.parent_ids.length === 1) {
          const parent = this.nodes.get(node.parent_ids[0]);
          if (parent) {
            node.diff = genericDiff(parent.output, node.output);
          }
        } else {
          const combinedParent = node.parent_ids
            .map((pid) => this.nodes.get(pid)?.output || "")
            .join("\n\n---\n\n");
          node.diff = genericDiff(combinedParent, node.output);
        }
      }
    }
  }

  private persistAll(): void {
    for (const node of this.nodes.values()) {
      this.storage.saveNode(node.id, node.toDict());
    }
    this.saveGraph();
  }
}
