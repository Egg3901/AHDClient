# Changelog

## [2.3.11] - 2026-09-12

- Keep native Ask linked-account handoff working for accounts already routed through unified Lakeside auth.
- Bound Apple Foundation Models retrieval, live-tool lookup, and on-device generation so stalled requests fail visibly instead of spinning forever.

## [2.3.10] - 2026-09-11

- Restore native Ask linked-account handoff on iOS and Android, including the unified Lakeside auth cookies used by the current sign-in flow.
- Let Apple Foundation Models questions reach grounded Ask evidence and the on-device answer path after the linked account is detected.
- Give Apple Foundation Models one authenticated, read-only live game lookup and show its execution as native tool activity instead of raw protocol text.
- Enable cited on-device answers and native charts or diagrams, and report the actual AFM variant on supported iOS 27 devices.

## [2.3.9] - 2026-09-11

- Route Ask and account sign-in through the canonical Lakeside auth portal on desktop, Android, and iOS.
- Ground Apple Foundation Models answers with Ask's retrieved game documentation and show the supporting source files while keeping answer generation on-device.
- Keep the standalone Ask app's Apple Foundation Models option aligned with the hosted Ask release.

## [2.3.8] - 2026-09-11

- Add an optional Apple on-device Ask provider for supported iOS 26 devices. Ask retrieves bounded game evidence for the selected question, then the answer is generated on the iPhone and is not saved; live game data, citations, charts, and attachments remain on the Ask server path.
- Show the serving Free Router model while a native Ask answer is being drafted.
- Fix native Ask sign-in after auth hardening by capturing the `__Host-ask_session` cookie and using POST for logout.
- Harden Android startup so optional widget, JobScheduler, and push companion failures cannot terminate the main client WebView.
- Release the current Head of State singleplayer path with the AHDGame 1.8.3 pairing verified.

## [2.3.6] - 2026-09-11

- Add an Ask button to the launcher header and the playing toolbar. It opens the player Q&A service in a narrow panel docked against the right edge of the screen, so questions sit beside play. Reopening resumes the same panel in place: history and an in-flight answer survive closing and reopening, and the platform minimize and close buttons work as expected. Sign-in rides the shared app session, so players already signed in skip the password prompt; the daily question allowance is shown inside the panel.

## [2.3.5] - 2026-09-10

- Make Windows updates visible during installation and leave relaunch ownership with the installer, removing the unexplained blank interval after Restart.
- Record failed updater handoffs on the next launch and automatically submit bounded, redacted crash, setup and updater diagnostics.
- Add the 2027 starting era backed by the new `2027-default` game seed.
- Pull era photographs back to show the full composition and enlarge the globe into a restrained, site-style background element.
- Pair with AHDGame 1.8.3 so permanent head-of-state singleplayer characters can enact validated national laws directly without legislative votes.

## [2.3.4] - 2026-09-10

- Never replace a newer bundled game with an older published runtime, while keeping compatible prior game versions selectable.
- Keep local-world loading progress inside its track and prevent reported progress from moving backwards.
- Repair the era timeline preview width and show complete era names instead of clipped labels.
- Mark desktop game webviews as AHDClient surfaces so cookie disclosure and online-player indicators stay out of the native shell.
- Remove the game's duplicate singleplayer End Turn control when the native toolbar already provides it.

## [2.3.3] - 2026-09-10

- Prevent two client instances from opening the same world database, and pair this with an atomic shared MongoDB runtime install.
- Recover local worlds from inherited hosted maintenance state and improve first-world seed reliability.
- Default to the newest published game runtime, download it when needed, and avoid listing the bundled version twice.
- Replace the era carousel with a seven-stop chronological timeline and a stronger selected-era preview.
- Render the launcher globe against its real layout size at up to 3x display density.
- Add locale-aware English and German client-shell language selection. Existing browser-based account login remains unchanged.
- Keep singleplayer on the multiplayer game codebase: only the local supervisor and local startup repair differ.

All notable AHDClient changes are recorded here.

## [2.3.2] - 2026-09-10

