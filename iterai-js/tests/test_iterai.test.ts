import { describe, it, expect, beforeEach, vi } from "vitest";
import { webcrypto } from "node:crypto";

vi.mock("../src/llm.js", async () => {
  const { Step } = await import("../src/types.js");
  const makeSteps = (planText: string) =>
    planText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, idx) => {
        const cleaned = line.replace(/^[0-9]+[.)]?\s*/, "").trim();
        return new Step(idx + 1, cleaned || `Step ${idx + 1}`);
      });

  return {
    generatePlan: vi.fn(async (_model: string, userPrompt: string) => {
      return [
        `1. Understand ${userPrompt}`,
        `2. Draft answer for ${userPrompt}`,
        "3. Review the result",
      ].join("\n");
    }),
    generateSteps: vi.fn(async (_model: string, planText: string) => {
      const steps = makeSteps(planText);
      return steps.length > 0
        ? steps
        : [new Step(1, `Plan for ${planText.trim() || "task"}`)];
    }),
    generateOutput: vi.fn(async (model: string, prompt: string) => {
      return `Output(${model}): ${prompt}`;
    }),
    comparePlansLLM: vi.fn(async (planA, planB) => {
      return `Compared ${planA.length} vs ${planB.length}`;
    }),
  };
});

import {
  version,
  Config,
  DEFAULT_CONFIG,
  genericDiff,
  comparePlan,
  Node,
  Step,
  Storage,
  DAG,
  IterAI,
  ImprovementType,
  setGlobalConfig,
} from "../src/index.js";
import type { NodeData } from "../src/node.js";

if (!globalThis.crypto) {
  (globalThis as any).crypto = webcrypto;
}

const createLocalStorage = () => {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
  };
};

const localStorageMock = createLocalStorage();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: localStorageMock,
});

const createStoragePath = () => `iterai-test-${crypto.randomUUID()}`;

beforeEach(() => {
  localStorageMock.clear();
  vi.clearAllMocks();
  setGlobalConfig(new Config());
});

