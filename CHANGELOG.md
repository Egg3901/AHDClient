# Changelog

All notable AHDClient changes are recorded here.

## [2.0.2]

- Fix the packaged Windows game server by retaining the hashed external module aliases emitted by the Next.js standalone build.
- Complete account linking by reading the authenticated game webview session and require a server-granted Singleplayer entitlement with a bounded seven-day offline grace period.
- Gate Sandbox on a linked Supporter account and show the exact link or upgrade action when access is unavailable.
- Replace raw world-start logs with a historical loading slideshow and practical era tips; technical logs remain available through Settings.
- Add signed in-client updates from the Lakeside download portal and keep each client release paired with its bundled AHDGame build.

## [2.0.1]

- Mark Singleplayer and Worldsim as Beta and add a playerless simulation entry.
- Show New Game, Load Game and Continue before era selection; add historical era photos and a larger globe.
- Add normal and Head of State setup, independent NPP difficulty/autonomy, and world feature controls.
- Default gameplay to the launcher window, with a separate-window preference.
- Add game account linking and supporter checks for Sandbox.
- Add optional anonymous aggregate reports with bounded offline retention and immediate opt-out.
- Adapt Windows resource paths before passing them to bundled Node and isolate database ports.
- Guard process startup and stale exit events; pause launcher animation while hidden.
- Stop the game supervisor through its control pipe so stopping a world also closes its child processes.

## [2.0.0] - 2026-09-05

### Changed

- Singleplayer is now the real game. The client runs the A House Divided server locally under a bundled Node, against a MongoDB it finds on your machine or downloads once, and shows it in its own window. Every screen, map and mechanic is the multiplayer game's own; nothing is re-implemented in the client any more.
- The launcher keeps its look and gains worlds: each world is its own data folder with a name, era, turn and character, listed under All worlds. Continue resumes the most recent one; a running world can be resumed or stopped from the launcher.
- New world asks for a world name and your name, then builds the world from the chosen era's preset and drops you into character creation.
- Turns advance from an End turn button inside the game instead of a client-side turn loop.

### Removed

- The ported engine, its content packs, the CLI, every ported game screen and the save-file format. Saves from 1.x do not carry over; the worlds they described were a different simulation.
- The Android build. The local server needs a desktop operating system.

### Security

- The game window is a plain webview pinned to its own loopback port with no Tauri capabilities, the same shape as the multiplayer window. The launcher window has no filesystem or shell access; worlds and the server are managed entirely in Rust.

## [1.0.3] - 2026-09-03

### Added

- Replaced the sparse singleplayer dashboard with a multiplayer-shaped navigation shell covering all 58 stable destinations, including matching Nation, State, World, and Help grouping and ordering.
- Added player-scoped home-region identity for new and migrated worlds, with State navigation that remains anchored to the character instead of the currently viewed country.
- Added functional local controls for Governor addresses and executive orders, party endorsements and internal elections, coalition management, cabinet nominations, extraction, sovereign bonds, savings, wire transfers, law repeal, and Senate filibusters.
- Added a live country overview and grounded local summaries for destinations that do not need a dedicated screen.

### Fixed

- Stopped failed actions from consuming action points, campaign funds, cooldowns, or action counters.
- Removed fabricated chamber officeholders and corrected the fiscal approval calculation to use budget GDP in matching currency units.
- Corrected personal navigation so My Party, My Election, Cabinet Office, and State destinations follow the player character, including Head of State party binding.
- Routed the Wiki and other Help destinations through allowlisted native handlers while preserving Android in-app navigation for game-hosted pages.
- Kept unavailable mechanics visible with named blockers instead of presenting incomplete action controls.

### Quality assurance

- Added route smoke coverage across every playable era and country, all 58 destinations, and a no-network assertion for local navigation.
- Added interaction tests for Governor, party operations, Congress procedure, Head of State, markets, character migration recovery, and safe action execution.
- Verified the fast and full repository suites, the production web build, and the Tauri Rust checks before release packaging.

## [1.0.2] - 2026-09-03

### Fixed

