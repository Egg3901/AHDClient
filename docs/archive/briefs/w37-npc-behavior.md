# Brief W37: port NPC behavior cluster

Read `docs/FRAMEWORK.md`. Mainline at `<mainline-checkout>` is READ-ONLY. You own `packages/engine` NPC behavior surface (`src/npp/` behavior modules, phase registrations, politician field extensions). Do NOT touch `src/elections/orchestration.ts` or `src/electionEngine/` (operator active there). Schema: current is v13; take v14 if fields are needed, chained migration + test; one-line cli fixture bump allowed.

Port from mainline the NPC behavior cluster: `nppBehavior`, `nppRelationshipMaintenance`, `nppBillSponsorship`, `nppActionProcessing`, `nppFundGeneration` (whatever `fundGeneration` did not already cover), and NPP stance logic including the stance-mimicry fix, from `src/lib/npp/` and their turn wiring. NPCs should spend their action points and funds like mainline: org/GOTV/support investment via the existing W34 action catalog and party phases, bill sponsorship through the W27 legislation API, relationship state as mainline models it.

Two standing PORT-STUBs are removed by this wave; delete them and their markers:
1. `packages/engine/src/party/phases.ts`: the default-major demotion exemption (majors survive because NPCs now maintain org; keep the regression test but re-point it at NPC-maintained org rather than the exemption; if 600-turn majors still demote with real NPC behavior, that is a finding to report, not to paper over).
2. NPC action points pegging at cap (integration ledger): nppActionProcessing should consume them.

Determinism doctrine binding; all randomness via the turn rng; cite mainline sources per behavior rule; PORT-STUB anything blocked with the system named.

Tests: NPCs spend AP (not pegged after 100 turns), org maintained in majors' regions over 600 turns, sponsorship happens through real bills, determinism, migration if schema bumped.

## Rules

- `npm install` first. Merge gate: `npm run verify` green from repo root.
- When verified, COMMIT on this branch with a conventional commit message. Mandatory. Do not push. No em dashes.
- Final summary: behaviors ported, stubs removed/kept, schema changes, verification, commit hash.
