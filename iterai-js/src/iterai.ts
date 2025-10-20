import { DAG } from "./dag.js";
import { Node } from "./node.js";
import { getConfig, Config } from "./config.js";
import { generateOutput } from "./llm.js";
import { ImprovementType } from "./types.js";

/**
 * Main IterAI class for iterative refinement workflows
 */
export class IterAI {
  public dag: DAG;
  public config: Config;
  private apiKey?: string;
  private baseUrl?: string;

  constructor(storagePath?: string, apiKey?: string, baseUrl?: string) {
    this.dag = new DAG(storagePath);
    this.config = getConfig();
    this.apiKey = apiKey || this.config.get("api.openai_key");
    this.baseUrl =
      baseUrl || this.config.get("api.base_url", "https://api.openai.com/v1");
  }

  async createRoot(
    userPrompt: string,
    model?: string,
    systemPrompt: string = "",
  ): Promise<Node> {
    model = model || this.config.get("models.default", "gpt-4o");
    systemPrompt =
      systemPrompt || this.config.get("system_prompt_template", "");

    const node = new Node(
      userPrompt,
      systemPrompt,
      model,
      [],
      ImprovementType.STANDARD,
    );

    this.dag.addNode(node);
    await this.dag.generateNode(node, this.apiKey, this.baseUrl);
    this.dag.storage.saveNode(node.id, node.toDict());
    this.dag["saveGraph"]();

    return node;
  }

  async refine(
    parent: Node,
    model?: string,
    userPrompt: string = "",
    systemPrompt: string = "",
  ): Promise<Node> {
    model = model || this.config.get("models.default", "gpt-4o");
    systemPrompt =
      systemPrompt || this.config.get("system_prompt_template", "");

    const node = new Node(
      userPrompt,
      systemPrompt,
      model,
      [parent.id],
      ImprovementType.STANDARD,
    );

    this.dag.addEdge(node, parent);
    await this.dag.generateNode(node, this.apiKey, this.baseUrl);
    this.dag["computeDiffs"]();
    this.dag.storage.saveNode(node.id, node.toDict());
    this.dag["saveGraph"]();

    return node;
  }

  async synthesize(
    parents: Node[],
    model?: string,
    userPrompt: string = "Combine the best insights from all versions",
    systemPrompt: string = "",
  ): Promise<Node> {
    model = model || this.config.get("models.default", "gpt-4o");
    systemPrompt =
      systemPrompt || this.config.get("system_prompt_template", "");

    const node = new Node(
      userPrompt,
      systemPrompt,
      model,
      parents.map((p) => p.id),
      ImprovementType.SYNTHETIC,
    );

    this.dag.addEdge(node, parents);
    await this.dag.generateNode(node, this.apiKey, this.baseUrl);
    this.dag["computeDiffs"]();
    this.dag.storage.saveNode(node.id, node.toDict());
    this.dag["saveGraph"]();

    return node;
  }

  async evaluateNode(node: Node, evalModel?: string): Promise<void> {
    evalModel = evalModel || "gpt-4o-mini";
    const evalPrompt = `Rate the following text on a scale from 0 to 1, where 1 is excellent. Respond with only the number.\n\n${node.output}`;

    const scoreText = await generateOutput(
      evalModel,
      evalPrompt,
      "",
      this.apiKey,
      this.baseUrl,
    );
    try {
      node.score = parseFloat(scoreText.trim());
    } catch {
      node.score = null;
    }

    this.dag.storage.saveNode(node.id, node.toDict());
  }

  async evaluateAll(nodes: Node[], evalModel?: string): Promise<void> {
    const maxTasks = this.config.get("concurrency.max_tasks", 8);
    const batches: Node[][] = [];
    for (let i = 0; i < nodes.length; i += maxTasks) {
      batches.push(nodes.slice(i, i + maxTasks));
    }

    for (const batch of batches) {
      await Promise.all(
        batch.map((node) => this.evaluateNode(node, evalModel)),
      );
    }
  }
}
