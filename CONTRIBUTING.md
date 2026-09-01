# Contributing

- Trunk is `main`. Branch, PR, squash-merge. CI (`verify`) must be green.
- Conventional commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`).
- Engine code must stay deterministic and platform-free: no `Math.random`, no `Date.now`, no IO inside `packages/engine`. Randomness comes from the turn RNG, time from the world calendar.
- Any `WorldState` shape change bumps `SCHEMA_VERSION` and ships a load-time migration in the same PR.
- `npm run verify` before pushing.
