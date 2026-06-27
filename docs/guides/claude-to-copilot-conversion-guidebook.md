# Converting Claude Agents to the Microsoft Copilot Ecosystem — A TDD Guidebook

**Date**: 2026-06-27
**Status**: Guide
**Worked example**: a minimal **Text Generator** agent
**Method**: Test-Driven Development (Red → Green → Refactor)

---

## 1. Why this guidebook exists

This repo already ships the same Markdown `agents/` + `skills/` files to Claude Code, Cursor,
GitHub Copilot, Codex, OpenCode, and OpenClaw — every one of those targets is an LLM assistant
that *reads instruction files*. **Microsoft Copilot Studio and Microsoft 365 Copilot are a
different ecosystem.** They do not consume Markdown agent files. Converting to them is a genuine
re-platforming, so we treat it like one: **we define the agent's behavior as tests first, then
build Copilot artifacts until the tests pass.**

We deliberately use a tiny, dependency-free **Text Generator** agent as the worked example. It
isolates the *conversion mechanics* (instructions, manifest, action, knowledge, orchestration,
evaluation) without dragging in the filesystem/static-analysis problems of agents like
`project-scanner`. Once you can convert the Text Generator with confidence, the same recipe scales
to the heavier pipeline agents — see §11.

> **Terminology guard.** "GitHub Copilot" (the coding assistant, already supported here via
> `.copilot-plugin/`) ≠ "Microsoft Copilot Studio" / "Microsoft 365 Copilot." This guide targets
> the latter two.

---

## 2. The source artifact: the Claude "Text Generator" agent

This is the Claude-side agent we are converting. It is representative of any
prompt-in / text-out Claude agent.

```markdown
---
name: text-generator
description: |
  Generates polished marketing or documentation copy from a short brief.
  Use when a user supplies a topic, audience, tone, and length and wants
  ready-to-publish prose back.
---

# Text Generator

You are a senior copywriter. Given a brief, produce publication-ready text.

## Inputs (from the prompt)
- topic (required)
- audience (default: general)
- tone (default: professional; one of professional|playful|technical|persuasive)
- length (default: medium; one of short≈80w|medium≈200w|long≈450w)
- format (default: prose; one of prose|bulleted|email)

## Rules
1. Honor tone, length, and format exactly. Never exceed the length band by >15%.
2. Open with a hook; never restate the brief back to the user.
3. No fabricated statistics, prices, dates, or quotes.
4. If `topic` is missing, ask one clarifying question instead of guessing.
5. Output only the requested text — no preamble, no "Here is...".
```

Everything below converts *this* agent. Each section first writes the **test**, then the
**implementation** that satisfies it.

---

## 3. The conversion test taxonomy

TDD only works if "behavior" is enumerable. We classify the agent's behavior into five test
layers; every layer gets concrete cases in §5–§9.

| Layer | Question it answers | Where it runs in Copilot |
|-------|--------------------|--------------------------|
| **L1 Manifest/contract** | Does the artifact validate and load? | ATK `validate`, schema check |
| **L2 Instruction fidelity** | Does it obey tone/length/format/guardrails? | Test pane / automated eval |
| **L3 Selection** | Does the orchestrator pick this agent/tool for the right asks (by description)? | Copilot Studio orchestration |
| **L4 Action/grounding** | Do tool calls and knowledge lookups return correct data? | Connector test + eval |
| **L5 Safety/refusal** | Does it refuse fabrication and ask when input is missing? | Eval + red-team prompts |

**Golden principle:** the test suite is authored once, in plain language + assertions, and is
reused against *both* the original Claude agent (to capture baseline) and the Copilot agent (to
prove parity). That parity check is the entire point of using TDD for a port.

---

## 4. Phase 0 — Capture the baseline (the "characterization tests")

Before changing platforms, pin down what "correct" means by recording the Claude agent's behavior
as **golden tests**. Store them as data, not prose, so they are runnable on either platform.

`tests/copilot-conversion/text-generator.cases.yaml`:

