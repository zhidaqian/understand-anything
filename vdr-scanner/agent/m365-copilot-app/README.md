# M365 Copilot app deployment (declarative agent — no Copilot Studio)

This folder deploys the VDR Scanner as a **declarative agent** in the
Microsoft 365 Copilot app, for tenants that prefer not to use Copilot Studio.
The user experience is identical — paste a SharePoint link in the Copilot
chat, ask for "status" and "gap report" — but the architecture shifts:

| Concern | Copilot Studio mode | Copilot app mode (this folder) |
|---|---|---|
| Chat front end | Studio agent | Declarative agent (`declarativeAgent.json`) |
| Scan loop | Agent-driven batches or server-side | **Always server-side** (`startScan`) |
| Per-file classification LLM | Studio prompt tool | The worker calls an LLM API directly |
| Steady-state freshness | Agent triggers | Function timer trigger + Graph change notifications |
| Licensing | Copilot Studio capacity | Covered by the M365 Copilot seat |

A declarative agent is chat-only: it has no autonomous triggers and cannot
drive a 25-batch tool loop reliably. So the loop lives entirely in the host
(the right place for it anyway — the agent keeps judgment over *conversation*,
code keeps the guarantees), and the agent calls exactly four actions:
`resolveDrive`, `startScan`, `reconcile`, `gapReport`.

## Consequence for classification

Without Studio's prompt tool, the worker performs classification itself by
calling an LLM API (Azure OpenAI, Anthropic, etc.) with
`agent/classify-document-prompt.md` as the prompt and
`CLASSIFICATION_JSON_SCHEMA` as the structured output, validating via
`parseClassification`. The `Classifier` interface in `src/classifier.ts` is
exactly this seam — implement it once in the Function app.

## Deploy

1. Host `vdr-scanner/src` behind the routes in `../connector-openapi.json`
   (Azure Function app). Implement `startScan` to run enumeration + the
   `runScan` drain loop in the background and return 202 immediately. Add a
   timer trigger (daily) calling the same code path for freshness.
2. Package this folder plus `../connector-openapi.json` as a Microsoft 365
   app (Teams/Agents Toolkit: `atk validate`, `atk package`), register the
   Function key in the plugin vault, and set the OpenAPI `host` to your
   Function app.
3. Sideload for testing or publish via the admin center. The agent appears
   in the Copilot app's agent picker; users then just paste a library link.

At ~500 files a full scan completes in minutes, so by the time a user asks
for status the answer is usually already "complete — here is the gap report."
