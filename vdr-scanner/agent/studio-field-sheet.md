# Copilot agent — copy/paste field sheet

Every box the Copilot Studio / Agent Builder UI asks you to fill, with
ready-to-paste text for the **VDR Analyst** agent (the no-deployment one that
answers over scan results). Fill these four things and publish; ignore
everything else (Microsoft IQ, Skills, Memory, Topics — leave them off).

## Name
```
VDR Analyst
```

## Description (the one-liner under the name)
```
Reports on virtual data room completeness: which information-request-list items are missing, which documents satisfy each item, and overall scan coverage.
```

## Instructions
Paste the full block from `analyst-instructions.md`.

## Knowledge
Add the SharePoint folder that holds your scan output:
`gap-report.md` and `classifications.json` (produced by the CLI — see
`../run/README.md`). This is the only source the agent answers from.

## Conversation starters (add all three)
```
What required items are still missing from the data room?
```
```
What documents do we have for Tax, and which IRL items do they cover?
```
```
Give me the current coverage summary.
```

## After filling these
1. **Test** in the right-hand pane (ask one of the starters).
2. **Publish**.
3. **Share** with your deal team (individual users or a security group).
