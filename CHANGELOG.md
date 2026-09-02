# Changelog

All notable ROTUNDA client changes are recorded here.

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
