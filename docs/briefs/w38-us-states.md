# Brief W38: port US states layer

Read `docs/FRAMEWORK.md`. Mainline at `/root/projects/AHDGame` is READ-ONLY. You own `packages/content` state data plus `packages/engine` state/region surface. Do not touch `apps/desktop`. Another engine wave (W34 actions) is in flight: keep to new modules plus types/world/save extensions; expect me to resolve schema-number collision at merge (take the next free number and note it).

Port from mainline the US subnational layer for 1953:

1. **States**: all 48 (AK/HI absent until statehood, mirroring mainline), from `src/lib/seeds/reference/stateMetrics1953.ts` and US seed dirs: id, name, population, the political metrics the support/election systems consume (leans, registration, turnout anchors, disenfranchisement where mainline models it), and House apportionment (seats per state for the 83rd Congress, from mainline's apportionment/historicalSeats data).
2. **Region bridge**: replace W19's opaque `US-R1..R3` regions with real states per the documented plan in `docs/support/W19_BRIDGE.md`: migration remaps existing support state deterministically (population-weighted split or mainline's own mapping if one exists; document the choice). UK/RU/DD keep opaque regions until W39.
3. **State legislatures**: seed the `stateSenate`-style aggregate chamber(s) from mainline data if 1953 compositions exist; otherwise leave vacant with citation (no invented numbers).
4. **Senate classes**: per-state class assignments (I/II/III) from mainline so election timing can work later; House districts stay counts-per-state (district geometry is not needed for the election model).
5. Schema bump + chained migration + tests: state count 48, apportionment sums to 435, population sums plausible vs mainline totals, region bridge determinism, pack validation extended.

## Rules

- `npm install` first. Merge gate: `npm run verify` green from repo root.
- When verified, COMMIT on this branch with a conventional commit message. Mandatory. Do not push. No em dashes.
- Final summary: mainline files, bridge decision, schema changes, verification, commit hash.