describe("iterai-js parity tests", () => {
  it("test_version_present", () => {
    expect(typeof version).toBe("string");
    expect(version.length).toBeGreaterThan(0);
  });

  it("test_config_defaults", () => {
    const cfg = new Config();
    expect(cfg.get("models.default")).toBe(DEFAULT_CONFIG.models.default);
    expect(cfg.get("storage.path")).toBe(DEFAULT_CONFIG.storage.path);

    cfg.set("storage.path", "custom-path");
    expect(cfg.get("storage.path")).toBe("custom-path");
  });

  it("test_generic_diff_simple", () => {
    const diff = genericDiff("hello\n", "hello\nworld\n");
    expect(diff).toContain("+world");
    const hasHeaders =
      diff.includes("--- comparison") ||
      diff.includes("+++ comparison") ||
      diff.includes("--- A") ||
      diff.includes("+++ B");
    expect(hasHeaders).toBe(true);
  });

  it("test_compare_plan_non_empty", () => {
    const diff = comparePlan("plan a", "plan b");
    expect(typeof diff).toBe("string");
    expect(diff.length).toBeGreaterThan(0);
  });

  it("test_node_save_and_load", () => {
    const storage = new Storage(createStoragePath());
    const node = new Node(
      "u",
      "s",
      "m",
      [],
      ImprovementType.STANDARD,
    );
    node.output = "out";
    node.plan = [
      new Step(1, "First step"),
      new Step(2, "Second step"),
    ];
    node.diff = "diff";
    node.score = 0.75;
    node.metadata = { k: "v" };

    storage.saveNode(node.id, node.toDict());
    const loadedData = storage.loadNode(node.id) as NodeData;
    expect(loadedData).not.toBeNull();

    const loaded = Node.fromDict(loadedData);
    expect(loaded.id).toBe(node.id);
    expect(loaded.output).toBe("out");
    expect(Array.isArray(loaded.plan)).toBe(true);
    expect(loaded.plan.length).toBe(2);
    expect(loaded.plan.every((s) => s instanceof Step)).toBe(true);
    expect(loaded.type).toBe(node.type);
    expect(loaded.metadata).toEqual({ k: "v" });
  });

  it("test_storage_graph_and_node_exists", () => {
    const storage = new Storage(createStoragePath());
    const graph = { nodes: {}, edges: [] };
    storage.saveGraph(graph);
    expect(storage.loadGraph()).toEqual(graph);

    const node = new Node("x");
    storage.saveNode(node.id, node.toDict());
    expect(storage.nodeExists(node.id)).toBe(true);
  });

  it("test_dag_plan_and_output_generation", async () => {
    const dag = new DAG(createStoragePath());

    const node = new Node(
      "Write a one-sentence greeting.",
      "",
      "gpt-4o-mini",
    );
    dag.addNode(node);
    await dag.generateNode(node);

    expect(Array.isArray(node.plan)).toBe(true);
    expect(node.plan.length).toBeGreaterThan(0);
    expect(node.plan.every((s) => s instanceof Step)).toBe(true);
    expect(typeof node.output).toBe("string");
    expect(node.output.length).toBeGreaterThan(0);
    expect(node.plan.map((s) => s.text).join("\n")).not.toBe(node.output);
  });

  it("test_node_steps_parse_from_plan", () => {
    const node = new Node("u");
    node.plan = [
      new Step(1, "Gather requirements"),
      new Step(2, "Draft outline"),
      new Step(3, "Write first pass"),
    ];

    const steps = node.steps();
    expect(Array.isArray(steps)).toBe(true);
    expect(steps.length).toBe(3);
    expect(steps.every((s) => s instanceof Step)).toBe(true);
    expect(steps.map((s) => s.order)).toEqual([1, 2, 3]);
    expect(steps[0].text).toBe("Gather requirements");
  });

  it("test_dag_steps_generation_and_persistence", async () => {
    const storagePath = createStoragePath();
    const dag = new DAG(storagePath);

    const node = new Node(
      "Write three concrete steps to brew coffee.",
      "",
      "gpt-4o-mini",
    );
    dag.addNode(node);
    await dag.generateNode(node);

    const steps = node.steps();
    expect(Array.isArray(steps)).toBe(true);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.every((s) => s instanceof Step)).toBe(true);
    expect(steps.map((s) => s.order)).toEqual(
      Array.from({ length: steps.length }, (_, idx) => idx + 1),
    );
    expect(steps.every((s) => typeof s.text === "string" && s.text.trim().length > 0)).toBe(
      true,
    );

    dag.storage.saveNode(node.id, node.toDict());
    const loadedData = dag.storage.loadNode(node.id) as NodeData;
    const loaded = Node.fromDict(loadedData);
    const loadedSteps = loaded.steps();
    expect(Array.isArray(loadedSteps)).toBe(true);
    expect(loadedSteps.length).toBeGreaterThan(0);
    expect(loadedSteps.every((s) => s instanceof Step)).toBe(true);
  });

  it("test_dag_standard_edge_and_diff", async () => {
    const dag = new DAG(createStoragePath());

    const parent = new Node("Say hello.", "", "gpt-4o-mini");
    dag.addNode(parent);
    await dag.generateNode(parent);

    const child = new Node(
      "Make it more enthusiastic.",
      "",
      "gpt-4o-mini",
    );
    dag.addEdge(child, parent);
    await dag.generateNode(child);

    (dag as any).computeDiffs();

    expect(child.type).toBe(ImprovementType.STANDARD);
    expect(child.parent_ids).toContain(parent.id);
    expect(parent.children).toContain(child.id);
    expect(typeof child.diff).toBe("string");
    expect(child.diff.length).toBeGreaterThan(0);
  });

  it("test_dag_synthetic_edge_and_diff", async () => {
    const dag = new DAG(createStoragePath());

    const p1 = new Node("Write a tagline about speed.", "", "gpt-4o-mini");
    const p2 = new Node(
      "Write a tagline about reliability.",
      "",
      "gpt-4o-mini",
    );
    dag.addNode(p1);
    dag.addNode(p2);
    await dag.generateNode(p1);
    await dag.generateNode(p2);

    const synth = new Node(
      "Combine the best of both.",
      "",
      "gpt-4o-mini",
    );
    dag.addEdge(synth, [p1, p2]);
    await dag.generateNode(synth);

    (dag as any).computeDiffs();

    expect(synth.type).toBe(ImprovementType.SYNTHETIC);
    expect(new Set(synth.parent_ids)).toEqual(new Set([p1.id, p2.id]));
    expect(p1.children).toContain(synth.id);
    expect(p2.children).toContain(synth.id);
    expect(typeof synth.diff).toBe("string");
    expect(synth.diff.length).toBeGreaterThan(0);
  });

  it("test_graph_persistence_and_reload", async () => {
    const storagePath = createStoragePath();
    const dag = new DAG(storagePath);

    const parent = new Node("A.", "", "gpt-4o-mini");
    dag.addNode(parent);
    await dag.generateNode(parent);

    const child = new Node("B.", "", "gpt-4o-mini");
    dag.addEdge(child, parent);
    await dag.generateNode(child);

    (dag as any).computeDiffs();
    (dag as any).persistAll();

    const dag2 = new DAG(storagePath);
    const p2 = dag2.getNode(parent.id);
    const c2 = dag2.getNode(child.id);

    expect(p2).not.toBeUndefined();
    expect(c2).not.toBeUndefined();
    expect(c2!.parent_ids).toContain(parent.id);
    expect(p2!.children).toContain(child.id);
  });

  it("test_iterai_end_to_end_standard_and_synthetic", async () => {
    const storagePath = createStoragePath();
    const it = new IterAI(storagePath);

    const r1 = await it.createRoot(
      "Write a playful sentence about speed.",
      "gpt-4o-mini",
    );
    const r2 = await it.createRoot(
      "Write a reassuring sentence about reliability.",
      "gpt-4o-mini",
    );

    expect(Array.isArray(r1.plan) && r1.plan.length > 0).toBe(true);
    expect(r1.plan.every((s) => s instanceof Step)).toBe(true);
    expect(typeof r1.output).toBe("string");
    expect(r1.output.length).toBeGreaterThan(0);

    const refined = await it.refine(
      r1,
      "gpt-4o-mini",
      "Make it more concise.",
    );
    expect(refined.type).toBe(ImprovementType.STANDARD);
    expect(refined.parent_ids).toEqual([r1.id]);
    expect(typeof refined.diff).toBe("string");

    const synth = await it.synthesize(
      [r1, r2],
      "gpt-4o-mini",
      "Combine both ideas elegantly.",
    );
    expect(synth.type).toBe(ImprovementType.SYNTHETIC);
    expect(new Set(synth.parent_ids)).toEqual(new Set([r1.id, r2.id]));
    expect(typeof synth.diff).toBe("string");
  });
});
