import { describe, it, expect } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildGraph, COUNTS } from "../../scripts/generate-supply-chain-graph.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");

// Import the *real* core validator from its built dist (same one the dashboard uses).
const schemaUrl = pathToFileURL(
  resolve(REPO_ROOT, "understand-anything-plugin/packages/core/dist/schema.js")
);
const { validateGraph } = await import(schemaUrl.href);

describe("AI supply-chain knowledge graph", () => {
  const graph = buildGraph();

  it("passes core validateGraph with nothing dropped", () => {
    const result = validateGraph(graph);
    expect(result.success).toBe(true);
    expect(result.fatal).toBeUndefined();
    // The graph is hand-built to be canonical: no nodes/edges should be dropped.
    expect(result.issues.filter((i) => i.level === "dropped")).toHaveLength(0);
  });

  it("has all 11 supply-chain layers, each non-empty", () => {
    expect(graph.layers).toHaveLength(COUNTS.layers);
    for (const layer of graph.layers) expect(layer.nodeIds.length).toBeGreaterThan(0);
  });

  it("has no dangling edge references", () => {
    const ids = new Set(graph.nodes.map((n) => n.id));
    for (const e of graph.edges) {
      expect(ids.has(e.source), `source ${e.source}`).toBe(true);
      expect(ids.has(e.target), `target ${e.target}`).toBe(true);
    }
  });

  it("attaches structured market data to public-company nodes", () => {
    const nvda = graph.nodes.find((n) => n.id === "co.NVDA");
    expect(nvda?.type).toBe("entity");
    expect(nvda?.market).toMatchObject({ ticker: "NVDA", ret1y: "+22%", avg: 300 });
  });

  it("models upstream/downstream: GPU depends on HBM and CoWoS", () => {
    const deps = graph.edges
      .filter((e) => e.source === "c.gpu" && e.type === "depends_on")
      .map((e) => e.target);
    expect(deps).toContain("c.hbm");
    expect(deps).toContain("c.cowos");
  });

  it("captures every ticker as a company node", () => {
    const companies = graph.nodes.filter((n) => n.id.startsWith("co."));
    expect(companies).toHaveLength(COUNTS.companies);
  });
});
