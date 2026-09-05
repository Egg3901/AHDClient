# Brief U7: party screens

Read `docs/FRAMEWORK.md`. You own `apps/desktop`. Do not touch `packages/*` (an engine wave is in flight). Read-only over the WorldState snapshot; defensive reads for older saves.

## Goal

A PARTIES screen making the party layer visible: org, money, tiers, regional position.

## Deliverables

1. **PARTIES button** in dashboard header; country selector (playable countries first); party list of that country: name, abbreviation, tier badge, treasury, political strength, organization, member count, ideology marker (2D dot like the government screen).
2. **Party detail panel** on click: the above plus per-region breakdown from `WorldState.regions`/party-region data (org, registration, pressure, priority region flag), seats held across the country's chambers (aggregate from legislatures), and the party's politicians (name, chamber, age) reusing roster styling.
3. **Comparison strip**: small horizontal bars comparing the country's parties on treasury, strength, organization, member count.
4. Empty/missing data (non-playable countries, pre-v8 saves) renders gracefully with "not modeled" notes, never crashes.

## Rules

- No mutation; no new permissions. `npm install` first. Merge gate: `npm run verify`, `npm run build:web --workspace apps/desktop`, `cargo check` in `apps/desktop/src-tauri`.
- When verified, COMMIT on this branch with a conventional commit message. Mandatory. Do not push. No em dashes.
- Final summary: components, decisions, verification, commit hash.
