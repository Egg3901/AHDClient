# Brief: implement the title screen design as the app launcher

Read `docs/FRAMEWORK.md` first. You own `apps/desktop`. Do not touch `packages/*` (another agent is working there), `README.md`, or `docs/` beyond reading.

## Spec

`docs/design/title-screen.html` is the launcher reference. Reproduce its restrained dark editorial direction in the React app, replacing the old ornamental launcher screen. Prioritize direct hierarchy, readable mode selection, and a compact mobile flow:

1. **Editorial shell** (launcher only): deep navy background, subtle grid texture, compact product identity, strong typography, and disciplined red/blue accents. Scope these styles to the launcher; in-game screens keep the existing dark theme from `app.css`.
2. **Contextual command globe**: keep the globe as supporting atmosphere on wider screens, driven by the selected era with a sensible default theme for unknown eras. Hide it on narrow mobile screens so choices and actions stay above the fold.
3. **Mode cards**: SINGLEPLAYER shows concise era cards plus NEW WORLD / LOAD SAVE actions wired to the existing flows (`NewWorldScreen` prefilled with the selected era, existing `game.load`). MULTIPLAYER shows a short live-service explanation and ENTER MULTIPLAYER wired to the hardened online flow. Desktop opens an isolated online window; mobile navigates the app webview for OAuth and cookie continuity.

## Structure

Componentize around `launcher/CommandGlobe.tsx` and `launcher/Launcher.tsx` with a scoped stylesheet. Do not restore the decorative streak canvas. Respect `prefers-reduced-motion`. Keep the React state flow of the existing App (launcher, new-world, in-game screens).

## Rules

- No new network permissions for local surfaces and no remote Tauri IPC capabilities. Mobile may navigate the main webview because Android supports a single webview and needs in-app OAuth continuity.
- Run `npm install` first. Merge gate: `npm run verify` from repo root, `npm run build:web --workspace apps/desktop`, `cargo check` in `apps/desktop/src-tauri`.
- Conventional commits when verified. Do not push. No em dashes.
- Final summary: components created, wiring decisions, verification output.