- Moved desktop multiplayer webview creation off the Tauri UI thread so opening the live game no longer produces a frozen blank window on Windows.
- Made the new-world era choice player-controlled after entering setup instead of continuously resetting it to the launcher selection.
- Allowed historically valid high-inflation starts such as 1991 Brazil, whose 480% annual rate previously made the entire era fail editor validation and disabled world creation.

### Quality assurance

- Added browser-level interaction tests for era stability, country-list refresh, play-mode selection, feature-flag overrides, validation, and the exact options passed into world creation.
- Added a bounded creation matrix covering all 21 supported era and playable-country starts without adding long simulations to CI.
- Added a release regression that keeps native multiplayer window construction off the UI thread.

## [1.0.1] - 2026-09-02

### Ten quality improvements

1. The launcher remembers the selected singleplayer or multiplayer mode and starting era.
2. Continue prevents duplicate loads, shows progress, and reports load failures without leaving the launcher.
3. The save manager automatically selects the newest valid slot when no current selection remains.
4. Save slots can be filtered by name, player, country, era, date, turn, or cheat status.
5. The dashboard has a one-tap quick save backed by `quick-save`, with Ctrl+S and Cmd+S shortcuts.
6. Unsaved worlds now warn before launcher exit, browser unload, refresh, or window close.
7. Manual and automatic saves clear dirty state only after success, and autosaves confirm their destination.
8. Turn-processing failures are caught and shown in the dashboard instead of becoming unhandled rejections.
9. New-world character names and seeds validate immediately, mark invalid fields, and block invalid creation.
10. NPC party ballots are tallied transiently while player ballots remain persisted, reducing a measured 100-turn 1953 world from 121.3 MiB to 48.8 MiB without changing deterministic results.

### Changed

- Aligned the client palette and repository presentation with the current A House Divided visual system while retaining AHDClient's restrained launcher layout.
- Rebranded the application, package scopes, platform identifiers, build artifacts, documentation, and GitHub repository from its former codename to AHDClient.
- Changed the repository from PolyForm Noncommercial to proprietary source-available terms and marked every workspace package private and unlicensed for registry publication.
- Split multi-turn simulation proofs from the blocking CI gate. The fast gate retains more than 800 bounded tests, including a deterministic turn and save smoke test; the full suite remains available through `npm run verify:full`. Rust validation runs only when Tauri source changes.

## [1.0.0] - 2026-09-02

### Added

- Local singleplayer across the 1953, 1979, 1991, and 2019 eras with 21 playable era and country combinations.
- Career and Head of State starts, on-demand deterministic turns, government, economy, markets, parties, elections, congress, campaigns, corporations, world, character, actions, and news views.
- Save slots, rotating crash-safe autosaves, and validated JSON import and export.
- One-tap Continue from the launcher for the newest valid local save.
- Singleplayer Tools for editing player, country, politician, party, election, time, and news state.
- Twenty-six persisted simulation controls, now configurable both when a world is created and while it is running.
- Desktop multiplayer window with a separate zero-capability security boundary and persistent sign-in.
- In-app multiplayer navigation on Android, using the same session flow as the existing mobile client.
- Linux AppImage, deb, and rpm packaging; Windows NSIS and macOS DMG validation workflows; Android APK and AAB builds.
- Release metadata verification through `npm run release:check`.

### Changed

- Restored the restrained A House Divided visual direction and canonical logo across the launcher and native application assets.
- Hardened mobile layouts for safe areas, narrow screens, touch targets, and scrollable data views.
- Launcher version text now comes from package metadata instead of a hard-coded string.

### Fixed

- Save migration through schema version 42, including feature flags for older worlds.
- Multiplayer navigation isolation, external-link handling, and desktop session persistence.
- Determinism, election seat totals, government formation, politician population bounds, treasury bounds, and economy sanity across the 21-combination QA matrix.

### Distribution notes

- Repository builds are reproducible without private credentials.
- Public macOS notarization, Windows signing, Android Play signing, and updater publication require the release owner's credentials and endpoints. These are distribution operations, not source-code fallbacks.
