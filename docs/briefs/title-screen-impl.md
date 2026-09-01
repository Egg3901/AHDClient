# Brief: implement the title screen design as the app launcher

Read `docs/FRAMEWORK.md` first. You own `apps/desktop`. Do not touch `packages/*` (another agent is working there), `README.md`, or `docs/` beyond reading.

## Spec

`docs/design/title-screen.html` is the approved design, screenshot-verified by the owner. Reproduce it faithfully as the launcher UI in the React app, replacing the current plain launcher screen. It contains three canvas systems and the exact CSS to port:

1. **Paper ballot theme** (launcher only): white dot-grid background, ink monochrome type, red/blue streak agents that dart, bounce, and occasionally form checkmarks. Scope these styles to the launcher; in-game screens keep the existing dark theme from `app.css`.
2. **Era-themed command globe**: dark disc, phosphor land dots (the `LAND_DOTS` array embedded in the design file: extract it into `src/landDots.ts` as a typed constant), graticule, scanlines, vignette, capital labels, era themes (1953 green, 1960 amber). Drive the era list from `listEras()` via the engine (the contract stub in `engineContract.ts` can be deleted now: the engine exports the real APIs); map era ids to themes with a sensible default theme for unknown eras.
3. **Mode toggle**: SINGLEPLAYER shows the command globe plus era chips plus NEW WORLD / LOAD SAVE actions wired to the existing flows (`NewWorldScreen` prefilled with the selected era, existing `game.load`). MULTIPLAYER hides era chips, shows the live frame region and ENTER WORLD wired to the existing hardened online window (`openOnline`). In the app, the MP globe area may show the same dark disc with a LIVE chip rather than an embedded webview; do not embed remote content in the main window.

## Structure

Componentize: `launcher/StreakField.tsx`, `launcher/CommandGlobe.tsx`, `launcher/Launcher.tsx`, css module or scoped stylesheet. Respect `prefers-reduced-motion` (design file shows how). Keep the React state flow of the existing App (launcher, new-world, in-game screens).

## Rules

- No new network permissions; no remote content in the main window.
- Run `npm install` first. Merge gate: `npm run verify` from repo root, `npm run build:web --workspace apps/desktop`, `cargo check` in `apps/desktop/src-tauri`.
- Conventional commits when verified. Do not push. No em dashes.
- Final summary: components created, wiring decisions, verification output.
