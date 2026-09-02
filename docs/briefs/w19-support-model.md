# Brief W19: port the party support model phase cluster

Read `docs/FRAMEWORK.md`. Mainline at `<mainline-checkout>` is READ-ONLY. You own `packages/engine` support/electorate surface. Do not touch `apps/desktop` (an agent is active there). Determinism doctrine binding; cite mainline sources per formula; PORT-STUB missing inputs at mainline-neutral values; schema bump + chained migration + test for WorldState changes; one-line cli fixture bump allowed.

Port from mainline the support model cluster that elections consume: `supportDecay`, `supportAccrual`, `turnoutDecay`, `partyGOTV`, `regDriftDecay`, `pressureDecay`, `priorityRegionDecay` (modules under mainline `src/lib/` - support/turnout/canvassing/politicalOperations areas; follow wiring in `src/lib/turn/`). Deliver party support state at whatever granularity mainline models for our four playable countries (country-level and region/state-level where mainline has it; if state-level, model regions as opaque region ids for now since the US states wave W38 has not landed, with a documented bridge plan). Seed initial support from mainline seed data where authored; where mainline seeds support from human registration flows, PORT-STUB with the mainline-neutral or historical-lean equivalent and cite. GOTV/pressure/priority-region phases port with the party-org fields from schema v6 (political strength, organization) as their inputs where mainline wires them so.

This wave is the gating dependency for the election engine; fidelity of decay/accrual constants matters more than breadth. Golden-value tests on each decay/accrual formula, determinism, bounds.

## Rules

- `npm install` first. Merge gate: `npm run verify` green from repo root.
- When verified, COMMIT on this branch with a conventional commit message. Mandatory; uncommitted work is lost. Do not push. No em dashes.
- Final summary: mainline files, granularity decision, stubs, schema changes, verification, commit hash.
