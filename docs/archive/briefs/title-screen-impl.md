# Brief: implement the title screen design as the app launcher

Read `docs/FRAMEWORK.md` first. You own `apps/desktop`. Do not touch `packages/*` (another agent is working there), `README.md`, or `docs/` beyond reading.

## Spec

`docs/design/title-screen.html` is the launcher reference. Preserve its paper-ballot character while using the established A House Divided brand and improving clarity, restraint, and mobile usability. Prioritize direct hierarchy, readable mode selection, and a compact mobile flow:

1. **Paper-ballot shell** (launcher only): use the canonical red-and-navy Liberty Bell asset, warm paper, a quiet dot grid, and traditional serif display type. Scope these styles to the launcher; in-game screens keep the existing dark theme from `app.css`.
2. **Era world map**: keep the globe as the central visual on desktop and a smaller but legible preview on mobile, rendered like a restrained printed atlas rather than a phosphor terminal. Drive it from the selected era with a sensible default theme for unknown eras.
3. **Mode toggle**: SINGLEPLAYER shows compact era choices, period facts, and NEW WORLD / LOAD SAVE actions. MULTIPLAYER shows live-service context and ENTER MULTIPLAYER wired to the hardened online flow. Desktop opens an isolated online window; mobile navigates the app webview for OAuth and cookie continuity.

## Structure

Componentize around `launcher/CommandGlobe.tsx` and `launcher/Launcher.tsx` with a scoped stylesheet. Use the checked-in canonical logo asset and avoid decorative canvas effects outside the world map. Respect `prefers-reduced-motion`. Keep the React state flow of the existing App (launcher, new-world, in-game screens).

## Rules

- No new network permissions for local surfaces and no remote Tauri IPC capabilities. Mobile may navigate the main webview because Android supports a single webview and needs in-app OAuth continuity.
- Run `npm install` first. Merge gate: `npm run verify` from repo root, `npm run build:web --workspace apps/desktop`, `cargo check` in `apps/desktop/src-tauri`.
- Conventional commits when verified. Do not push. No em dashes.
- Final summary: components created, wiring decisions, verification output.
