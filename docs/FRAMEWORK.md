# ROTUNDA framework

Codename ROTUNDA: the multiplatform A House Divided client. One app, two modes: an entry to the live multiplayer game and fully local singleplayer worlds bootable in any era as any playable country. Desktop hosts multiplayer in an isolated webview; Android navigates the app webview so sign-in and session continuity match the existing mobile client.

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

## Engine contract (v2 additions): custom creation and cheats

Singleplayer worlds are the player's property: world creation is granular and an explicit cheat surface exists. Both are engine-validated mutations, never raw UI pokes at state.

```ts
interface CountryEconomyOverride {
  gdp?: number
  growthRate?: number
  inflationRate?: number
  unemploymentRate?: number
}
interface WorldOverrides {
  playerCash?: number
  countries?: Record<string, CountryEconomyOverride>   // uppercase country ids
}
// NewWorldOptions gains: overrides?: WorldOverrides
// createWorld validates overrides (finite numbers, gdp > 0, rates in pack bounds)
// and throws on unknown country ids.

function listCountries(era: string): {
  id: string; name: string; playable: boolean; economy: CountryEconomy
}[]   // full pack roster with default anchors, for the creation editor

type CheatOp =
  | { kind: "setPlayerCash"; amount: number }
  | { kind: "setCountryEconomy"; countryId: string;
      field: "gdp" | "growthRate" | "inflationRate" | "unemploymentRate" | "outputGap";
      value: number }
  | { kind: "advanceTurns"; count: number }
  | { kind: "addNews"; headline: string }
function applyCheat(world: WorldState, op: CheatOp): void   // validates, throws on bad input
```

Cheats are singleplayer-only UI; the panel must never render in multiplayer mode. Cheat mutations are ordinary world changes: saves made afterward are ordinary saves. A `meta.cheatsUsed` flag is set by `applyCheat` (schema bump owned by the engine wave that implements it).

## Play modes (binding)

Singleplayer has two modes chosen at world creation:

- **Career** (default): the player is a politician climbing the existing systems.
- **Head of State**: the player is the ruling party/government of a chosen country: legislative agenda, economic direction (NPP economy encouragement, subsidies, state levers), wars and foreign policy.

The rule that keeps modes safe: **a mode is who the player is, never how the world works.** The turn pipeline, phase logic, and formulas are mode-blind; there is no `if (mode)` inside any phase. A mode only changes which existing action surfaces the player holds (the levers party/executive NPCs already operate) and which UI hub renders. `player.mode` lives on the player document; action gating happens at the action layer; NPCs fill whatever roles the player does not hold, identically in both modes. Any feature that cannot be built under this rule needs an explicit owner decision before it is built.

## Security doctrine (binding)

1. **Singleplayer is fully local.** No server process, no listeners, no network requests from SP surfaces. The engine is a library in the app process; turns cost the player's CPU and nothing else.
2. **The online mode loads https://ahousedividedgame.com in a webview.** Desktop uses a dedicated zero-capability window. Mobile, where Tauri supports only one webview, navigates the main webview so OAuth callbacks and the multiplayer cookie jar stay inside the app; Android Back follows web history to return to the local client. Tauri remote API access is not enabled, so remote pages cannot use the main window's local fs, dialog, or command permissions. Desktop OAuth navigation is limited to the same Discord and Google hosts used by the existing mobile client. Never enable remote-domain IPC access.
3. **Capabilities are minimal and per-window.** The SP window holds dialog open/save, read/write access to dialog-picked files, and only the filesystem operations required for managed slots under `$APPDATA/saves/**` (read, write, atomic rename, create/list, stat, and delete). No other persistent filesystem path is in scope.
4. **Saves are inert data.** Loading validates format and schema version and fails hard; no code or paths execute from a save file.

## Determinism doctrine (binding)

No `Math.random`, `Date.now`, or IO inside `packages/engine` or `packages/content`. All randomness flows through the world RNG; all time from the world calendar. Any WorldState shape change bumps `SCHEMA_VERSION` with a load migration in the same PR. Determinism is test-enforced; keep it that way.

## Verification

`npm run verify` from the repo root (typecheck all workspaces + engine tests) is the merge gate. Desktop changes additionally require `npm run build:web --workspace apps/desktop` and `cargo check` in `apps/desktop/src-tauri`.
