# Brief W18: port party organization turn phases

Standard rules apply (read `docs/FRAMEWORK.md`; mainline at `/root/projects/AHDGame` is READ-ONLY; determinism doctrine; `npm install` first; merge gate `npm run verify`; conventional commits, no push, no em dashes; cite mainline sources per formula; PORT-STUB missing inputs at mainline-neutral values; schema bump + migration + test for any WorldState change; the cli fixture in `packages/cli/src/formatter.test.ts` may be updated one line if schema changes).

You own `packages/engine` party surface. Do not touch `apps/desktop`. Another engine wave (commodities) runs in parallel; keep changes inside new party modules, registry lines, your types additions, and tests.

Port from mainline: the party organization phase cluster - `partyInfluenceTurn`, `partyOrgTurn`, `partyTierTurn`, `caucusTax`, `partyActionGeneration`, `expireCharters`, `emptyPartyCleanup`, `partyMemberCountReconcile` - from their modules under mainline `src/lib/` (party/parties/caucus/politicalOperations areas; follow the phase registry wiring in `src/lib/turn/`). Extend `Party` state with what these phases actually read and write (influence, org strength, tier, funds, member counts), seeded from mainline party seed values where authored, mainline-neutral defaults with citations where not. Member counts in solo derive from politicians plus NPP populations; where mainline counts human members, PORT-STUB with the NPC-only equivalent and document. Phases whose triggers cannot fire yet (charters, empty-party cleanup with only seeded parties) still port with tests constructing the triggering state directly.

Final summary: mainline files, per-phase decisions, stubs, schema changes, verification.
