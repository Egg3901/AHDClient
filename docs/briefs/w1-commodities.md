# Brief W1: port commodity prices and contract settlement

Standard rules apply (read `docs/FRAMEWORK.md`; mainline at `/root/projects/AHDGame` is READ-ONLY; determinism doctrine; `npm install` first; merge gate `npm run verify`; conventional commits, no push, no em dashes; cite mainline sources per formula; PORT-STUB missing inputs at mainline-neutral values; schema bump + migration + test for any WorldState change; the cli fixture in `packages/cli/src/formatter.test.ts` may be updated one line if schema changes).

You own `packages/engine` economy/commodity surface. Do not touch `apps/desktop`. Another engine wave (party org) runs in parallel; keep your changes inside new commodity modules, the phase registry line, your types additions, and your tests to minimize merge overlap.

Port from mainline: the `commodityPrices` and `contractSettlement` turn phases and their formula modules (find them under `src/lib/` - commodity, extraction/contract settlement pricing). Deliver: commodity price state on WorldState (era-seeded starting prices from mainline seed/reference data via `packages/content` if that is where mainline anchors them), per-turn price evolution faithful to mainline (note the known mainline commodity inflation-level bug if you encounter it: port current behavior and mark it with a `MAINLINE-BUG` comment rather than silently fixing), contract settlement against those prices with counterparties stubbed where corporations are not yet ported. Golden-value tests, determinism, bounds.

## Rules

- When verified, COMMIT your work on this branch with a conventional commit message (`git add -A packages && git commit ...`). This step is mandatory; uncommitted work is lost. Do not push.
- Final summary: mainline files, formulas, stubs, schema changes, verification, and the commit hash.
