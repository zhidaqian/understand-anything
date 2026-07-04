# syntax=docker/dockerfile:1
#
# Containerised AI supply-chain knowledge-graph generator.
#
#   docker build -t supply-chain-graph .
#   docker run --rm -v "$PWD/out:/out" supply-chain-graph
#     → writes out/knowledge-graph.json (validated against the core schema)
#
# Only the @understand-anything/core subtree is installed (zod + web-tree-sitter,
# no native toolchain), so the image stays slim and builds without build-essential.

# ── Builder: install core deps + compile the schema the generator validates against ──
FROM node:22-slim AS builder
WORKDIR /app
RUN corepack enable

# Copy manifests first for layer caching, then the rest of the repo.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY understand-anything-plugin/packages/core/package.json \
     understand-anything-plugin/packages/core/package.json
RUN pnpm install --frozen-lockfile --filter @understand-anything/core...

COPY understand-anything-plugin/packages/core ./understand-anything-plugin/packages/core
COPY scripts ./scripts
RUN pnpm --filter @understand-anything/core build

# ── Runtime: run the deterministic generator ──
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app /app
RUN mkdir -p /out
VOLUME ["/out"]

# Default: generate to the mounted /out volume. Override args as needed, e.g.
#   docker run --rm supply-chain-graph --out /out/graph.json
ENTRYPOINT ["node", "scripts/generate-supply-chain-graph.mjs"]
CMD ["--out", "/out/knowledge-graph.json"]
