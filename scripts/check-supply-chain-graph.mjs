#!/usr/bin/env node
/**
 * CI / production guard for the AI supply-chain knowledge graph.
 *
 * Re-runs the generator pipeline in-memory and asserts that:
 *   1. the output still passes the core `validateGraph` schema (nothing dropped), and
 *   2. the committed docs/ai-supply-chain/knowledge-graph.json is byte-identical
 *      to a fresh generation (i.e. nobody hand-edited it and it isn't stale).
 *
 * The generator is fully deterministic (no Date.now()/Math.random()), so a
 * regeneration must reproduce the committed file exactly. Exits non-zero on
 * any drift or validation failure.
 *
 * Usage: node scripts/check-supply-chain-graph.mjs
 *   (requires core built: pnpm --filter @understand-anything/core build)
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildGraph } from "./generate-supply-chain-graph.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const GRAPH_PATH = resolve(REPO_ROOT, "docs/ai-supply-chain/knowledge-graph.json");

function fail(msg) {
  console.error(`✗ supply-chain graph check FAILED: ${msg}`);
  process.exit(1);
}

// 1. Schema validation against the real core validator.
const schemaUrl = pathToFileURL(
  resolve(REPO_ROOT, "understand-anything-plugin/packages/core/dist/schema.js")
);
let validateGraph;
try {
  ({ validateGraph } = await import(schemaUrl.href));
} catch (err) {
  fail(`core not built (${err.message}). Run: pnpm --filter @understand-anything/core build`);
}

const graph = buildGraph();
const result = validateGraph(graph);
const dropped = result.issues.filter((i) => i.level === "dropped");
if (!result.success) fail(`schema invalid — ${result.fatal ?? "see issues"}`);
if (dropped.length > 0) fail(`${dropped.length} node/edge(s) would be dropped:\n  ${dropped.map((i) => i.message).join("\n  ")}`);

// 2. Drift check: committed file must equal a fresh, deterministic generation.
let committed;
try {
  committed = readFileSync(GRAPH_PATH, "utf8");
} catch {
  fail(`missing ${GRAPH_PATH}. Run: pnpm graph:supply-chain`);
}
const fresh = JSON.stringify(graph, null, 2);
if (committed.trim() !== fresh.trim()) {
  fail(
    "committed knowledge-graph.json is stale or hand-edited.\n" +
      "  Regenerate with: pnpm graph:supply-chain"
  );
}

console.log(
  `✓ supply-chain graph OK — ${graph.nodes.length} nodes, ${graph.edges.length} edges, ` +
    `${graph.layers.length} layers; schema valid, no drift.`
);
