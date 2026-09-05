# Contributing

- Trunk is `main`. Branch, PR, squash-merge. CI (`verify`) must be green.
- Conventional commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`).
- The client does not contain game logic. Anything about how the world behaves belongs in the AHDGame repository; the client only starts, stops, lists and shows.
- The launcher window gets no filesystem, shell or network permissions. New capabilities go through a Rust command with a narrow contract, and `apps/desktop/src/securityConfig.test.ts` is updated in the same PR.
- A change to what the client expects from `launch.mjs` or the singleplayer routes is a contract change: update `docs/FRAMEWORK.md` and land the AHDGame side first.
- `npm run verify` before pushing; `cargo test` in `apps/desktop/src-tauri` for Rust changes.
