# Run a VDR scan with one command (no Copilot, no agent platform)

This is the simplest way to use the scanner: a script you run in a terminal.
It reads your data room, classifies every file, and writes a gap report. No
Copilot Studio, no declarative agents, no connectors.

## What you need

1. **Node.js 22+** on any machine (your laptop is fine for ~500 files).
2. **A Microsoft Graph access token** with permission to read the site. The
   easy way to get one for a first run:
   - Go to [Graph Explorer](https://developer.microsoft.com/graph/graph-explorer),
     sign in with an account that can see the data room, and copy the access
     token from the "Access token" tab. (Tokens last ~1 hour — fine for a
     scan. For scheduled runs, use an app registration + client credentials;
     see `../README.md`.)
3. **An Anthropic API key** for the classification step.
4. **Your IRL** as JSON. Start from `../irl/sample-irl.json` and edit it, or
   point `IRL_PATH` at your own file.

## Run it

From a built copy of the package (`pnpm --filter @understand-anything/... build`,
or compile `vdr-scanner` with `tsc`):

```bash
export GRAPH_TOKEN="paste-graph-token"
export ANTHROPIC_API_KEY="sk-ant-..."
export IRL_PATH="./my-deal-irl.json"        # optional; defaults to the sample
node scan-vdr.js "https://contoso.sharepoint.com/sites/ProjectFalcon/Shared%20Documents"
```

You'll see progress (`312/500 processed`) and, when it finishes:

- **`gap-report.md`** — required IRL items with no evidence, weak-evidence
  items, satisfied items, unmapped files, and files that failed to process,
  with the coverage line (`done + error == enumerated`) at the top.
- **`classifications.json`** — every file with its doc type, IRL mapping,
  topics, parties, dates, and confidence. This is also the checkpoint: keep
  it and a future version can rescan only what changed.

## Where to view the result

- Open `gap-report.md` in any markdown viewer, **or**
- Upload both files to a SharePoint folder and point a prompt-only Copilot
  agent (Agent Builder — no Studio) at that folder, so your team can ask
  "what are the gaps in Tax?" in chat. See `../agent/m365-copilot-app/` only
  if you later want chat to *start* scans; for reading results you don't need
  any of it.

## Swapping the LLM

`anthropicClassifier.ts` is the only file that talks to a model. Copy it to
target Azure OpenAI or another provider — the scan engine doesn't change.

## Note on PDFs and Word docs

`scan-vdr.ts` fetches raw file bytes. Text-native files work as-is; for
PDF/DOCX add a text-extraction step in `fetchContent` (e.g. `pdf-parse`,
`mammoth`) before the content reaches the classifier. That's the one piece
left as a stub because the right library depends on your file mix.
