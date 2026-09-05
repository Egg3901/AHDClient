# Brief W2: port budgets and fiscal system

Read `docs/FRAMEWORK.md`. Mainline at `<mainline-checkout>` is READ-ONLY. You own `packages/engine/src/budget/` (new) plus types/world/save extensions, phase registrations (end of ported subset, before newsMaintenance, noting the ordering deviation), and content seed tables. Do NOT touch `src/npp/` or `src/party/phases.ts` (W37 active). Schema: take the next free number after checking `SCHEMA_VERSION` at your branch point; note collisions for the merge resolver.

Port from mainline: `src/lib/budget/` and the fiscal turn phases: national budgets (revenue from tax bases, spending categories), `subsidyBudget`, `fiscalYear`, `fiscalBaseGrowth`, `regionalBudgetProcessing` (generic; JP/DE variants listed as deferred with file names since those countries are not playable). Seed 1953 budget state for US/UK/RU/DD from `src/lib/seeds/reference/budgets.ts` (the content package already ports its macro anchors; extend with the budget structure itself: revenue/spending lines, cited). Wire the fiscal term into `macroCountryTurn` replacing its `PORT-STUB` fiscal input (deficit/GDP per mainline `FISCAL_COEFF_*`), deleting that stub marker. Bill enactment budget gates from W27 should read real budget state where mainline wires them; connect what exists, PORT-STUB what does not with the blocking system named.

Tests: budget identity invariants (revenue - spending = balance), fiscal term goldens with citations, fiscalYear rollover, determinism, migration.

## Rules

- `npm install` first. Merge gate: `npm run verify` green from repo root.
- When verified, COMMIT on this branch with a conventional commit message. Mandatory. Do not push. No em dashes.
- Final summary: mainline files, structures ported, stubs removed/added, schema changes, verification, commit hash.
