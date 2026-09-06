# AHDClient framework

AHDClient is the desktop client for A House Divided. One app, two modes: the live multiplayer game in a guarded webview, and singleplayer, which is the same game run entirely on the player's machine.

This document is the integration contract. Changing a contract here requires updating this file in the same commit.

## What singleplayer is

Singleplayer is not a port. It is the A House Divided server (the `AHDGame` repository's Next.js standalone build) running locally under a bundled Node, against a MongoDB that the game's own launcher script finds on the machine or downloads once, with one local account that the server mints a session for. The client never re-implements a screen, a map or a mechanic; every one of them is the multiplayer game's own, served from loopback.

What the client owns, and all it owns:

| Concern | Owner |
|---|---|
| Worlds: one data directory per world under the app data folder, with a small `world.json` (name, era preset, turn, character, timestamps) | Rust (`lib.rs`) |
| The game process: Node sidecar running `game/launch.mjs` from the bundled resources, one at a time, pinned to a free loopback port | Rust |
| Readiness and progress: the launcher's stdout streamed to the launcher window as `game:log` events; `ready at` is the readiness signal | Rust |
| Talking to the game from the launcher (new world, status): an HTTP proxy command, loopback only, JSON only | Rust (`game_request`) |
| The launcher UI: eras, worlds, boot progress, the running-world screen, multiplayer entry | React (`apps/desktop/src`) |
| Everything a player sees once the game window opens | AHDGame, unchanged |

## Module boundaries

| Module | Owns | Never touches |
|---|---|---|
| `apps/desktop/src-tauri` | Windows, the game process, worlds on disk, HTTP to loopback | Game content |
| `apps/desktop/src` | Launcher screens | Filesystem, shell, network (CSP and capabilities forbid all three) |
| `apps/desktop/src-tauri/resources/game` | The staged AHDGame singleplayer build, produced by `scripts/prepare-game.mjs`, never committed | Client code |
| `apps/desktop/src-tauri/binaries` | The Node sidecar per target triple, staged by the same script, never committed | Client code |

## Game contract

The client depends on exactly these AHDGame surfaces and nothing else:

- `scripts/singleplayer/package.mjs` produces `dist/singleplayer/` containing `server.js`, `launch.mjs`, `.next/`, `public/`, `node_modules/`.
- `launch.mjs --port N --home DIR --no-browser --parent-pid P` starts MongoDB and the server, prints `[ahd] ready at http://127.0.0.1:N` on stdout, mints and persists the server's secrets under `DIR`, mirrors art under `DIR/cdn`, and exits (taking MongoDB with it) when process `P` disappears.
- `GET /api/singleplayer/status` and `POST /api/singleplayer/new-game {preset, displayName?}`, both loopback-only on the server side.
- Era presets `1953-default` through `2023-default`, mirrored in `apps/desktop/src/worlds.ts`.

A change to any of these is a change to this contract and lands in both repositories together.

## Security doctrine (binding)

1. **Singleplayer listens on loopback only.** The server binds `127.0.0.1` on a port chosen at start; MongoDB binds `127.0.0.1` on its own port. Nothing on the player's network can reach either. The server's own singleplayer routes additionally refuse any Host header that is not loopback, and refuse to run at all when a hosting-provider environment marker is present.
2. **The game window is a plain webview.** It loads the loopback origin, may navigate only within that origin and port (anything else opens in the system browser), denies popups, and holds zero Tauri capabilities (`capabilities/game.json`). The game talks to its server over HTTP exactly as a browser would.
3. **The online window is unchanged from 1.x.** Loads `https://ahousedividedgame.com`, may navigate to the site and the approved OAuth hosts, zero capabilities (`capabilities/online.json`). Never enable remote-domain IPC access.
4. **The launcher window has no filesystem, shell or network access.** It invokes Rust commands and nothing else. Worlds are created, listed and deleted in Rust with slot names restricted to `[A-Za-z0-9_-]`; the HTTP proxy accepts only absolute paths without `..` and only reaches the running game's port.
5. **The game process cannot outlive the client.** Rust kills it on exit and on stop; the launcher script polls the client's pid and shuts down on its own if the client dies without warning.
6. **Downloads are pinned.** Node (`scripts/prepare-game.mjs`, `NODE_VERSION`) is fetched at build time from nodejs.org. MongoDB (`launch.mjs`, `MONGO_VERSION`) is fetched at first run from fastdl.mongodb.org, and only the server binary is extracted.

## Verification

`npm run verify` from the repo root (typecheck plus the bounded test suite) is the merge gate. Rust changes run `cargo test` in `apps/desktop/src-tauri` with a staged Node sidecar (`node scripts/prepare-game.mjs --node-only`). A release bundle requires the game staged as well (`node scripts/prepare-game.mjs --game-dir <AHDGame checkout>`), which the release workflow does from a fresh AHDGame checkout.

## 2.0.1 integration

Singleplayer and Worldsim are Beta. New worlds use `POST /api/singleplayer/setup`
with `{preset, mode, difficulty, autonomyLevel, featureFlags?, displayName?}`.
Modes are `normal`, `head-of-state`, and `worldsim`; difficulty is independent
of the existing autonomy ladder. Normal players enter `/create-character`
before `/profile`; simulations do not create a character. Status includes mode.
The client stores setup choices with world metadata to recover interrupted setup.

Worldsim advances through `POST /api/singleplayer/worldsim/advance {turns: 1}`
in a client-owned, bounded loop. Cancellation finishes the current turn.
`GET /api/singleplayer/worldsim/stats` returns native headline statistics;
`/singleplayer/worldsim` is the optional spectator view. All these game routes
must enforce `requireSingleplayer`, never hosted admin authorization.

Gameplay defaults to a child webview inside the main native window, leaving a
64px launcher toolbar. Separate windows remain optional. Capabilities target
webview labels, not the containing window: only `main` has launcher IPC, and
embedded/standalone game content has none. Resizing keeps the toolbar exposed.

Account linking opens `/client/link`; Rust reads the platform WebView session
cookie and requests `/api/client/account` on the fixed official HTTPS origin.
Cookies are never returned over IPC or written to launcher storage. Offline
play does not require an account; online entitlements are checked online.

Statistics use `/api/singleplayer/statistics` for local allowlisted aggregates
and `/api/client/statistics` for anonymous ingress. The HTTP sender is separate
from the authenticated webview and sends no cookies or authorization. Sharing
can be disabled in Settings or setup, which clears pending reports and gates
native delivery. The offline queue is limited to 10 reports and 24 hours.
Deploy the receiving endpoint with access-log IP retention disabled for this
route and its 30-day expiry index before enabling collection in a release.

Windows release CI runs the bundled Node against a canonical long path through
the same adapter used at launch. Linux tests cannot validate Windows runtime
behavior. Game-side changes must land before the desktop release is packaged.

The Node supervisor accepts `shutdown\n` on its stdin control pipe. Desktop
stop sends this command before a bounded fallback kill so the supervisor can
terminate the game server and MongoDB, including on Windows. Package the matching
launcher script with the desktop; older supervisors do not implement this command.