```yaml
suite: text-generator
cases:
  - id: TG-01-tone-playful
    layer: L2
    input: { topic: "our new mango sparkling water", audience: "Gen Z", tone: playful, length: short, format: prose }
    assert:
      - max_words: 92          # short(80) + 15% band
      - not_contains: ["Here is", "As an AI", "Here's"]
      - tone_is: playful
  - id: TG-02-format-bulleted
    layer: L2
    input: { topic: "Q3 security release notes", tone: technical, length: medium, format: bulleted }
    assert:
      - is_bulleted: true
      - max_words: 230
  - id: TG-03-missing-topic-asks
    layer: L5
    input: { audience: "developers", tone: technical }
    assert:
      - is_question: true       # must ask, not invent a topic
      - max_questions: 1
  - id: TG-04-no-fabrication
    layer: L5
    input: { topic: "our app's market share", tone: persuasive }
    assert:
      - not_contains_fabricated_stats: true   # no invented %, $, dates
  - id: TG-05-selection
    layer: L3
    utterance: "Write me a punchy launch blurb for a coffee subscription"
    assert:
      - routed_to: text-generator
```

Run these against the Claude agent and save outputs as `*.golden.md`. These goldens are the
acceptance bar for the Copilot version.

---

## 5. Target mapping for the Text Generator

| Claude piece | Copilot construct | Notes |
|---|---|---|
| frontmatter `name` | manifest `name` (≤100 chars) | display + selection |
| frontmatter `description` | manifest `description` (≤1,000 chars) | **load-bearing**: the orchestrator selects agents/tools/topics primarily by description text |
| instruction body | `instructions` (≤8,000 chars) | near 1:1 paste-and-trim |
| input params | conversation inputs / **conversation_starters** (≤12) | seed the brief fields |
| (none — pure LLM) | no **Action** needed for L1/L2 | the Text Generator needs an action only if you add a "save to SharePoint / fetch brand guide" capability (§8) |
| brand/style guide | **Knowledge source** | optional grounding (§7) |

This is why Text Generator is the ideal TDD seed: L1/L2/L3/L5 are exercised with **zero backend**.
L4 is added deliberately in §8 so you learn the action path in isolation.

---

## 6. RED → GREEN: the manifest and instructions

### 6.1 RED — write the L1 contract test first

`tests/copilot-conversion/manifest.contract.test.md` (assertions, run via ATK validate or a JSON
schema check):

```
GIVEN appPackage/declarativeAgent.json
THEN  version == "v1.7"
AND   name length in 1..100
AND   description length in 1..1000
AND   instructions length in 1..8000
AND   conversation_starters length <= 12
AND   each capabilities[].name is unique
AND   `atk validate` exits 0
```

At this point there is no manifest, so the test fails (RED). Good.

### 6.2 GREEN — author the minimum manifest to pass

Built with the **Microsoft 365 Agents Toolkit** (VS Code → *Create a new Declarative Agent*), or
hand-written. `appPackage/declarativeAgent.json`:

```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/copilot/declarative-agent/v1.7/schema.json",
  "version": "v1.7",
  "name": "Text Generator",
  "description": "Generates publication-ready marketing or documentation copy from a short brief (topic, audience, tone, length, format). Use when a user wants ready-to-publish prose, a launch blurb, release notes, or an email written for them.",
  "instructions": "You are a senior copywriter. Given a brief, produce publication-ready text.\n\nInputs you may receive: topic (required), audience (default general), tone (professional|playful|technical|persuasive, default professional), length (short~80w|medium~200w|long~450w, default medium), format (prose|bulleted|email, default prose).\n\nRules:\n1. Honor tone, length, and format exactly; never exceed the length band by more than 15 percent.\n2. Open with a hook; never restate the brief back to the user.\n3. Never fabricate statistics, prices, dates, or quotes. If a fact is needed and unknown, omit it or use a clearly bracketed placeholder like [INSERT FIGURE].\n4. If topic is missing, ask exactly one clarifying question instead of guessing.\n5. Output only the requested text. No preamble, no 'Here is', no sign-off unless format is email.",
  "conversation_starters": [
    { "title": "Launch blurb", "text": "Write a punchy launch blurb for {product} aimed at {audience}." },
    { "title": "Release notes", "text": "Write technical release notes for {feature}, medium length, bulleted." },
    { "title": "Outreach email", "text": "Write a persuasive outreach email about {topic} to {audience}." }
  ],
  "capabilities": [
    { "name": "WebSearch" }
  ]
}
```

