# Brief U9: world map screen

Read `docs/FRAMEWORK.md`. You own `apps/desktop`. Do not touch `packages/*` (an engine wave is in flight). Fully offline: no network at runtime.

## Goal

An in-game WORLD screen: a clickable world map tinted by live world data.

## Deliverables

1. **Geometry**: copy `/tmp/countries-110m.json` (world-atlas TopoJSON, public domain) into `apps/desktop/src/assets/countries-110m.json` and import it statically. Decode TopoJSON to country polygons yourself (arcs decoding is ~40 lines; no new runtime deps unless truly needed, in which case `topojson-client` only).
2. **Map render**: SVG, equirectangular or natural-earth-ish projection, dark theme. Countries present in `world.countries` (matched by ISO numeric/name mapping to our uppercase ids; build an explicit id map for the 27, including DD/RU handling on a 110m map that has modern borders: map DE geometry to DE and note DD overlay as a known limitation with a simple rectangle-free approach: tint the unified Germany by DE and badge DD in the side panel) fill-tinted by a selectable metric: GDP, growth, inflation, unemployment, output gap. Sequential tint ramp on the dark background, legend with min/max, non-modeled countries in neutral gray.
3. **Interaction**: hover tooltip (name, metric value), click opens a side panel: country economy stats, parties with support fields present, legislature summary, playable badge. WORLD button in dashboard header; back returns.
4. Player country outlined. Handle metric switching without re-decoding geometry.

## Rules

- Read-only; no new permissions; no runtime fetches.
- `npm install` first. Merge gate: `npm run verify` from repo root, `npm run build:web --workspace apps/desktop`, `cargo check` in `apps/desktop/src-tauri`.
- When verified, COMMIT on this branch with a conventional commit message. Mandatory; uncommitted work is lost. Do not push. No em dashes.
- Final summary: id-mapping decisions, projection, verification, commit hash.
