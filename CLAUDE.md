## Build

`src/styles.css` is the editable CSS source. `public/styles.css` (what actually ships) is a
**generated, minified build output** — edit `src/styles.css`, then run `npm run build` (or
`npm run build:css`) to regenerate it before committing/deploying. There is no CI build step:
deploy publishes `public/` as-is, so a deploy after editing `src/styles.css` without rebuilding
ships stale CSS. Commit both files together.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
