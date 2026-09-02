# Brief W27: port the legislation core (bills, voting, cloture, committees)

Read `docs/FRAMEWORK.md`. Mainline at `<mainline-checkout>` is READ-ONLY. You own `packages/engine` legislation surface (new `src/legislation/` modules, phases, types/world/save extensions, action catalog additions). Do NOT touch `packages/engine/src/electionEngine/` (agent active there) or `apps/desktop`. Schema: current is v11; take v12 with chained migration + test; one-line cli fixture bump allowed.

Port from mainline: `billLifecycle` (+ helpers), `billVoteLogic`, cloture with the quorum rule, `stateBillTimers`, and the committee model to the depth `billLifecycle` requires, from `src/lib/billLifecycle.ts`, `src/lib/billVoteLogic.ts`, `src/lib/billLifecycleHelpers.ts`, `src/lib/congress/`, and the bill catalog under `src/lib/` (bill types/effects catalog; port the catalog entries whose effect targets exist in solo: economy fields, party/support effects; entries with unported targets get `PORT-STUB: unavailable` status with the blocking system named). Deliver:

1. Bill state on WorldState (proposals, stage timers, sponsor, chamber routing per legislature config), lifecycle phase faithful to mainline stages and timing.
2. NPC voting via `billVoteLogic`: ideology-distance driven, party-line and endorsement inputs as mainline wires them; deterministic.
3. Player actions: sponsor bill (from catalog), cast vote when their chamber votes (the player has no seat yet in career mode: gate sponsorship on holding a seat per mainline rules, and note that HoS mode later grants government sponsorship; do not invent a bypass).
4. Enacted bills apply cataloged effects; repeal/expiry as mainline models.
5. Tests: lifecycle stage goldens, vote outcome goldens for known ideology spreads, cloture/quorum edges, determinism, migration.

## Rules

- `npm install` first. Merge gate: `npm run verify` green from repo root.
- When verified, COMMIT on this branch with a conventional commit message. Mandatory. Do not push. No em dashes.
- Final summary: mainline files, catalog entries ported vs stubbed, schema changes, verification, commit hash.
