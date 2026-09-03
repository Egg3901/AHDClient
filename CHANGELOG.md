# Changelog

All notable AHDClient changes are recorded here.

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
