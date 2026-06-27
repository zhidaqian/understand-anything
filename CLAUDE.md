# Understand Anything

## Project Overview
An open-source tool combining LLM intelligence + static analysis to produce interactive dashboards for understanding codebases. Shipped as a multi-platform plugin (Claude Code, Cursor, Copilot, opencode, Trae) plus a React web dashboard.

## Prerequisites
- Node.js >= 22 (developed on v24)
- pnpm >= 10 (pinned via `packageManager` field in root `package.json`; currently `pnpm@10.6.2`)
- Python 3 (a few skill helper scripts are `.py`)

## Architecture
- **Monorepo** with pnpm workspaces. Workspace globs (`pnpm-workspace.yaml`): `understand-anything-plugin/packages/*`, `understand-anything-plugin`, `homepage`.
- **understand-anything-plugin/** — the plugin package (`@understand-anything/skill`), containing all source code:
  - **packages/core** (`@understand-anything/core`) — Shared analysis engine. Subdirectories:
    - `analyzer/` — graph-builder, llm-analyzer (prompt builders + response parsers), normalize-graph, layer-detector, tour-generator, language-lesson
    - `languages/` — `LanguageRegistry` + `FrameworkRegistry`; ~41 language configs (`configs/`) and ~10 framework configs (`frameworks/`: django, express, fastapi, flask, gin, nextjs, rails, react, spring, vue)
    - `plugins/` — `PluginRegistry`, `TreeSitterPlugin`, language `extractors/` (typescript, python, go, java, rust, cpp, csharp, ruby, php) and non-code `parsers/` (sql, env, shell, makefile, dockerfile, graphql, yaml, json, markdown, terraform, protobuf, toml), plus discovery
    - `persistence/` — read/write of `.understand-anything/` artifacts (graph, meta, fingerprints, config); sanitises absolute file paths to project-relative before writing
    - top-level: `types.ts`, `schema.ts` (Zod), `search.ts` (Fuse.js), `embedding-search.ts`, `staleness.ts`, `fingerprint.ts`, `ignore-generator.ts`
  - **packages/dashboard** (`@understand-anything/dashboard`) — React 19 + TypeScript web dashboard (React Flow / `@xyflow/react`, Zustand, TailwindCSS v4, dagre/elkjs/d3-force layouts, graphology clustering, prism-react-renderer, react-markdown)
  - **src/** — Skill TypeScript source (built to support `/understand-chat`, `/understand-diff`, `/understand-explain`, `/understand-onboard`): context-builder, diff-analyzer, explain-builder, onboard-builder, understand-chat
  - **skills/** — Skill definitions (each a `SKILL.md`, some with helper `.mjs`/`.py` scripts): `understand`, `understand-dashboard`, `understand-chat`, `understand-diff`, `understand-explain`, `understand-onboard`, `understand-domain`, `understand-knowledge`
  - **agents/** — Agent definitions: project-scanner, file-analyzer, architecture-analyzer, tour-builder, graph-reviewer, domain-analyzer, article-analyzer, assemble-reviewer, knowledge-graph-guide
  - **hooks/** — `hooks.json` (PostToolUse on Bash commits + SessionStart staleness check) and `auto-update-prompt.md` (incremental graph-update instructions)
- **Platform plugin manifests** live in repo-root sibling dirs: `.claude-plugin/`, `.cursor-plugin/`, `.copilot-plugin/`. Marketplace metadata in `.claude-plugin/marketplace.json`.
- **homepage/** — separate workspace for the marketing/docs site.

## Skills (slash commands)
- `/understand [path] [--full|--auto-update|--no-auto-update|--review|--language <lang>]` — Analyze a codebase into `.understand-anything/knowledge-graph.json`. Auto-triggers `/understand-dashboard` on completion. `--language` accepts ISO 639-1 codes or friendly names and is persisted in `config.json`.
- `/understand-dashboard [path]` — Launch the interactive web dashboard for the project's graph.
- `/understand-domain [--full]` — Extract business-domain knowledge (domains, flows, steps) into a horizontal flow graph. Derives from an existing graph when present, else does a lightweight scan.
- `/understand-knowledge [wiki-dir]` — Analyze a Karpathy-pattern LLM wiki (raw sources + wikilinked markdown + schema) into a knowledge graph.
- `/understand-chat`, `/understand-diff`, `/understand-explain`, `/understand-onboard` — Conversational/diff/explanation/onboarding flows backed by `src/`.

## Dashboard
- Dark luxury theme: deep blacks (#0a0a0a), gold/amber accents (#d4a574), DM Serif Display typography. Theme engine in `src/themes/` with presets and a `ThemePicker`.
- Graph-first layout: large graph canvas + ~360px right sidebar. Multiple graph views: `GraphView` (structural), `DomainGraphView`, `KnowledgeGraphView`, with cluster nodes (container/domain/layer) and custom nodes.
- Sidebar tabs: `Info` (ProjectOverview default → NodeInfo when a node is selected → LearnPanel in Learn persona) and `Files` (FileExplorer tree built from the structural graph). Personas via `PersonaSelector`.
- Code viewer: prism-react-renderer source viewer that slides up from the bottom on file-node click; an expand button promotes it to a full-screen modal. Source content is fetched from the dev server's `/file-content.json` endpoint, gated by an access `TokenGate` + a graph-derived path allowlist.
- i18n: `src/locales/` (en, ja, ko, ru, zh, zh-TW) via `I18nContext`. Mobile support: `MobileLayout`/`MobileDrawer`/`MobileBottomNav` + `useIsMobile`. Keyboard shortcuts via `useKeyboardShortcuts` + help overlay.
- Schema validation on graph load with an error/warning banner.

## Agent Pipeline
- Agents write intermediate results to `.understand-anything/intermediate/` on disk (not returned to context); intermediate files are cleaned up after graph assembly.
- Agent `model` field is **omitted** from frontmatter so each platform falls back to its configured default — `inherit` was a Claude Code-only keyword that opencode (and similar tools) treated as a literal model id and rejected with `ProviderModelNotFoundError` (see #167).
- `/understand` auto-triggers `/understand-dashboard` after completion.
- **Auto-update hooks** (`hooks/hooks.json`): when `.understand-anything/config.json` has `autoUpdate: true`, a PostToolUse hook fires on git commit/merge/cherry-pick/rebase, and a SessionStart hook fires when `meta.json`'s `gitCommitHash` no longer matches `HEAD`. Both instruct the assistant to read `hooks/auto-update-prompt.md` and incrementally update the graph.

## Key Commands
- `pnpm install` — Install all dependencies
- `pnpm build` — Build all workspace packages (`pnpm -r build`); `prepare` builds core
- `pnpm --filter @understand-anything/core build` — Build the core package
- `pnpm --filter @understand-anything/core test` — Run core tests
- `pnpm --filter @understand-anything/skill build` — Build the plugin (`src/`) package
- `pnpm test` — Run all tests via root `vitest.config.ts` (includes core tests and the skill tests at repo-root `tests/skill/`)
- `pnpm --filter @understand-anything/dashboard build` — Build the dashboard
- `pnpm dev:dashboard` — Start dashboard dev server
- `pnpm lint` — Run ESLint across the project

## Conventions
- TypeScript strict mode everywhere
- Vitest for testing (tests colocated as `*.test.ts` or under `__tests__/`; Python skill tests under `tests/skill/`)
- ESM modules (`"type": "module"`)
- Knowledge graph JSON and related artifacts live in the `.understand-anything/` directory of analyzed projects (`knowledge-graph.json`, `meta.json`, `fingerprints.json`, `config.json`)
- Core uses subpath exports (`./search`, `./types`, `./schema`, `./languages`) to avoid pulling Node.js modules into the browser

## Gotchas
- **tree-sitter**: Uses `web-tree-sitter` (WASM) instead of native `tree-sitter` — native bindings fail on darwin/arm64 + Node 24. Native `tree-sitter-*` grammar packages are listed under `pnpm.onlyBuiltDependencies` in the root `package.json`.
- **Dashboard imports**: Dashboard must only import from core's browser-safe subpath exports (`./search`, `./types`, `./schema`, `./languages`), never the main entry point which pulls in Node.js modules.

## Scripts
- `scripts/generate-large-graph.mjs` — Generates a fake knowledge graph for performance testing (e.g. large-graph layout). Writes to `.understand-anything/knowledge-graph.json`. Usage: `node scripts/generate-large-graph.mjs [nodeCount]` (default: 3000 nodes). Not part of the production pipeline.

## Versioning
When pushing to remote, bump the version in **all five** of these files (keep them in sync):
- `understand-anything-plugin/package.json` → `"version"` field
- `understand-anything-plugin/.claude-plugin/plugin.json` → `"version"` field
- `.claude-plugin/plugin.json` → `"version"` field
- `.cursor-plugin/plugin.json` → `"version"` field
- `.copilot-plugin/plugin.json` → `"version"` field

Note: `.claude-plugin/marketplace.json` does **not** carry a version — the `plugins[]` entry only supports `name` and `source`, and adding other fields causes marketplace schema validation failures.

## Testing Local Plugin Changes

Claude Code caches installed plugins at `~/.claude/plugins/cache/understand-anything/understand-anything/<version>/`. Symlinks don't work because Claude's Search/Glob tools can't follow them. To test local changes:

1. **Build the packages:**
   ```bash
   pnpm --filter @understand-anything/core build
   pnpm --filter @understand-anything/skill build
   ```

2. **Find the installed version** (must match what the marketplace currently serves):
   ```bash
   ls ~/.claude/plugins/cache/understand-anything/understand-anything/
   ```

3. **Copy your local plugin into the cache**, replacing `<VERSION>` with the version from step 2:
   ```bash
   rm -rf ~/.claude/plugins/cache/understand-anything/understand-anything/<VERSION>
   cp -R ./understand-anything-plugin ~/.claude/plugins/cache/understand-anything/understand-anything/<VERSION>
   ```

4. **Start a fresh Claude Code session** (existing sessions cache the old prompts in context).

5. **Run `/understand --full`** in the target project to verify.

**Re-sync after further changes:**
```bash
pnpm --filter @understand-anything/core build && \
cp -R ./understand-anything-plugin/* ~/.claude/plugins/cache/understand-anything/understand-anything/<VERSION>/
```

**To revert to upstream:** Uninstall and reinstall the plugin from the marketplace — it repopulates the cache from the upstream repo.
