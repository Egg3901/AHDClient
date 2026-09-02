# Brief: implement the title screen design as the app launcher

Read `docs/FRAMEWORK.md` first. You own `apps/desktop`. Do not touch `packages/*` (another agent is working there), `README.md`, or `docs/` beyond reading.

## Spec

`docs/design/title-screen.html` is the launcher reference. Preserve its paper-ballot character while improving clarity, restraint, and mobile usability. Prioritize direct hierarchy, readable mode selection, and a compact mobile flow:

1. **Paper-ballot shell** (launcher only): warm paper, a quiet dot grid, civic mono typography, and disciplined red/blue traces. Scope these styles to the launcher; in-game screens keep the existing dark theme from `app.css`.
2. **Era command globe**: keep the globe as the central visual on desktop and a smaller but legible preview on mobile. Drive it from the selected era with a sensible default theme for unknown eras.
3. **Mode toggle**: SINGLEPLAYER shows compact era choices, period facts, and NEW WORLD / LOAD SAVE actions. MULTIPLAYER shows live-service context and ENTER MULTIPLAYER wired to the hardened online flow. Desktop opens an isolated online window; mobile navigates the app webview for OAuth and cookie continuity.

## Structure

Componentize around `launcher/StreakField.tsx`, `launcher/CommandGlobe.tsx`, and `launcher/Launcher.tsx` with a scoped stylesheet. Keep the streak field sparse, slow, and behind the interface. Pause it when hidden and disable it for `prefers-reduced-motion`. Keep the React state flow of the existing App (launcher, new-world, in-game screens).

## Rules

- No new network permissions for local surfaces and no remote Tauri IPC capabilities. Mobile may navigate the main webview because Android supports a single webview and needs in-app OAuth continuity.
- Run `npm install` first. Merge gate: `npm run verify` from repo root, `npm run build:web --workspace apps/desktop`, `cargo check` in `apps/desktop/src-tauri`.
- Conventional commits when verified. Do not push. No em dashes.
- Final summary: components created, wiring decisions, verification output.
