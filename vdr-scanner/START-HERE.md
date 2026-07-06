# VDR Scanner — Start Here

Exhaustively scan a SharePoint virtual data room, classify every document
against your Information Request List (IRL), and get a **gap report** of what's
missing. No Copilot platform required to produce the results; an optional
Copilot agent lets your team ask questions about them.

## Pick your path

| You want… | Do this | Needs |
|---|---|---|
| **Just the gap report** (simplest) | Run the CLI (below) | Node 22, a Graph token, an Anthropic key |
| **Your team to ask questions in Copilot** | Run the CLI, then stand up the VDR Analyst agent | + a Copilot/Agent Builder license |
| **Chat to trigger scans of new rooms** | Wire the custom connector (`agent/connector-openapi.json`) | + host `src/` as an Azure Function |

Most people want the first two. The third is the heavy one and rarely worth it
for a single deal.

## 1. Run a scan (the whole product in one command)

```bash
npm install          # dev deps only (typescript, @types/node); the engine has none
npm run build        # compiles to dist/

export GRAPH_TOKEN="paste-a-graph-token"     # from Graph Explorer; see run/README.md
export ANTHROPIC_API_KEY="sk-ant-..."
export IRL_PATH="./irl/sample-irl.json"      # edit this to your deal's IRL

node dist/run/scan-vdr.js "https://contoso.sharepoint.com/sites/YourDeal/Shared Documents"
```

Output, written where you ran it:
- **`gap-report.md`** — required IRL items with no evidence, weak matches,
  satisfied items, unmapped files, and a coverage line proving nothing was
  skipped (`done + error == enumerated`).
- **`classifications.json`** — every file with its doc type, IRL mapping,
  topics, parties, dates, confidence. Also the checkpoint for incremental
  rescans.

Full setup detail (getting the Graph token, PDF/DOCX text extraction) is in
[`run/README.md`](run/README.md).

## 2. (Optional) Let your team ask questions — the VDR Analyst agent

1. Upload `gap-report.md` and `classifications.json` to a SharePoint folder.
2. Create an agent in **Copilot Studio** or **Agent Builder**.
3. Fill the four fields from [`agent/studio-field-sheet.md`](agent/studio-field-sheet.md)
   (name, description, instructions, knowledge = that folder) and publish.
4. Share with your deal team.

This agent answers over the *results* only — so retrieval never has to "scan,"
and coverage was already proven by step 1.

## What's in this package

```
START-HERE.md              ← you are here
README.md                  ← architecture + design rationale
package.json, tsconfig.json
src/                       ← the scan engine (dependency-free TypeScript)
run/                       ← the CLI runner + the LLM classifier + run/README.md
agent/
  studio-field-sheet.md    ← copy/paste fields for the VDR Analyst agent
  analyst-instructions.md  ← the agent's instructions (no deployment needed)
  instructions.md          ← fuller instructions IF you wire the connector
  classify-document-prompt.md
  connector-openapi.json   ← custom-connector spec (advanced path)
  m365-copilot-app/        ← declarative-agent manifests (advanced path)
irl/sample-irl.json        ← sample M&A IRL; replace with your own
```

## The idea in one line

The engine opens and checks **every** file, once, provably (Graph delta
enumeration + a reconciliation that must balance). The optional agent only
quotes what the engine found. That separation is what makes "no compromise"
real instead of hopeful.
