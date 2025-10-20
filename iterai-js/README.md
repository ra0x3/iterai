# IterAI (TypeScript/JavaScript)

A local-first, graph-based LLM refinement engine with transparent planning, diff-based evolution, and multi-model synthesis.

This is the TypeScript/JavaScript port of the [IterAI Python library](../iterai).

## Features

- 🌳 **DAG-based refinement**: Create, refine, and synthesize LLM outputs in a directed acyclic graph
- 📋 **Transparent planning**: Every node generates a structured `List<Step>` plan before output
- 🔄 **Diff tracking**: Automatic diff generation between parent and child nodes
- 🔀 **Multi-model synthesis**: Combine outputs from different models or refinement strategies
- 💾 **Local-first storage**: Uses browser localStorage (or in-memory fallback)
- 🔌 **Browser & Node.js**: Works in both environments

## Installation

```bash
npm install iterai
# or
yarn add iterai
# or
pnpm add iterai
```

## Quick Start

```typescript
import { IterAI } from "iterai";

// Initialize with your OpenAI API key
const iterai = new IterAI(undefined, "your-openai-api-key");

// Create a root node
const root = await iterai.createRoot(
  "Write a technical blog post about async programming",
  "gpt-4o-mini"
);

console.log("Plan:", root.plan); // List of Step objects
console.log("Output:", root.output);

// Refine the output
const refined = await iterai.refine(
  root,
  "gpt-4o",
  "Make this more concise and punchy"
);

console.log("Diff:", refined.diff);

// Create alternative refinement
const altRefined = await iterai.refine(
  root,
  "gpt-4o",
  "Make this more technical and detailed"
);

// Synthesize both refinements
const synthesized = await iterai.synthesize(
  [refined, altRefined],
  "gpt-4o",
  "Combine clarity from first with depth from second"
);

// Evaluate all nodes
await iterai.evaluateAll([root, refined, altRefined, synthesized]);

console.log("Scores:", {
  root: root.score,
  refined: refined.score,
  altRefined: altRefined.score,
  synthesized: synthesized.score,
});
```

## Core Concepts

### Node
A node represents a single LLM generation with:
- `plan`: `Step[]` - Structured steps the LLM plans to take
- `output`: `string` - The actual generated content
- `diff`: `string` - Unified diff from parent(s)
- `score`: `number | null` - Optional quality score

### Step
A single step in a plan:
```typescript
class Step {
  order: number;
  text: string;
}
```

### DAG (Directed Acyclic Graph)
Manages the graph of nodes and their relationships:
- Tracks parent-child relationships
- Computes diffs automatically
- Persists to storage

### IterAI
Main API for creating and managing iterative workflows:
- `createRoot()` - Create initial node
- `refine()` - Create refinement of a node
- `synthesize()` - Merge multiple nodes
- `evaluateAll()` - Score nodes with LLM

## Configuration

```typescript
import { Config, setGlobalConfig } from "iterai";

const config = new Config({
  models: {
    default: "gpt-4o",
  },
  storage: {
    path: "my-project-storage",
  },
  api: {
    openai_key: "your-key-here",
    base_url: "https://api.openai.com/v1",
  },
});

setGlobalConfig(config);
```

## Plan Comparison

```typescript
// Simple text-based diff
const diff = node1.diffPlan(node2, "simple");

// LLM-based semantic comparison
const semanticDiff = await node1.diffPlanAsync(node2, "llm");
```

## Storage

The library uses browser localStorage by default. In Node.js or when localStorage is unavailable, it falls back to in-memory storage.

```typescript
// Custom storage path
const iterai = new IterAI("my-custom-storage");

// Access storage directly
iterai.dag.storage.saveNode(node.id, node.toDict());
const loadedNode = iterai.dag.storage.loadNode(node.id);
```

## Browser Extension Usage

Perfect for Chrome/Firefox extensions:

```typescript
// background.ts
import { IterAI } from "iterai";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "refine") {
    const iterai = new IterAI(undefined, request.apiKey);
    iterai.createRoot(request.prompt).then((node) => {
      sendResponse({ node: node.toDict() });
    });
    return true;
  }
});
```

## API Compatibility

This library uses OpenAI-compatible APIs. You can use it with:
- OpenAI (GPT-4, GPT-4o, etc.)
- Anthropic (via proxy)
- Local models (via LM Studio, Ollama, etc.)

Just set the `baseUrl` in config or constructor.

## License

MIT

## Related

- [Python version](../iterai) - Original Python implementation