`appPackage/manifest.json` (the Teams/M365 app envelope) and icons are scaffolded by ATK; the
declarative agent is referenced from `copilotAgents.declarativeAgents[].file`.

Run `atk validate` → L1 goes GREEN.

> **Trimming to 8,000 chars.** The Claude body is short here, but for big agents (e.g.
> `architecture-analyzer`) the body will exceed 8,000. Strategy: keep *behavioral rules* in
> `instructions`; push *reference material* (schemas, taxonomies, examples) into a **knowledge
> source** (§7). Instructions are for "how to behave," knowledge is for "what to know."

### 6.3 GREEN — L2 instruction fidelity

Deploy to the tenant (`atk provision`) and run the L2 cases (TG-01, TG-02) in the **Copilot
Studio / M365 test pane** or via automated eval (§10). Iterate on `instructions` until tone/length/
format assertions pass. Typical fixes:
- length overflow → add an explicit word-count ceiling per band (done in rule 1).
- preamble leak ("Here is…") → strengthen rule 5 and add a negative example.
- format drift → give one in-instruction example per format.

---

## 7. REFACTOR: add a knowledge source (grounding)

To make TG-04 (no fabrication) robust and to enforce brand voice, attach a **brand/style guide**
as a knowledge source instead of stuffing it into instructions.

Options and their limits:
- **SharePoint/OneDrive** file (e.g. `brand-voice.pdf`). Without a Microsoft 365 Copilot license in
  the same tenant, generative answers only use SharePoint files **< 7 MB**; with the license + Work
  IQ, up to **200 MB** (512 MB hard max).
- **Public website**: max **4 URLs**, each **≤ 2 path levels** (e.g. `https://brand.contoso.com/voice`).
- **Dataverse** table for structured approved-claims data (useful to back TG-04: the agent may only
  cite figures present in the table).

L4 grounding test:

```
TG-06 (L4): input topic="our pricing", tone=persuasive
ASSERT every numeric claim appears verbatim in the brand/pricing knowledge source
```

---

## 8. REFACTOR: add an Action (the L4 path in isolation)

Give the agent a real capability — "save the generated copy to SharePoint" or "fetch the latest
campaign brief" — so you learn the action/connector path. This is exactly the mechanism the heavy
pipeline agents will need (their analysis API).

### 8.1 RED — action contract test

```
TG-07 (L4): "Write release notes for v2.8 and save them to the Marketing site"
ASSERT plugin call saveCopy is invoked with {title, body, siteUrl}
AND    returns a 200 with a document URL
AND    the agent surfaces that URL to the user
```

### 8.2 GREEN — build the action

1. Author an **OpenAPI v2 (Swagger), JSON** spec for your endpoint. (Copilot Studio's REST API tool
   requires v2 JSON specifically.)

   `appPackage/apiSpec/text-generator-api.json` (excerpt):
   ```json
   {
     "swagger": "2.0",
     "info": { "title": "Text Generator API", "version": "1.0.0" },
     "host": "textgen-api.contoso.com",
     "schemes": ["https"],
     "paths": {
       "/save": {
         "post": {
           "operationId": "saveCopy",
           "summary": "Save generated copy to SharePoint and return its URL.",
           "parameters": [{
             "in": "body", "name": "body", "required": true,
             "schema": { "type": "object",
               "required": ["title","body","siteUrl"],
               "properties": {
                 "title": {"type":"string"},
                 "body": {"type":"string"},
                 "siteUrl": {"type":"string"}
               } } }],
           "responses": { "200": { "description": "Saved",
             "schema": {"type":"object","properties":{"url":{"type":"string"}}} } }
         }
       }
     }
   }
   ```

