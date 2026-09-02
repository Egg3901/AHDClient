# Brief: unified client launcher and mode routing

Read `docs/FRAMEWORK.md` first; the Security doctrine section is binding and is the point of this work stream. You own `apps/desktop`. Do not touch `packages/*`, `README.md`, or anything under `docs/`.

## Goal

The app opens on a launcher instead of dropping straight into the singleplayer form. Three paths: play the live multiplayer game (viewer), start a new singleplayer world, load a save. Singleplayer stays fully local; the online mode is a hardened webview.

## Deliverables

1. **Launcher screen** as the app entry: three clear entries (Play Online, New World, Load Save), using the warm paper-ballot identity, restrained red/blue traces, civic mono typography, and era command globe. Preserve direct hierarchy, large touch targets, and a compact mobile flow. Motion is supporting atmosphere, never the primary content.
2. **Online mode**: opens canonical `https://ahousedividedgame.com` in a **dedicated Tauri window on desktop** with zero capabilities: no fs, no dialog, no IPC exposure to remote content. On mobile, navigate the one available app webview so OAuth and multiplayer cookies remain in-app; do not configure remote Tauri API access. The desktop main window stays open, while Android Back returns through web history. Verify against FRAMEWORK.md security doctrine.
3. **New World flow**: the existing form gains era and country pickers, populated from `listEras()` and `listPlayableCountries(era)` per the Engine contract (v1) in FRAMEWORK.md. That engine API is being built in a parallel work stream; code against the contract via a thin local module `src/engineContract.ts` that re-exports from `@ahdsolo/engine` when available and otherwise provides a clearly marked temporary stub (single era "1953", countries us/uk) so your branch typechecks and runs standalone. Keep the stub trivially deletable.
4. **Load Save flow**: reuse the existing load path from the launcher; on failure show the error, do not crash to a blank screen.
5. **In-game**: a way back to the launcher (confirm if unsaved turns would be lost; track whether the world changed since last save).

## Rules

- Do not add network permissions of any kind to the SP surfaces.
- Run `npm install` first (fresh worktree).
- Merge gate: `npm run verify` green from repo root, plus `npm run build:web --workspace apps/desktop` and `cargo check` in `apps/desktop/src-tauri`.
- Conventional commits on this branch when verified. Do not push. No em dashes anywhere.
- Final summary: files, window/capability layout, verification output, anything deferred.
