# A House Divided: Solo

Singleplayer, offline, native desktop edition of [A House Divided](https://github.com/Egg3901/AHDGame) - the persistent political and economic simulation. Solo trades the shared server world for a deterministic sandbox you own: advance turns at your own pace, save anywhere, replay a seed, mod the world.

**Status: early scaffold.** The turn pipeline, deterministic RNG, and save format are real; the game systems are placeholders that get replaced as mainline systems port over.

## Architecture

```
packages/engine    Pure TypeScript simulation core. No Electron, no DOM, no IO.
apps/desktop       Electron shell (electron-vite + React). Owns the world in the
                   main process; the renderer sees snapshots over typed IPC.
```

Design rules, in order of importance:

1. **One world document.** The entire game state is a single serializable `WorldState`. Saves are versioned JSON envelopes around it, with forward migrations at load.
2. **Determinism.** All randomness flows through a seeded RNG stored in the world. Same seed + same actions = same world, across save/load and across machines. Tests enforce this.
3. **Phases are the porting unit.** Mainline runs ~60 ordered turn phases. Each system arrives here as a pure phase over `WorldState`, preserving mainline's relative ordering. No system talks to anything but the world document and the turn RNG.
4. **The engine never imports the platform.** It must stay runnable headless (tests, balance sims, a future CLI) and portable to other shells.

## Development

Requires Node >= 22.

```
npm install
npm run verify   # typecheck + tests, same as CI
npm run dev      # launch the desktop app
```

## Relationship to mainline

Mainline A House Divided is a live multiplayer service; this repo is a standalone offline game. Both are licensed PolyForm Noncommercial 1.0.0, so simulation code and content can move between them freely. Solo deliberately diverges where singleplayer wants it: on-demand turns (one turn = one in-game week), local saves, no accounts, no anti-abuse systems.

## License

[PolyForm Noncommercial 1.0.0](LICENSE.md) - source-available; free for any noncommercial use.