- Open singleplayer setup on the Normal play mode even when Worldsim was used last. A stored Worldsim mode was leaking across entry points; the Worldsim tab still preselects simulation mode.
- Restyle world setup with selectable option cards, a visible checked state, and an era hero banner. The play-mode, autonomy, and world-setting controls previously fell back to unstyled browser defaults.
- Rework world setup and Settings into compact, grouped control surfaces with stronger hierarchy, native switches, responsive layouts, and keyboard-visible focus states.
- Trim the playing toolbar to window-level controls only. The account chip, Settings, and Diagnostics duplicated the game below; both dialogs stay reachable through the launcher and the Escape shortcut.
- Slim the embedded-game toolbar and show native turn progress with a spinner and current turn while singleplayer simulation runs.
- Label the runtime selector explicitly and identify the bundled game as 1.8.0, the first downloadable game-version baseline.
- Drop the "THE FULL GAME / ON YOUR MACHINE" tagline block from the Windows installer sidebar artwork.

## [2.3.1] - 2026-09-09

- Start local play with native world setup and character creation. End turn stays locked until a character exists, except in Worldsim.
- Keep the launcher globe anchored while menus cover it, with softer overlap and lighting that matches the website.
- Add a compact playing bar with End turn, linked identity, pause, and save controls. Refresh the current game page and show actual funds/actions changes after a turn.
- Explain autonomy and difficulty separately, show v4 as the live multiplayer tier, and label permanent head of state and Worldsim as Beta.
- Show linked account pictures from trusted hosts, or Admin for an unlinked local identity. Keep account privileges separate from local play.
- Organize settings into Launcher, Game, Updates, and Support, with startup logs and diagnostics under Advanced.
- Bundle local maintenance, session, and turn-progress fixes. The progress popup is singleplayer-only, centered on phones, and reports stale or disconnected turns without spinning forever.

- Download desktop updates in the background and wait for Restart to update before installing. Windows quiet install starts only after that confirmation, so the app does not exit while the file is still downloading.
- Stage only the runtime game payload: traced modules, mongodb aliases, the target sharp native, server.js, launch.mjs, .next/static and public. Fail packaging if leftover source, docs, tests or plan markdown remain.

## [2.3.0] - 2026-09-09

- Replace the singleplayer maintenance soft lock with a limited local Control Room. Local players remain non-admins while retaining safe start, pause, turn, rules and diagnostic controls.
- Redesign briefing widgets around character and corporation identity with PFPs, logos, monogram fallbacks and calmer rounded metric tiles.
- Add a private Stocks view and native Stocks widgets backed by up to five corporations from the active character's real portfolio.
- Enrich Election briefing with race context, live margin and seat projections, plus recorded vote-share history.
- Add deterministic Turn Briefings built only from recorded corporation, market and election changes.
- Restrict native remote identity images to bounded HTTPS URLs on trusted A House Divided, Discord and Vercel Blob hosts.

## [2.1.2] - 2026-09-08

- Replace the overflowing update changelog strip with a compact branded card that keeps release notes collapsed, stays clear of launcher controls and can be dismissed until the next launch.
- Clear hosted maintenance state from local singleplayer after a fresh world reset, and repair affected 2.1.1 worlds when the launcher checks their status.
- Restore manual diagnostic submission with the launcher's bounded, redacted runtime context.

## [2.1.1] - 2026-09-08

- Keep iOS briefing widgets signed in by sharing the session and current briefing through an entitled Keychain group.
- Give iOS widgets a branded A House Divided layout with clearer Profile, Election and Corporation cards.
- Let the anonymously signed bundled Node runtime use JIT memory and native modules on macOS so local singleplayer can start.
- Publish updater archives for both Apple silicon and Intel Macs.

## [2.1.0] - 2026-09-08

- Add opt-in native push notifications on Android and iOS, with private previews and inbox links.

- Add a multiplayer briefing with swipeable Profile, Election and Corporation cards.
- Add an always-on-top desktop picture-in-picture briefing with quick page links.
- Add native Android home-screen widgets, refresh controls and app shortcuts.
- Add iOS Profile, Election and Corporation widgets for the Home Screen and widget stacks.
- Remember the selected briefing card, refresh on resume and reconnect, and show the age of saved stats.

