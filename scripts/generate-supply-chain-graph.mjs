#!/usr/bin/env node
/**
 * Generate the AI supply-chain knowledge graph.
 *
 * This is the *same logic* as docs/ai-supply-chain/README.md (the 11-layer
 * supply chain: components, companies, upstream/downstream relationships,
 * bottlenecks, frontier R&D, and 1-year stock data) — but expressed as code,
 * emitted as an understand-anything knowledge graph that the dashboard can load.
 *
 * It is built the way this repo builds agent pipelines: a sequence of small
 * "builder" stages, each owning one slice of the graph, then assembled and
 * validated. The stage → agent mapping:
 *
 *   defineLayers()          ~ project-scanner        (discover the structure/layers)
 *   buildComponentNodes()   ~ file-analyzer          (analyze each unit in a layer)
 *   buildCompanyNodes()     ~ domain-analyzer        (entities/actors in the domain)
 *   buildSupplyEdges()      ~ architecture-analyzer  (relationships between units)
 *   buildClaimNodes()       ~ (knowledge claims: bottlenecks + investment theses)
 *   buildTour()             ~ tour-builder           (a guided walkthrough)
 *   assemble() + validate() ~ assemble-reviewer / graph-reviewer
 *
 * Usage:
 *   node scripts/generate-supply-chain-graph.mjs
 *   node scripts/generate-supply-chain-graph.mjs --out .understand-anything/knowledge-graph.json
 *
 * Default output: docs/ai-supply-chain/knowledge-graph.json
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

// ── Domain data ────────────────────────────────────────────────────────────
// The 11 layers, top (upstream) → bottom (downstream). Each layer becomes both
// a `topic` hub node and a `layers[]` grouping.
const LAYERS = [
  { key: "materials",  name: "① 底层工具 / 材料",   desc: "EDA、半导体设备、电子材料、IP —— 垄断最强、毛利最高" },
  { key: "fab",        name: "② 芯片制造",          desc: "晶圆代工、CoWoS 先进封装、载板、封测 —— 当前最硬的瓶颈" },
  { key: "compute",    name: "③ 计算芯片",          desc: "GPU / ASIC / CPU / DPU —— 算力大脑" },
  { key: "memory",     name: "④ 存储",              desc: "HBM / DRAM / NAND —— 算力的记忆，周期+成长共振最强" },
  { key: "network",    name: "⑤ 网络互联",          desc: "交换芯片 / 光模块 / CPO / 铜连接 —— 把几万张卡连起来" },
  { key: "hardware",   name: "⑥ 硬件系统",          desc: "PCB / 被动件(MLCC) / 服务器机柜 —— 组装成系统" },
  { key: "power",      name: "⑦ 电力全链",          desc: "发电→输配→变压器→机房供电→储能 —— AI 扩张的物理天花板" },
  { key: "cooling",    name: "⑧ 散热全链",          desc: "液冷 / 风冷 / 暖通 / 导热材料 —— 功耗暴增后的刚需" },
  { key: "datacenter", name: "⑨ 数据中心基建",      desc: "IDC / 机电工程 —— 有电有地即壁垒" },
  { key: "cloud",      name: "⑩ 云 & 模型",         desc: "超大规模云 + 大模型 —— 需求发动机、Capex 总开关" },
  { key: "app",        name: "⑪ 应用 & 端侧",       desc: "AI 应用 / Agent / 机器人 —— 最长的雪坡" },
];

// Components (concept nodes). slug is unique; `frontier` marks in-development tech.
const COMPONENTS = [
  { layer: "materials",  slug: "eda",         name: "EDA 工具",        cx: "complex",  tags: ["垄断"] },
  { layer: "materials",  slug: "equipment",   name: "半导体设备",      cx: "complex",  tags: ["垄断", "EUV"] },
  { layer: "materials",  slug: "materials",   name: "电子材料",        cx: "moderate", tags: ["硅片", "光刻胶", "陶瓷粉"] },
  { layer: "fab",        slug: "foundry",     name: "晶圆代工",        cx: "complex",  tags: ["台积电"] },
  { layer: "fab",        slug: "cowos",       name: "CoWoS 先进封装",  cx: "complex",  tags: ["瓶颈", "台积电独家"] },
  { layer: "fab",        slug: "glass-sub",   name: "玻璃基板",        cx: "complex",  tags: ["前沿"], frontier: true },
  { layer: "fab",        slug: "bridge-pkg",  name: "桥接封装 / 硅桥", cx: "complex",  tags: ["前沿", "EMIB"], frontier: true },
  { layer: "fab",        slug: "substrate",   name: "ABF 载板",        cx: "moderate", tags: [] },
  { layer: "compute",    slug: "gpu",         name: "GPU",             cx: "complex",  tags: ["NVIDIA", "CUDA"] },
  { layer: "compute",    slug: "asic",        name: "ASIC / 自研芯片", cx: "complex",  tags: ["去NVIDIA化"] },
  { layer: "compute",    slug: "cpu",         name: "服务器 CPU",      cx: "moderate", tags: [] },
  { layer: "memory",     slug: "hbm",         name: "HBM 高带宽内存",  cx: "complex",  tags: ["瓶颈", "sold-out"] },
  { layer: "memory",     slug: "dram",        name: "服务器 DRAM",     cx: "moderate", tags: ["周期"] },
  { layer: "memory",     slug: "nand",        name: "企业级 NAND/SSD", cx: "moderate", tags: ["推理增量"] },
  { layer: "network",    slug: "switch",      name: "交换芯片",        cx: "complex",  tags: ["博通"] },
  { layer: "network",    slug: "optical",     name: "光模块 800G/1.6T", cx: "complex", tags: ["主升浪"] },
  { layer: "network",    slug: "cpo",         name: "CPO / 硅光",      cx: "complex",  tags: ["前沿"], frontier: true },
  { layer: "network",    slug: "copper",      name: "铜连接 / NVLink", cx: "moderate", tags: [] },
  { layer: "hardware",   slug: "pcb",         name: "高多层 PCB / CCL", cx: "moderate", tags: [] },
  { layer: "hardware",   slug: "mlcc",        name: "MLCC 多层陶瓷电容", cx: "moderate", tags: ["瓶颈", "被动件"] },
  { layer: "hardware",   slug: "server",      name: "服务器 / 机柜",   cx: "moderate", tags: ["ODM"] },
  { layer: "power",      slug: "transformer", name: "电力变压器",      cx: "moderate", tags: ["瓶颈", "交付1-2年"] },
  { layer: "power",      slug: "gas-turbine", name: "燃气轮机",        cx: "complex",  tags: ["发电"] },
  { layer: "power",      slug: "psu",         name: "数据中心电源",    cx: "moderate", tags: ["±400V", "母线"] },
  { layer: "power",      slug: "smr",         name: "SMR 小型核电",    cx: "complex",  tags: ["前沿", "远水"], frontier: true },
  { layer: "power",      slug: "storage",     name: "储能 BESS",       cx: "moderate", tags: ["备电"] },
  { layer: "cooling",    slug: "coldplate",   name: "冷板液冷",        cx: "moderate", tags: ["主流", "必选"] },
  { layer: "cooling",    slug: "immersion",   name: "浸没 / 两相液冷", cx: "complex",  tags: ["前沿"], frontier: true },
  { layer: "cooling",    slug: "tim",         name: "导热材料 TIM",    cx: "simple",   tags: [] },
  { layer: "datacenter", slug: "idc",         name: "IDC / 机电工程",  cx: "moderate", tags: ["有电有地"] },
  { layer: "cloud",      slug: "hyperscaler", name: "超大规模云",      cx: "complex",  tags: ["Capex总开关"] },
  { layer: "cloud",      slug: "model",       name: "大模型",          cx: "complex",  tags: ["ROI分歧"] },
  { layer: "app",        slug: "agent",       name: "AI 应用 / Agent", cx: "moderate", tags: ["推理来源"] },
  { layer: "app",        slug: "edge",        name: "端侧 / 机器人",   cx: "complex",  tags: ["最长雪坡"], frontier: true },
];

// Companies (entity nodes). `produces` = component slug. `market` = 1yr stock data
// (approx, ~2026-07-04, from public sources) attached as a passthrough field.
const COMPANIES = [
  { ticker: "NVDA",      name: "英伟达 NVIDIA",   produces: "gpu",         market: { price: 194, ret1y: "+22%",  low: 210,  high: 500,  avg: 300,  upside: "+55%" } },
  { ticker: "AVGO",      name: "博通 Broadcom",   produces: "asic",        market: { price: 361, ret1y: "+80%",  low: 375,  high: 630,  avg: 517,  upside: "+43%" } },
  { ticker: "MRVL",      name: "迈威尔 Marvell",  produces: "asic",        market: { price: 270, ret1y: "+214%", low: 110,  high: 385,  avg: 249,  upside: "-8%" } },
  { ticker: "TSM",       name: "台积电",          produces: "foundry",     market: { price: 434, ret1y: "+45%*", low: 400,  high: 625,  avg: 490,  upside: "+13%" } },
  { ticker: "ASML",      name: "ASML",            produces: "equipment",   market: { price: 1769, ret1y: "+131%", low: 1415, high: 2345, avg: 1900, upside: "+7%" } },
  { ticker: "AMAT",      name: "应用材料",        produces: "equipment",   market: { price: 608, ret1y: "+135%", low: 500,  high: 900,  avg: 579,  upside: "-5%" } },
  { ticker: "MU",        name: "美光 Micron",     produces: "hbm",         market: { price: 976, ret1y: "+698%", low: 1100, high: 2200, avg: 1500, upside: "+54%" } },
  { ticker: "000660.KS", name: "SK 海力士",       produces: "hbm",         market: { price: null, ret1y: "+818%", low: null, high: null, avg: null, upside: "—" } },
  { ticker: "GLW",       name: "康宁 Corning",    produces: "glass-sub",   market: { price: 221, ret1y: "+391%", low: 180,  high: 270,  avg: 204,  upside: "-8%" } },
  { ticker: "COHR",      name: "Coherent",        produces: "optical",     market: { price: 369, ret1y: "+373%", low: 230,  high: 465,  avg: 388,  upside: "+5%" } },
  { ticker: "VRT",       name: "Vertiv 维谛",     produces: "coldplate",   market: { price: 305, ret1y: "+177%", low: 260,  high: 500,  avg: 381,  upside: "+25%" } },
  { ticker: "GEV",       name: "GE Vernova",      produces: "gas-turbine", market: { price: 1119, ret1y: "+146%", low: 913,  high: 1467, avg: 1212, upside: "+8%" } },
  { ticker: "ETN",       name: "伊顿 Eaton",      produces: "psu",         market: { price: 396, ret1y: "+19%",  low: 360,  high: 534,  avg: 452,  upside: "+14%" } },
  { ticker: "CEG",       name: "Constellation",   produces: "smr",         market: { price: 237, ret1y: "-22%",  low: 272,  high: 441,  avg: 372,  upside: "+57%" } },
  { ticker: "OKLO",      name: "Oklo",            produces: "smr",         market: { price: 52,  ret1y: "+9%",   low: 44,   high: 150,  avg: 95,   upside: "+83%" } },
  { ticker: "SMR",       name: "NuScale",         produces: "smr",         market: { price: 10,  ret1y: "回落",  low: 7,    high: 25,   avg: 15,   upside: "+50%" } },
  // A-share representatives (no market block embedded here)
  { ticker: "300308.SZ", name: "中际旭创",        produces: "optical",     market: null },
  { ticker: "002837.SZ", name: "英维克",          produces: "coldplate",   market: null },
  { ticker: "688676.SH", name: "金盘科技",        produces: "transformer", market: null },
];

// Upstream → downstream supply relationships (depends_on). [downstream, upstream, weight]
const SUPPLY = [
  ["foundry", "equipment", 0.9], ["foundry", "eda", 0.7], ["foundry", "materials", 0.6],
  ["cowos", "foundry", 0.9], ["glass-sub", "materials", 0.7],
  ["gpu", "cowos", 0.95], ["gpu", "hbm", 0.95], ["gpu", "foundry", 0.9], ["gpu", "substrate", 0.6],
  ["asic", "cowos", 0.8], ["asic", "hbm", 0.8], ["asic", "foundry", 0.85],
  ["hbm", "foundry", 0.8], ["hbm", "cowos", 0.7],
  ["server", "gpu", 0.9], ["server", "cpu", 0.6], ["server", "hbm", 0.7],
  ["server", "optical", 0.7], ["server", "mlcc", 0.6], ["server", "pcb", 0.6], ["server", "copper", 0.5],
  ["optical", "cpo", 0.4], ["switch", "foundry", 0.7],
  ["idc", "server", 0.9], ["idc", "transformer", 0.85], ["idc", "coldplate", 0.8], ["idc", "psu", 0.7],
  ["transformer", "materials", 0.5], ["psu", "mlcc", 0.5],
  ["idc", "gas-turbine", 0.6], ["idc", "smr", 0.4], ["idc", "storage", 0.4], ["idc", "immersion", 0.3],
  ["coldplate", "tim", 0.4],
  ["hyperscaler", "idc", 0.95], ["model", "hyperscaler", 0.9], ["agent", "model", 0.85], ["edge", "model", 0.6],
];

// Knowledge claims: bottlenecks (cite a component) + investment theses (relate components).
const CLAIMS = [
  { key: "b-cowos", name: "瓶颈：CoWoS 封装", cites: ["cowos"], cx: "complex",
    summary: "台积电独家、扩产周期长，是全链稀缺性最高的环节之一——真正卡 GPU 出货的不是晶圆而是 CoWoS。" },
  { key: "b-hbm", name: "瓶颈：HBM", cites: ["hbm"], cx: "complex",
    summary: "良率低、挤占普通 DRAM 晶圆产能、长约锁定到一年以上；HBM4 起 base die 上逻辑制程，与代工进一步绑定。" },
  { key: "b-power", name: "瓶颈：电力", cites: ["transformer", "gas-turbine"], cx: "complex",
    summary: "变压器交付拉长到 1-2 年，燃气轮机排产到 2028+；电力正成为 AI 扩张的物理天花板。" },
  { key: "b-mlcc", name: "瓶颈：高端 MLCC", cites: ["mlcc"], cx: "moderate",
    summary: "AI 服务器单板用量数倍于普通服务器，高容产能集中日厂；普通 MLCC 是周期红海。" },
  { key: "rotation", name: "洞察：瓶颈轮动", cites: ["cowos", "hbm", "transformer", "smr"], cx: "complex",
    summary: "瓶颈是移动的：GPU→CoWoS→HBM→电力→发电量/HBM4 base die/下一代封装。在轮动到来前埋伏下一环。" },
  { key: "capex", name: "总开关：大厂 Capex", cites: ["hyperscaler"], cx: "complex",
    summary: "四大云厂 + 主权 AI 的资本开支是全链最高频领先指标；上调就拿住、下修就减仓。" },
  { key: "shovels", name: "策略：优先卖铲人", cites: ["gpu", "transformer", "coldplate"], cx: "moderate",
    summary: "应用层胜负未定，但卖算力、卖电、卖散热的确定性更高。最深护城河在芯，最稳的钱在电，最快成长在冷与联。" },
  { key: "frontier-risk", name: "风险：在研主题高波动", cites: ["glass-sub", "cpo", "smr"], cx: "moderate",
    summary: "玻璃基板、CPO 有明确导入表；SMR 核电是远水，估值易透支——核电小票已从高点回撤 70-80%。买在研主题须区分‘已下订单’与‘仅有 PPT’。" },
];

// ── ID helpers ───────────────────────────────────────────────────────────
const layerId = (key) => `t.${key}`;
const compId = (slug) => `c.${slug}`;
const coId = (ticker) => `co.${ticker}`;
const claimId = (key) => `cl.${key}`;

const componentBySlug = new Map(COMPONENTS.map((c) => [c.slug, c]));

// ── Stage 1: layers (project-scanner) ──────────────────────────────────────
function defineLayers() {
  return LAYERS.map((l, i) => ({
    id: `layer-${i}`,
    key: l.key,
    name: l.name,
    description: l.desc,
    nodeIds: [], // filled during assembly
  }));
}

function buildLayerHubNodes() {
  return LAYERS.map((l) => ({
    id: layerId(l.key),
    type: "topic",
    name: l.name,
    summary: l.desc,
    tags: ["layer", l.key],
    complexity: "moderate",
  }));
}

// ── Stage 2: components (file-analyzer) ─────────────────────────────────────
function buildComponentNodes() {
  return COMPONENTS.map((c) => ({
    id: compId(c.slug),
    type: "concept",
    name: c.name,
    summary: `${LAYERS.find((l) => l.key === c.layer).name} · ${c.frontier ? "【前沿在研】" : ""}${c.name}`,
    tags: [c.layer, ...c.tags, ...(c.frontier ? ["frontier"] : [])],
    complexity: c.cx,
  }));
}

// ── Stage 3: companies (domain-analyzer) ────────────────────────────────────
function buildCompanyNodes() {
  return COMPANIES.map((co) => {
    const comp = componentBySlug.get(co.produces);
    const m = co.market;
    const marketLine = m
      ? ` 现价~$${m.price ?? "—"}，近1年 ${m.ret1y}，分析师目标 ${m.avg ? `$${m.low}-$${m.high}（均~$${m.avg}，隐含 ${m.upside}）` : "—"}。`
      : "";
    return {
      id: coId(co.ticker),
      type: "entity",
      name: `${co.name} (${co.ticker})`,
      summary: `${comp ? comp.name + "环节。" : ""}${marketLine}`.trim() || co.name,
      tags: [comp ? comp.layer : "company", co.ticker, ...(m ? [`1yr:${m.ret1y}`, `目标:${m.upside}`] : ["A股"])],
      complexity: "moderate",
      // passthrough field: structured market data survives validateGraph()
      market: m ? { ticker: co.ticker, ...m } : { ticker: co.ticker },
    };
  });
}

// ── Stage 5: claims (bottlenecks + theses) ──────────────────────────────────
function buildClaimNodes() {
  return CLAIMS.map((c) => ({
    id: claimId(c.key),
    type: "claim",
    name: c.name,
    summary: c.summary,
    tags: ["claim", ...(c.key.startsWith("b-") ? ["bottleneck"] : ["thesis"])],
    complexity: c.cx,
  }));
}

// ── Stage 4: edges (architecture-analyzer) ──────────────────────────────────
function buildEdges() {
  const edges = [];
  const push = (source, target, type, weight, direction = "forward") =>
    edges.push({ source, target, type, direction, weight });

  // component → its layer hub
  for (const c of COMPONENTS) push(compId(c.slug), layerId(c.layer), "categorized_under", 0.5);
  // company → component it produces, and company → layer hub
  for (const co of COMPANIES) {
    const comp = componentBySlug.get(co.produces);
    if (comp) {
      push(coId(co.ticker), compId(co.produces), "related", 0.7);
      push(coId(co.ticker), layerId(comp.layer), "categorized_under", 0.4);
    }
  }
  // downstream → upstream supply dependencies
  for (const [down, up, w] of SUPPLY) push(compId(down), compId(up), "depends_on", w);
  // claims cite the components they concern
  for (const c of CLAIMS) for (const slug of c.cites) push(claimId(c.key), compId(slug), "cites", 0.6);
  // thesis claims build on the bottleneck claims
  push(claimId("rotation"), claimId("b-cowos"), "builds_on", 0.5);
  push(claimId("rotation"), claimId("b-hbm"), "builds_on", 0.5);
  push(claimId("rotation"), claimId("b-power"), "builds_on", 0.5);
  push(claimId("shovels"), claimId("capex"), "builds_on", 0.5);

  return edges;
}

// ── Stage 6: tour (tour-builder) ────────────────────────────────────────────
function buildTour() {
  return [
    { order: 1, title: "主线：用电力换智能",
      description: "从硅到智能的一条长链——算力、电力、散热三处卡脖子。",
      nodeIds: [layerId("compute"), layerId("power"), layerId("cooling")] },
    { order: 2, title: "三大瓶颈：利润高地",
      description: "CoWoS、HBM、电力变压器是当前最紧的堰塞湖。",
      nodeIds: [compId("cowos"), compId("hbm"), compId("transformer"), claimId("b-cowos"), claimId("b-hbm")] },
    { order: 3, title: "算力 → 存储 → 网络",
      description: "GPU 靠 HBM 喂数据，靠光/铜互联组成集群。",
      nodeIds: [compId("gpu"), compId("hbm"), compId("optical"), compId("copper")] },
    { order: 4, title: "电力全链",
      description: "发电(燃气轮机/SMR)→变压器→机房电源→储能。",
      nodeIds: [compId("gas-turbine"), compId("transformer"), compId("psu"), compId("smr"), compId("storage")] },
    { order: 5, title: "下一个瓶颈：瓶颈轮动",
      description: "瓶颈是移动的——从 HBM 流向电力，再流向发电与下一代封装。",
      nodeIds: [claimId("rotation"), compId("smr"), compId("glass-sub")] },
    { order: 6, title: "前沿在研项目",
      description: "玻璃基板、桥接封装、CPO/硅光、浸没液冷、SMR 核电。",
      nodeIds: [compId("glass-sub"), compId("bridge-pkg"), compId("cpo"), compId("immersion"), compId("smr")] },
    { order: 7, title: "相关企业与股价",
      description: "存储/设备领涨(SK海力士/美光/ASML)，电力/液冷兑现(GEV/VRT)，核电高波动(OKLO/NuScale)。",
      nodeIds: [coId("MU"), coId("000660.KS"), coId("GEV"), coId("VRT"), coId("OKLO"), coId("NVDA")] },
    { order: 8, title: "投资逻辑：优先卖铲人",
      description: "护城河在芯、最稳在电、最快成长在冷与联；核心风险是大厂 Capex 何时降速。",
      nodeIds: [claimId("shovels"), claimId("capex"), compId("gpu"), compId("transformer"), compId("coldplate")] },
  ];
}

// ── Stage 7: assemble + validate (assemble-reviewer / graph-reviewer) ────────
function assemble(nodes, edges, layers, tour) {
  // Group every node into its layer (hub + components + companies).
  const layerByKey = new Map(layers.map((l) => [l.key, l]));
  for (const c of COMPONENTS) layerByKey.get(c.layer)?.nodeIds.push(compId(c.slug));
  for (const l of LAYERS) layerByKey.get(l.key)?.nodeIds.push(layerId(l.key));
  for (const co of COMPANIES) {
    const comp = componentBySlug.get(co.produces);
    if (comp) layerByKey.get(comp.layer)?.nodeIds.push(coId(co.ticker));
  }
  // strip the internal `key` field from layers before emitting
  const cleanLayers = layers.map(({ key: _key, ...rest }) => rest);

  return {
    version: "1.0",
    kind: "knowledge",
    project: {
      name: "AI 人工智能供应链",
      languages: [],
      frameworks: [],
      description: "AI 算力基础设施产业链的 11 层知识图谱：组件、企业、上下游关系、瓶颈、前沿在研项目与近 1 年股价（作者：钱志达；数据约 2026-07-04，仅供参考）。",
      analyzedAt: "2026-07-04T00:00:00.000Z",
      gitCommitHash: "0000000000000000000000000000000000000000",
    },
    nodes,
    edges,
    layers: cleanLayers,
    tour,
  };
}

async function validate(graph) {
  const schemaUrl = pathToFileURL(
    resolve(REPO_ROOT, "understand-anything-plugin/packages/core/dist/schema.js")
  );
  try {
    const { validateGraph } = await import(schemaUrl.href);
    const result = validateGraph(graph);
    return result;
  } catch (err) {
    console.warn(`  (skipped core validation: ${err.message} — run \`pnpm --filter @understand-anything/core build\`)`);
    return null;
  }
}

// ── Run the pipeline ─────────────────────────────────────────────────────────
/** Run every stage and return the assembled knowledge graph (no side effects). */
export function buildGraph() {
  const layers = defineLayers();
  const nodes = [
    ...buildLayerHubNodes(),
    ...buildComponentNodes(),
    ...buildCompanyNodes(),
    ...buildClaimNodes(),
  ];
  const edges = buildEdges();
  const tour = buildTour();
  return assemble(nodes, edges, layers, tour);
}

