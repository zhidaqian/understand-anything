# VDR Scanner

An exhaustive virtual-data-room scanner for **key-topic identification** and
**IRL (information request list) gap analysis**, designed to run as a
Microsoft 365 Copilot Studio autonomous agent backed by deterministic tools.

"Exhaustive" is enforced, not hoped for: enumeration uses Microsoft Graph
**delta** (the only Graph mechanism guaranteed to return every item even while
writes happen mid-scan), every file becomes a row in a work-queue inventory,
and a reconciliation check — `done + error == enumerated` — must balance
before the scan may report success. Copilot's knowledge/retrieval layer is
deliberately **not** used for scanning: top-k retrieval samples, it never
covers.

## Chat UX

The intended experience in Microsoft 365 Copilot / Teams is: **paste a
SharePoint library link, done.** The agent resolves the URL to its backing
Graph drive via the shares API (`src/resolveDrive.ts` — works for site,
library, and folder links without tenant-specific URL parsing), confirms the
library name, starts the scan, and answers "status" and "gap report" from the
reconciliation tables while large scans continue server-side.

## Architecture

```
User pastes SharePoint URL ──► resolveDrive (shares API → driveId)
   │
Trigger (recurrence / file event)
   │
   ▼
Copilot Studio agent "VDR Scanner"  ── judgment: runs the loop, classifies
   │  tools (custom connector → Azure Function hosting src/)
   ▼
refreshEnumeration ─ Graph delta walk (429 Retry-After, 410 resync, paging)
getPendingBatch / markDone / markError ─ work-queue inventory (3-strike rule)
reconcile ─ coverage proof:  done + error == enumerated
gapReport ─ deterministic IRL join → gaps / weak / satisfied / unmapped
   │
   ▼
"VDR Analyst" chat agent (Teams / M365 Copilot) over the RESULTS tables
```

The division of labor: the **agent** owns judgment (per-document
classification, when to escalate); the **tools** own guarantees (completeness,
retry, accounting). Neither is allowed to do the other's job.

## Layout

| Path | What it is |
|---|---|
| `src/graphClient.ts` | Graph HTTP wrapper: Retry-After on 429/503, 410 → explicit resync signal |
| `src/resolveDrive.ts` | Pasted SharePoint URL → backing drive, via the Graph shares API |
| `src/deltaWalker.ts` | Full + incremental delta enumeration with checkpoint (`@odata.deltaLink`) |
| `src/inventory.ts` | Work-queue inventory: upsert by id, batching, 3-strike errors, reconciliation, JSON persistence |
| `src/classifier.ts` | `Classifier` interface, classification JSON Schema, strict output validator |
| `src/scanner.ts` | One scan cycle: enumerate → drain queue → prove coverage (throws if the books don't balance) |
| `src/gap.ts` | IRL gap analysis as a deterministic join + markdown report renderer |
| `agent/instructions.md` | System prompt for the Copilot Studio autonomous agent |
| `agent/classify-document-prompt.md` | The `classify_document` prompt tool |
| `agent/connector-openapi.json` | Swagger 2.0 custom-connector spec for the six tools |
| `irl/sample-irl.json` | Sample M&A IRL taxonomy (replace with the deal's real IRL) |
| `../tests/vdr-scanner/` | End-to-end suite against a simulated Graph drive |

## What the tests prove

Run from the repo root: `pnpm test` (suite lives at `tests/vdr-scanner/`).

- Full enumeration across many pages; duplicate items dedupe by id.
- 429 throttling survived by honoring `Retry-After`; walk still completes.
- Expired delta token (410 Gone) degrades to full re-enumeration without
  losing items.
- Incremental scan from a checkpoint reprocesses **only** changed/new files,
  applies deletions, and keeps prior classifications.
- Failing files get exactly `maxAttempts` tries, land in `error` status, and
  the reconciliation still balances — failures are surfaced, never dropped.
- A scan that cannot prove coverage **throws** instead of reporting success.
- Inventory survives serialize → restart → deserialize between scans.
- IRL gap analysis separates satisfied / weak-evidence / hard-gap /
  optional-missing items and lists unmapped and errored files.

## Deploying to Microsoft 365

1. **Entra app**: application permissions `Sites.Selected` (grant on the VDR
   site) or `Sites.Read.All` + `Files.Read.All`; client-credentials flow.
2. **Host the tools**: wrap `src/` in an Azure Function app with the six
   routes in `agent/connector-openapi.json`. Persist the inventory
   (`Inventory.toJSON`) and the delta checkpoint in Dataverse, a SharePoint
   list, or blob storage. Add text extraction (PDF/DOCX) in the
   `getPendingBatch` content step, chunked to your prompt budget.
3. **Copilot Studio**: create an autonomous agent; paste
   `agent/instructions.md`; import the connector; create the
   `classify_document` prompt from `agent/classify-document-prompt.md` with
   `CLASSIFICATION_JSON_SCHEMA` as structured output; add recurrence +
   file-event triggers.
4. **Publish the analyst**: a second, chat-facing agent whose knowledge is
   the results/gap tables only, published to Teams / M365 Copilot.
5. **Calibrate**: hand-label a golden set (~50–100 files) and iterate the
   prompt against it before trusting the gap report; rerun the golden set on
   every prompt or model change.

## Design lineage

The loop follows the Ralph-loop skeleton — fixed instructions re-fed each
cycle, durable state outside the model, a termination judge backed by hard
caps — and the 12-factor-agents doctrine: deterministic code for coverage,
LLM calls only at controlled points with structured, validated output.