2. Author the **API-plugin manifest** `appPackage/ai-plugin.json` and reference it from the
   declarative agent:
   ```json
   "actions": [ { "id": "textGenApi", "file": "ai-plugin.json" } ]
   ```
   Each `operationId` becomes a function the orchestrator can call; **its `summary`/`description` is
   how the orchestrator decides to call it** — write them like agent descriptions.

3. **Auth**: in Copilot Studio choose **OAuth 2.0 → Microsoft Entra ID**, enter the scope you
   exposed on the API's app registration, then copy the **generated Redirect URL** back into the
   Entra app's redirect URIs. (Alternative path: build a **custom connector** at
   `make.powerautomate.com → Data → Custom connectors → Import an OpenAPI file`, then add it in
   Copilot Studio via **Tools → Add a tool → Connector**.)

---

## 9. REFACTOR: selection & (optional) orchestration

### 9.1 L3 selection test

TG-05 asserts that "Write me a punchy launch blurb…" routes to Text Generator. Selection is driven
by the **description** (and operation summaries). If routing fails:
- sharpen `description` with the *trigger verbs and nouns* users actually say ("blurb", "release
  notes", "outreach email", "write copy");
- avoid overlap with sibling agents' descriptions (disambiguation is description-vs-description).

### 9.2 Multi-agent (only if Text Generator is part of a pipeline)

For a single agent you don't need orchestration. When you compose it with others (as `/understand`
composes its pipeline), enable **Settings → Generative AI → Orchestration → Yes**, then register the
analyzers as **connected agents** (own tools/knowledge) or **child agents** (lightweight topic
subroutines). The orchestrator sequences them by description — there is no imperative dispatch list
like `SKILL.md` had.

---

## 10. The test harness — how to actually run the suite

You need the *same* cases to run on Claude (baseline) and Copilot (candidate). Three rungs:

1. **Manual test pane** (fastest): paste each case into the Copilot Studio / M365 Copilot test pane,
   eyeball against the golden. Good for L1–L2 during the inner loop.
2. **ATK validate + provision in CI**: `atk validate` gates L1 on every PR; `atk provision` to a
   *dev* tenant gives a live agent to probe.
3. **Automated LLM-as-judge eval** (the real parity gate): a small script that, for each case,
   sends the input to the deployed agent and scores the response against the assertions, using an
   LLM judge for fuzzy ones (`tone_is`, `not_contains_fabricated_stats`) and code for hard ones
   (`max_words`, `is_bulleted`, `routed_to`).

Suggested layout:

```
tests/copilot-conversion/
  text-generator.cases.yaml      # the suite (§4)
  *.golden.md                    # Claude baseline outputs
  run-eval.mjs                   # sends cases to the deployed agent, scores assertions
  judge-prompt.md                # rubric for the LLM judge
```

Pseudocode for `run-eval.mjs`:

```
for case in suite.cases:
    resp = callDeployedAgent(case.input || case.utterance)
    for a in case.assert:
        if a is structural (max_words/is_bulleted/routed_to): assert in code
        else: score = judge(resp, a, rubric); pass = score >= threshold
report pass/fail per case, fail the build if any L1/L5 case fails
```

**Gate policy:** L1 and L5 are hard gates (block merge). L2/L3/L4 use a parity threshold (e.g.
"Copilot ≥ 90% of Claude golden score") so small stylistic drift doesn't fail CI.

---

## 11. Scaling the recipe to the heavy agents

The Text Generator covers everything except *local filesystem access*. The pipeline agents add that
one problem, and the recipe extends predictably:

