<p align="center">
  <img src="apps/desktop/src/assets/ahd-logo.png" alt="A House Divided" width="140"/>
</p>

<h1 align="center">AHDClient</h1>

<p align="center">
  The native desktop and Android client for A House Divided.
</p>

<p align="center">
  <a href="https://github.com/Egg3901/AHDClient/actions/workflows/verify.yml"><img src="https://github.com/Egg3901/AHDClient/actions/workflows/verify.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/version-1.0.1-informational" alt="Version">
  <img src="https://img.shields.io/badge/tests-1528-success" alt="Tests">
  <img src="https://img.shields.io/badge/license-proprietary-red" alt="License">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white" alt="Tauri 2">
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black" alt="React 18">
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5">
  <img src="https://img.shields.io/badge/Android-SDK_24+-3DDC84?logo=android&logoColor=white" alt="Android SDK 24 and later">
</p>

---

## Overview

AHDClient is the multiplatform client for [A House Divided](https://ahousedividedgame.com): one native app with a live multiplayer entry and a fully local singleplayer sandbox. Desktop builds keep multiplayer in a hardened second webview. Android uses its single app webview for multiplayer so the existing OAuth and cookie-backed session flow stays in-app; Tauri remote API access remains disabled. Boot a local world in any era, as any playable country, advance turns at your own pace, save, and replay a seed.

Singleplayer runs no server. The simulation is a library inside the app process: no listeners, no network, no accounts. Turns cost the player's CPU and nothing else.

## Download

The first official build is available from [GitHub Releases](https://github.com/Egg3901/AHDClient/releases/latest). Windows uses an x64 NSIS installer. Android, Linux, and macOS packages are published alongside it. Release binaries are currently unsigned, so Windows SmartScreen and macOS Gatekeeper may require explicit approval from the player.

## Architecture

```mermaid
flowchart LR
  subgraph client["apps/desktop &nbsp;(Tauri 2 desktop + Android)"]
    launcher["Launcher"] --> online["Multiplayer webview\nisolated desktop window /\nsame-view mobile navigation\nremote IPC disabled"]
    launcher --> sp["Singleplayer UI\n(React)"]
  end
  sp --> engine["packages/engine\npure TS turn pipeline"]
  engine --> content["packages/content\nera seed packs"]
  online -.-> live["ahousedividedgame.com"]
  sp --> saves["versioned JSON saves\nvia dialog-scoped fs"]
```

| Module | Role |
|---|---|
| `packages/engine` | Deterministic simulation core. No Tauri, no DOM, no IO. Runs headless. |
| `packages/content` | Era seed packs: versioned world templates the engine boots from. |
| `apps/desktop` | Tauri Rust shell plus React webview for desktop and Android. Owns windows, dialogs, file IO, and mode routing. |

Design rules, in order of importance:

1. **One world document.** The entire game state is a single serializable `WorldState`. Saves are versioned JSON envelopes with forward migrations at load.
2. **Determinism.** All randomness flows through a seeded RNG stored in the world. Same seed + same actions = same world, across save/load and across machines. Tests enforce this.
3. **Phases are the porting unit.** Mainline runs ~60 ordered turn phases; each system arrives here as a pure phase over `WorldState`, preserving mainline's relative ordering.
4. **The engine never imports the platform.** Headless forever: tests, balance sims, a future CLI.

The full integration contract, module boundaries, and the binding security doctrine live in [docs/FRAMEWORK.md](docs/FRAMEWORK.md). Active parallel work streams are briefed in [docs/briefs/](docs/briefs/).

## Development

Requires Node >= 22.12 and Rust (plus `libwebkit2gtk-4.1-dev` on Linux).

```
npm install
npm run release:check # synchronized version and changelog metadata
npm run verify       # typecheck + bounded fast tests: the merge gate
npm run verify:full  # opt-in exhaustive multi-turn simulation suite
npm run dev      # tauri dev
```

Desktop changes additionally require `npm run build:web --workspace apps/desktop` and `cargo check` in `apps/desktop/src-tauri`.

## Relationship to mainline

Mainline A House Divided is a live multiplayer service. AHDClient consumes it in online mode and diverges deliberately in singleplayer: on-demand turns (one turn = one in-game week), local saves, and no anti-abuse systems. Both codebases are proprietary Lakeside Games products. Simulation logic and seed content move between them under the owner's authority. Era seed packs are designed to become a shared format: new eras get built and playtested here before mainline resets into them.

## License

[Proprietary source-available terms](LICENSE.md). Copyright Lakeside Games. All rights reserved. The source may be inspected and evaluated, but reuse, modification, redistribution, and commercial operation require prior written permission.
