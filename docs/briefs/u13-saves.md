# Brief U13/P1: save slots, autosave, crash-safe writes

Read `docs/FRAMEWORK.md`. You own `apps/desktop`. Do not touch `packages/*` (an engine wave is in flight). Use only public engine exports (`serializeSave`/`deserializeSave` handle format and migrations; do not reimplement them).

## Goal

Saving stops being dialog-only: managed save slots in the app data directory, autosave every N turns, and writes that cannot corrupt an existing save.

## Deliverables

1. **Save manager module** (`src/saves.ts`): slots stored under the Tauri appDataDir in `saves/` as `<slot>.json` with a sidecar index (slot name, savedAt, turn, date, era, country, playerName, cheatsUsed). Crash-safe write: write to `<slot>.json.tmp`, then rename over the target; never truncate the target first.
2. **Permissions**: this wave IS authorized to extend Tauri capabilities minimally: fs read/write/rename scoped to `$APPDATA/saves/**` plus create-dir for it, main window only. No broader fs grants; the online window stays at zero.
3. **Saves screen**: from launcher (LOAD SAVE opens it) and in-game (SAVE opens it): slot list with metadata, save to new/existing slot (overwrite confirms), load, delete (confirms), plus IMPORT/EXPORT buttons that reuse the existing dialog-based flows for file exchange.
4. **Autosave**: after every 4th advanceTurn (and after cheat advanceTurns batches), write to a reserved rotating pair of slots (`autosave-a`/`autosave-b`, alternating, so a crash mid-autosave always leaves the previous one intact). Toggle + interval (off/2/4/8 turns) in a small settings section on the saves screen, persisted in localStorage.
5. Errors surface in the UI (banner), never silent, never crash to blank.

## Rules

- `npm install` first. Merge gate: `npm run verify` from repo root, `npm run build:web --workspace apps/desktop`, `cargo check` in `apps/desktop/src-tauri`.
- When verified, COMMIT on this branch with a conventional commit message. Mandatory; uncommitted work is lost. Do not push. No em dashes.
- Final summary: modules, capability diff, autosave design, verification, commit hash.