| Agent | New thing vs Text Generator | Test layer that grows |
|---|---|---|
| `project-scanner` | Needs repo on disk → **must** become an Action over an API that clones/reads the repo | L4 dominates; add fixture repos as golden inputs |
| `file-analyzer` | Two-phase: structural parse = Action, semantic = instructions | L4 + L2 |
| `architecture-analyzer` | Large reference taxonomy → move to **knowledge source** | L2 fidelity + 8k-char trimming |
| `tour-builder` | Pure reasoning over the graph | L2 only — easiest, like Text Generator |
| `graph-reviewer` | Deterministic checks = Action; judgment = instructions | L4 + L5 |

The architectural pivot for all of them is the same one §8 taught in miniature: **anything Claude
did by reading the local filesystem must move behind an OpenAPI v2 action**, because Copilot agents
have no local disk.

---

## 12. End-to-end checklist

- [ ] Baseline golden tests captured from the Claude agent (§4)
- [ ] L1 manifest contract test written, then `declarativeAgent.json` validates (§6)
- [ ] `instructions` ported and ≤ 8,000 chars; reference material moved to knowledge (§6/§7)
- [ ] `description` tuned for selection with real trigger words (§9.1)
- [ ] L2 fidelity (tone/length/format) passes parity threshold (§6.3)
- [ ] L5 safety (no fabrication, asks when input missing) hard-gate passes (§4)
- [ ] If actions used: OpenAPI **v2 JSON**, plugin manifest, OAuth 2.0/Entra wired, L4 passes (§8)
- [ ] Knowledge sources within size/URL limits (§7)
- [ ] `atk provision` / `atk publish` succeed to the target tenant (§10)
- [ ] Automated eval in CI; L1+L5 hard gates green (§10)

---

## 13. Field/limit quick reference

| Manifest field | Limit |
|---|---|
| `version` | `"v1.7"` (latest; use newest for new agents) |
| `name` | 1–100 chars |
| `description` | 1–1,000 chars |
| `instructions` | 1–8,000 chars |
| `conversation_starters` | ≤ 12 |
| `capabilities` | max one of each type |

| Knowledge limit | Value |
|---|---|
| SharePoint file (no M365 Copilot license) | < 7 MB |
| SharePoint file (with license + Work IQ) | up to 200 MB |
| Hard max file size | 512 MB |
| Public website URLs | ≤ 4, each ≤ 2 path levels |

| Action requirement | Value |
|---|---|
| OpenAPI version for Copilot Studio REST tool | **v2 (Swagger), JSON** |
| Auth | OAuth 2.0 (Entra ID), API key, or none |

---

## 14. Sources

- Declarative agent manifest — [schema 1.6](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-manifest-1.6) · [full property reference (1.5)](https://github.com/MicrosoftDocs/m365copilot-docs/blob/main/docs/declarative-agent-manifest-1.5.md)
- Instructions — [Write effective instructions for declarative agents](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-instructions) · [Write agent instructions (Copilot Studio)](https://learn.microsoft.com/en-us/microsoft-copilot-studio/authoring-instructions)
- Tooling — [Create declarative agents with the M365 Agents Toolkit](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/build-declarative-agents) · [Agents Toolkit CLI](https://learn.microsoft.com/en-us/microsoftteams/platform/toolkit/microsoft-365-agents-toolkit-cli)
- Orchestration — [Apply generative orchestration](https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/generative-orchestration) · [Multi-agent patterns](https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/multi-agent-patterns)
- Actions — [Extend your agent with REST API tools](https://learn.microsoft.com/en-us/microsoft-copilot-studio/agent-extend-action-rest-api) · [Plugin authentication](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/api-plugin-authentication) · [Custom connector from OpenAPI](https://learn.microsoft.com/en-us/connectors/custom-connectors/define-openapi-definition)
- Knowledge — [Knowledge sources summary](https://learn.microsoft.com/en-us/microsoft-copilot-studio/knowledge-copilot-studio) · [Quotas and limits](https://learn.microsoft.com/en-us/microsoft-copilot-studio/requirements-quotas)
