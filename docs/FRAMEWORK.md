# ROTUNDA framework

Codename ROTUNDA: the unified A House Divided desktop client. One app, two modes: viewer for the live multiplayer game, and fully local singleplayer worlds bootable in any era as any playable country.

This document is the integration contract. Parallel work streams build against it; changing a contract here requires updating this file in the same commit.

## Module boundaries

| Module | Owns | Never touches |
|---|---|---|
| `packages/engine` | WorldState, turn phases, RNG, saves, world creation | Tauri, DOM, network, filesystem |
| `packages/content` | Era seed packs (data + validation) | Engine internals beyond public types, UI |
| `apps/desktop` | Tauri shell, launcher, mode routing, React UI | Engine internals; it consumes `@ahdsolo/engine` exports only |

## Engine contract (v1)

`@ahdsolo/engine` exports, stable for UI work to code against:

```ts
interface EraInfo { id: string; label: string; startDate: string }
interface PlayableCountryInfo { id: string; name: string }

function listEras(): EraInfo[]
function listPlayableCountries(era: string): PlayableCountryInfo[]

interface NewWorldOptions {
  seed: string
  playerName: string
  countryId: string
  era: string        // an id from listEras()
}
function createWorld(options: NewWorldOptions): WorldState
function advanceTurn(world: WorldState): TurnReport
function serializeSave(world: WorldState, savedAt: string): string
function deserializeSave(raw: string): WorldState
```

Era ids are strings sourced from seed packs, not a hardcoded union. `createWorld` throws on unknown era or non-playable country.

## Security doctrine (binding)

1. **Singleplayer is fully local.** No server process, no listeners, no network requests from SP surfaces. The engine is a library in the app process; turns cost the player's CPU and nothing else.
2. **The online mode is a webview onto https://www.ahousedividedgame.com in a dedicated window.** Remote content never gets Tauri IPC, never gets capabilities. Do not grant fs, dialog, or shell to the online window. Never enable remote-domain IPC access.
3. **Capabilities are minimal and per-window.** The SP window holds dialog open/save and read/write of dialog-picked files only.
4. **Saves are inert data.** Loading validates format and schema version and fails hard; no code or paths execute from a save file.

## Determinism doctrine (binding)

No `Math.random`, `Date.now`, or IO inside `packages/engine` or `packages/content`. All randomness flows through the world RNG; all time from the world calendar. Any WorldState shape change bumps `SCHEMA_VERSION` with a load migration in the same PR. Determinism is test-enforced; keep it that way.

## Verification

`npm run verify` from the repo root (typecheck all workspaces + engine tests) is the merge gate. Desktop changes additionally require `npm run build:web --workspace apps/desktop` and `cargo check` in `apps/desktop/src-tauri`.
