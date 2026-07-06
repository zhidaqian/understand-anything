# VDR Scanner — Setup Guide

A tool that scans a SharePoint virtual data room, checks every document against
your Information Request List (IRL), and produces a **gap report** of what's
missing — then lets your deal team ask about it in Copilot.

This is the only document you need. It is plain markdown so it can also be
dropped straight into Copilot as a knowledge file.

---

## How it works (30 seconds)

There are two separate pieces, and they never mix:

1. **The scanner** runs once per scan on a computer. It reads every file in the
   data room and writes two result files. You (or whoever runs scans) handle
   this part. Copilot is not involved.
2. **The Copilot agent** reads those result files and answers questions about
   them ("what's missing in Tax?"). This is what you share with the team.

Coverage is guaranteed by the scanner (it opens and checks every file and
proves the count balances). The Copilot agent only quotes what the scanner
found — so it can never give a confident-but-incomplete answer.

---

## Part 1 — Produce the scan results

Whoever operates the scan runs it and gets two files:

- **`gap-report.md`** — required IRL items with no evidence, weak matches,
  satisfied items, files that failed, and a coverage line proving nothing was
  skipped.
- **`classifications.json`** — every document with its type, IRL mapping,
  topics, parties, and dates.

(The operator's step-by-step — tokens, running the command — lives with the
scanner tool itself. As the person setting up the Copilot side, all you need is
those two files in a SharePoint folder.)

Put both files in a SharePoint folder, e.g. **`/Shared Documents/VDR-Scan-Results`**.

---

## Part 2 — Set up the Copilot agent

In **Copilot Studio** or **Agent Builder**, create a new agent and fill in
exactly these fields. Leave everything else (Microsoft IQ, Skills, Memory,
Topics) off.

### Name
> VDR Analyst

### Description
> Reports on virtual data room completeness: which information-request-list items are missing, which documents satisfy each item, and overall scan coverage.

### Instructions
Paste this whole block:

> You are the VDR Analyst. You help a deal team understand the completeness of a
> virtual data room, using only the scan results in your knowledge source
> (gap-report.md and the classification records). You do not scan documents
> yourself and you never guess.
>
> When asked "what's missing" or about gaps:
> - Answer from gap-report.md. List the required IRL items that have no
>   evidence, each with its IRL id and title. Then note any weak-evidence items
>   separately.
> - Always state the coverage line from the report (the "done + error of
>   enumerated files" figure) so the user knows the scan was complete.
>
> When asked about a specific document or category (e.g. "what do we have for
> Tax?"):
> - Answer from the classification records: list the matching documents, their
>   document type, and which IRL item each maps to.
>
> When asked about the actual contents of a document (e.g. a specific clause):
> - Say that is outside your scope — you report on the scan results, not the
>   source documents — and point them to the document in SharePoint.
>
> Rules:
> - Only report items, counts, and file names that appear in your knowledge
>   source. If something is not in the results, say it was not in the last scan
>   rather than inventing an answer.
> - Files listed as errors in the report are open work; mention them whenever
>   you summarize gaps.
> - Be concise and factual. This is diligence work — precision matters more than
>   polish.

### Knowledge
Add the SharePoint folder from Part 1 (`VDR-Scan-Results`). That folder — the
two markdown/JSON result files — is the only thing the agent answers from.

### Conversation starters (add all three)
> What required items are still missing from the data room?

> What documents do we have for Tax, and which IRL items do they cover?

> Give me the current coverage summary.

---

## Part 3 — Test, publish, share

1. **Test** in the right-hand pane — ask "What required items are still
   missing?" and confirm it answers from your report.
2. **Publish** the agent.
3. **Share** with your deal team — individual people or a security group. Each
   person still only sees SharePoint content they already have access to;
   sharing the agent never grants file access.

---

## Good to know

- **Refreshing:** when a new scan is run, replace the two files in the
  SharePoint folder. There's a short indexing delay (minutes to ~an hour) before
  the agent reflects new results — fine for a daily scan cadence.
- **Scope:** this agent reports on *scan results*, not document contents. "What
  does clause 7 say?" is intentionally out of scope — that's a question for the
  document itself.
- **Why not just point Copilot at the whole data room?** Because Copilot's
  document retrieval samples the most relevant few chunks; it never guarantees
  it looked at every file. The scanner is what makes "we checked everything"
  true — the agent then reports that verified result.
