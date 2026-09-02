# Boundary: this repo vs mainline A House Divided

This document defines the code and product boundary between ROTUNDA and mainline A House Divided (`Egg3901/AHDGame`). Both repositories are source-available; this document contains no deployment paths or private operational details.

## What each side is

- **Mainline**: the live multiplayer service. Server-authoritative, real-time turns, accounts, moderation, Mongo persistence.
- **ROTUNDA**: the multiplatform client. Desktop provides a hardened multiplayer webview; Android opens multiplayer in the system browser. Both provide fully local singleplayer running its own engine. No server components, ever.

## Direction of flow

- **Mainline to here**: simulation logic (formulas, constants, phase behavior), seed data, name pools, geometry. Ports carry source citations. The mainline checkout on the dev box is read-only for all agents.
- **Here to mainline**: nothing flows back automatically. Candidates for upstreaming (balance findings from CLI sims, era seed packs once the shared format stabilizes, bug discoveries made while porting) go through the owner as explicit mainline work items, never direct commits.
- **Never crosses the boundary in either direction**: cheats and overrides (solo-only by definition), Head of State mode (solo-only play mode), multiplayer anti-abuse/moderation systems (N/A in solo, see ROADMAP), server infrastructure, accounts/auth.

## Shared conventions (keep aligned)

- Country ids: mainline uppercase `CountryId` values, exactly.
- Party ideology: mainline's economic/social axes on -5..5.
- Era ids: strings keyed to mainline's real preset registry (`presetSelector.ts` `EraId`). Shipped packs: "1953", "1979", "1991", "2019" (mainline's 1953-default/1979-default/1991-default/2019-default). "1960" was never a mainline preset — it shipped here as a fabricated, interpolation-derived pack and has been removed; see `packages/content/src/packs` provenance headers.
- Save format marker `ahdsolo-save` is this repo's wire format and is independent of project naming.
- License: PolyForm Noncommercial 1.0.0 on both sides, which is what makes code flow legal and frictionless.

## Divergences (deliberate, documented)

- On-demand turns, one turn = one in-game week (mainline: real-time cadence, 48-turn annualization constants are kept where mainline's balance was tuned per-turn).
- Deterministic seeded RNG stored in the world; mainline is not replayable.
- Local JSON saves with schema migrations; mainline persists in Mongo.
- Solo-only surfaces: granular world creation overrides, cheat panel, Head of State mode.

Changes to this boundary require an owner decision and coordinated updates to the boundary notes in both projects.