export const COUNTS = {
  layers: LAYERS.length,
  components: COMPONENTS.length,
  companies: COMPANIES.length,
  claims: CLAIMS.length,
};

async function main() {
  const graph = buildGraph();

  const outArg = process.argv.indexOf("--out");
  const outPath = outArg !== -1 && process.argv[outArg + 1]
    ? resolve(process.cwd(), process.argv[outArg + 1])
    : resolve(REPO_ROOT, "docs/ai-supply-chain/knowledge-graph.json");

  const result = await validate(graph);

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(graph, null, 2));

  console.log("Generated AI supply-chain knowledge graph:");
  console.log(`  Nodes: ${graph.nodes.length}  (layers ${LAYERS.length}, components ${COMPONENTS.length}, companies ${COMPANIES.length}, claims ${CLAIMS.length})`);
  console.log(`  Edges: ${graph.edges.length}`);
  console.log(`  Layers: ${graph.layers.length}   Tour steps: ${graph.tour.length}`);
  if (result) {
    const dropped = result.issues.filter((i) => i.level === "dropped").length;
    const fixed = result.issues.filter((i) => i.level === "auto-corrected").length;
    console.log(`  Validation: ${result.success ? "PASS" : "FAIL"} (auto-corrected ${fixed}, dropped ${dropped}${result.fatal ? `, fatal: ${result.fatal}` : ""})`);
    if (!result.success) process.exitCode = 1;
  }
  console.log(`  Written to: ${outPath}`);
}

// Only run the CLI when executed directly (so tests can import buildGraph()).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