## [2.0.9] - 2026-09-07

- Generate the A House Divided Liberty Bell icon into the iOS and Android native projects so TestFlight and installed mobile apps no longer use placeholder artwork.
- Add Developer diagnostics to Settings on iOS, Android and desktop with runtime details and a bounded live console.
- Let players copy, clear or explicitly send redacted diagnostics while keeping user paths, world names, email addresses and credentials out of reports.

## [2.0.8] - 2026-09-07

- Stop mobile builds from calling the desktop updater, which produced an ACL error banner on iOS.
- Keep mobile issue reports inside the app through the feedback screen, while keeping versioned GitHub reports on desktop.
- Reserve a separate mobile header row for Link account and Settings so the controls no longer cover the A House Divided masthead.
- Raise the iOS minimum version to 15.0 ahead of Apple's 2027 upload requirement.

## [2.0.7] - 2026-09-07

- Fix the Windows installer header artwork clipping the A House Divided name.
- Bundle A House Divided 1.8.0, including player-paced singleplayer turns,
  optional custom turn timers and the focused player interface.

## [2.0.6] - 2026-09-06

- Add Android and iOS builds of the launcher: the same lander, settings and account linking, with Multiplayer and Sandbox opening the live game inside the app. Singleplayer and Worldsim stay desktop only, since they run the game on the player's machine.
- Return to the launcher from any online page on mobile with the AHD mark in the corner, or the system back button on Android.
- Keep ad slots, consent prompts and the cookie banner out of the mobile app webview by identifying it to the game as AHDClient-Mobile.
- Add a mobile bundles workflow that produces the Android APK and Play bundle and the iOS archive, with store signing supplied through repository secrets and an unsigned build otherwise.
- Fix diagnostics reports never leaving the desktop launcher: the command lacked a permission grant.

## [2.0.5] - 2026-09-06

- Fix Windows local worlds never becoming ready: the game server was started on the launcher's own input and output handles, which on Windows left it accepting connections without answering. It now runs on captured output and a fresh world is ready in seconds.
- Stop the local database through its own shutdown command when a world is closed, and wait for it to finish before the supervisor exits, so the last turn is always on disk and a world can be reopened immediately.
- Keep a closing world's supervisor alive until it reports that it has exited instead of ending it after a fixed delay.
- Report each startup step in plain words with its own deadline, and on failure show the step, the game server's last output and the database log instead of a frozen progress line.
- Skip preloading every page and route in the local game server, which held the first request for several seconds.

## [2.0.4] - 2026-09-06

- Fix repeated MongoDB downloads with a shared, versioned cache that only accepts complete installations.
- Reduce fresh-world startup to seconds by skipping hosted initialization work and production-only turn auditing in local singleplayer.
- Detect stalled setup promptly, show continuing startup progress, and offer redacted opt-in diagnostics after failures or cancellation.
- Add release-gated world creation, turn processing, shutdown, and restart smoke coverage across Windows, Linux, and macOS game packages.
- Add verified game-version downloads and graceful switching for immutable game releases from 1.6.0 onward.
- Fix failed desktop updates remaining stuck on Installing and retain signed updater artifacts for Windows, Linux, and macOS.
- Restyle the installer and launcher settings with native account controls, issue reporting, gameplay hints, and clearer update controls.

## [2.0.3] - 2026-09-06

- Fix linked-account recognition for environment-scoped production sessions and replace the inert account-management action with clear Profile or Link account controls.
- Replace the launcher settings panel with a universal Esc menu containing clearer preferences and a signed check, download, update and restart flow.
- Add a thin singleplayer game-version selector for immutable game releases from 1.6.0 onward, including verified downloads and offline access to installed versions.
- Keep the command globe fixed between launcher views and strengthen the animated atmospheric background.
- Show real first-run setup phases, smooth progress and stall detection while a local world is built instead of freezing on a buffered setup request.
- Reduce local world creation and turn time by skipping production-only audits while retaining compact opt-in performance analytics.
- Add a dismissible in-game turn progress toast with the A House Divided mark, plain-English phase descriptions and a smooth progress bar.

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
