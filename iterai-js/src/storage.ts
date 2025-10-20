import { getConfig } from "./config.js";

const logger = {
  debug: (msg: string) => console.debug(`[DEBUG] storage: ${msg}`),
};

export interface GraphData {
  nodes: Record<string, any>;
  edges: Array<{ from: string; to: string }>;
}

/**
 * Storage abstraction for IterAI
 * Uses localStorage in browser, or in-memory fallback
 */
export class Storage {
  public path: string;
  private storageKey: string;
  private useLocalStorage: boolean;
  private memoryStore: Map<string, string>;

  constructor(storagePath?: string) {
    const finalPath =
      storagePath || getConfig().get("storage.path", "iterai-storage");
    this.path = finalPath;
    this.storageKey = `iterai:${this.path}`;
    this.useLocalStorage = typeof localStorage !== "undefined";
    this.memoryStore = new Map();
    logger.debug(`Storage initialized: ${this.path}`);
  }

  private getItem(key: string): string | null {
    if (this.useLocalStorage) {
      return localStorage.getItem(key);
    }
    return this.memoryStore.get(key) || null;
  }

  private setItem(key: string, value: string): void {
    if (this.useLocalStorage) {
      localStorage.setItem(key, value);
    } else {
      this.memoryStore.set(key, value);
    }
  }

  saveGraph(graphData: GraphData): void {
    const key = `${this.storageKey}:graph`;
    this.setItem(key, JSON.stringify(graphData));
  }

  loadGraph(): GraphData {
    const key = `${this.storageKey}:graph`;
    const data = this.getItem(key);
    if (!data) {
      return { nodes: {}, edges: [] };
    }
    try {
      return JSON.parse(data);
    } catch {
      return { nodes: {}, edges: [] };
    }
  }

  saveNode(nodeId: string, nodeData: any): void {
    const key = `${this.storageKey}:node:${nodeId}`;
    this.setItem(key, JSON.stringify(nodeData));
  }

  loadNode(nodeId: string): any | null {
    const key = `${this.storageKey}:node:${nodeId}`;
    const data = this.getItem(key);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  nodeExists(nodeId: string): boolean {
    const key = `${this.storageKey}:node:${nodeId}`;
    return this.getItem(key) !== null;
  }

  deleteNode(nodeId: string): void {
    const key = `${this.storageKey}:node:${nodeId}`;
    if (this.useLocalStorage) {
      localStorage.removeItem(key);
    } else {
      this.memoryStore.delete(key);
    }
  }

  clear(): void {
    if (this.useLocalStorage) {
      const keysToDelete: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.storageKey)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach((k) => localStorage.removeItem(k));
    } else {
      this.memoryStore.clear();
    }
  }
}
