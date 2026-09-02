# ahd-client absorption audit

Read-only audit of `<legacy-client-checkout>` (Electron, v1.3.0, MIT) against ROTUNDA's multiplayer window, done for P3 (see ROADMAP-1.0.md). Every claim below is sourced from `ahd-client` source at the paths given; nothing is inferred from its docs without cross-checking the code. ROTUNDA-side facts are sourced from `apps/desktop/src-tauri` as of this branch (`feat/p3-mp-polish`).

## Architectural note before the feature list

ahd-client is not a thin webview shell. Its Electron main process runs a full second application alongside the web content: an SSE client (`src/sse.js`) connected to `/api/events` using cookies pulled from the session partition, a 30/60s dashboard poller (`src/dashboard.js`) as an SSE backstop, and an offline action-replay queue (`src/action-queue.js` + `src/cache.js`) — all living in the trusted main process, all reading/writing the game's own cookies and REST API directly. Tray, notifications, PiP, the menu bar, and the command palette are all downstream consumers of that live game state.

ROTUNDA's `docs/FRAMEWORK.md` security doctrine states multiplayer is "a webview onto https://www.ahousedividedgame.com in a dedicated window" that "never gets Tauri IPC, never gets capabilities" (#2), and ROADMAP-1.0.md's P3 line calls it "the hardened multiplayer viewer" — a deliberately thinner design than ahd-client, not an oversight. Anything below that depends on ahd-client's main-process game integration (tray game state, notifications, PiP, action queue, live-data menu) is NOT reachable from inside the "online" webview under that doctrine — it would require ROTUNDA's *Rust* main process to independently talk to the game API using cookies from the online window's persistent session store, i.e. rebuilding ahd-client's SSE-client-in-main-process pattern in Rust. That is a real architectural addition, not wiring, and is called out per-feature below as "Tier 3."

## Feature inventory

### Auto-update
`src/updater.js` (192 lines) wraps `electron-updater` (`autoUpdater`). `autoDownload = false`, `autoInstallOnAppQuit = true`. Flow: checks 10s after window creation (`src/main.js:758`) and hourly-configured (`config.js:98`, though nothing currently calls it on an interval — only the one-shot 10s check and the `check-updates` IPC channel), prompts via `dialog.showMessageBox` on `update-available`, downloads on user confirm with explicit failure dialog (`startDownload()`, `updater.js:120-146`), prompts again on `update-downloaded`, installs via `autoUpdater.quitAndInstall(false, true)` (force-relaunch). Publish target: `package.json` `build.publish` = GitHub releases, `Egg3901/ahd-client`. Update state also drives the tray icon (`tray.js` `setUpdateAvailable`/`setUpdateReady`) and a Windows taskbar progress bar.
**ROTUNDA**: no updater plugin in `Cargo.toml`; `ROADMAP-1.0.md` P2 ("packaging: tauri bundle, icons, updater plugin") already owns this as a separate, not-yet-started wave.
**Tier**: 2 (Tauri plumbing — `tauri-plugin-updater` + signed releases + a publish target; no dependency on Tier 3).

### System tray
`src/tray.js` (293 lines). Live menu built from `gameState` (turns to election, action points, unread count), update status, and queue count; throttled rebuild (1s) on SSE bursts. Click focuses/shows main window. Dock/taskbar badge via `app.setBadgeCount` (macOS/Linux) and Windows progress-bar-as-status (`updateBadge()`, lines 219-247). "Toggle Focused View" item wired from `main.js`.
**ROTUNDA**: no tray at all (`tauri.conf.json` has no `trayIcon` config, Cargo.toml has no tray feature enabled on the `tauri` dependency).
**Tier**: a bare tray icon (open/focus/quit) is Tier 2. A tray that shows turns-to-election/AP/unread — everything that makes ahd-client's tray useful — is Tier 3 (needs live game state in the Rust process).

### Native OS notifications
`src/notifications.js` (243 lines). Maps 9 SSE event types (`turn_complete`, `election_resolved`, `bill_enacted`, `bill_voted`, `campaign_update`, `election_started`, `notification`, `action_points_refreshed`, `poll_results`, `achievement_unlocked`) to native `Notification` popups, only when the window is unfocused. Action buttons on macOS/Linux (`election_resolved` → "View Election", `turn_complete` → "View Dashboard"). Click focuses window and clears unread.
**ROTUNDA**: no notification plugin, no SSE client anywhere.
**Tier**: 3 in full (event-driven, needs the SSE-in-Rust rebuild). A generic "you have a notification" ping with no event typing is not meaningfully cheaper — the event types are the point.

### Deep links / custom protocol
`ahd://` registered via `app.setAsDefaultProtocolClient('ahd')` (`main.js:1469`). Handled three ways: `open-url` (macOS, `main.js:1519`), CLI arg on first launch (`main.js:1512-1515`), and `second-instance` (Windows/Linux single-instance relay, `main.js:1525-1535`). `navigateToArg()` strips `ahd://` and rewrites to the active game URL, validated against `config.isTrustedGameUrl` before loading (`main.js:1485-1504`).
**ROTUNDA**: no deep-link plugin, no protocol registration, no single-instance lock.
**Tier**: 2. `tauri-plugin-deep-link` + `tauri-plugin-single-instance` are drop-in; the receiving end is one more Rust command shaped like `open_online_window` (navigate-with-path instead of navigate-to-root), so it inherits the same zero-capability-webview pattern already built in P3 — no Tier-3 dependency.

### Window management
`src/windows.js` (248 lines): six named pop-out presets (elections/congress/campaign/state/country/notifications), each a singleton `BrowserWindow` with its own bounds persisted per-preset via `cacheManager.getPreference('windowBounds.<preset>')`, debounce-saved 500ms after resize/move, validated against current display geometry before restore (`_isVisibleBounds`). Same `contextIsolation`/`sandbox`/`persist:ahd` webPreferences as main. Plus `openCustom()` for ad hoc URLs.
Notably: ahd-client's **main window itself does not persist bounds** — `main.js:149-165` uses fixed `config.WINDOW_WIDTH/HEIGHT` (1280×800) every launch. Only pop-outs and the PiP widget remember geometry.
**ROTUNDA**: this branch adds `tauri-plugin-window-state`, which persists bounds for every window by label (main and online) automatically — strictly *more* than ahd-client does for its main window, though ROTUNDA has no pop-out preset windows to persist bounds for.
**Tier**: N/A for the base behavior (done, see "Already covered" below). Pop-out preset windows (elections/congress/etc. as separate windows) are Tier 3 only in the sense that they'd need their own `on_navigation`/`on_new_window` guards like `open_online_window` — mechanically cheap per-window, Tier 2 — but deciding whether ROTUNDA's "hardened viewer" doctrine wants N more capability-scoped windows at all is a design call, not just effort.

### Menu bar
`src/menu.js` (891 lines, the largest file in the client). Full custom application menu: Game (quick links, reload, clear cache, quit), Navigate (deeply data-driven — profile/character switcher, home state legislature+party+election links, national executive/legislature/budget/campaign/map/parties/elections, corporation + CEO wage tools, pop-out submenu), Account (settings, admin panel, sign out, versioned changelog link) when signed in, Admin (conditional on `isAdmin`), View (theme submenu synced bidirectionally with the site's `data-theme`, focused-mode toggle, turn-alert toggle, game-server switcher for sandbox/dev, zoom, fullscreen, PiP toggle, "Open at Login"), Help (wiki, feedback, Discord), Developer (dev-build only: devtools, SSE event log). Bulk corporation wage tool (`handleBulkWage`, lines 752-887) is a genuinely game-specific power-user feature: paced POSTs respecting a server rate limit, with a progress bar and partial-failure reporting.
**ROTUNDA**: `tauri.conf.json` has no menu config; Tauri's default OS menu (or none) is used.
**Tier**: Static items (reload, quit, zoom, fullscreen, theme picker) are Tier 2. Everything data-driven (Navigate's character/state/party links, Account, Admin, the wage tool) is Tier 3 — it all reads `manifest`/`user` state that only exists because ahd-client's main process independently calls `/api/client-nav`.

### IPC surface
`src/preload.js` exposes `window.ahdClient` via `contextBridge` with an explicit allowlist: 17 receive channels (`RECEIVE_CHANNELS`, lines 4-20) and 27 invoke channels (`INVOKE_CHANNELS`, lines 23-52), covering game state, theme, preferences, the action queue, window management, PiP, feedback/screenshot, updates, SSE status, admin flag, navigation, zoom, and external links. `src/ipc.js` (364 lines) implements every handler. `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` throughout (main window `main.js:157-163`, pop-outs `windows.js:105-111`, PiP `pip.js:287-293` via a *separate* `pip-preload.js`).
**ROTUNDA**: the "online" window has **zero** IPC surface by design (`capabilities/online.json`, empty `permissions` array, this branch). This is the single largest and most deliberate divergence: ahd-client's entire feature list exists because its webview *can* call back into Electron; ROTUNDA's cannot and per doctrine should not.
**Tier**: N/A — not a gap to close, a design decision already made and now explicitly documented (`capabilities/online.json`, this branch).

### Security posture
ahd-client: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` on every window; `session: 'persist:ahd'` shared across main/pop-outs/custom windows (not PiP, which uses the default partition); external links routed through `shell.openExternal` via `setWindowOpenHandler` (`main.js:207-213`) and `will-navigate` (`main.js:215-220`), both gated on `isGameUrl()`; no `remote` module usage found anywhere in `src/`.
**ROTUNDA**: `on_navigation`/`on_new_window` (this branch, `src-tauri/src/lib.rs`) achieve the equivalent external-link containment, but structurally stronger — ahd-client's webview *has* IPC and *chooses* not to expose dangerous channels; ROTUNDA's online webview has no IPC to choose from.
**Tier**: N/A — already at parity or better, this branch.

### Session/cookie persistence
`GAME_SESSION_PARTITION = 'persist:ahd'` (`main.js:110`), explicit persistent partition shared by main window and most pop-outs. User-Agent stripped of the `Electron/` token for that partition only (`configureGamePartitionUserAgent`, `main.js:117-127`) because some avatar/asset CDNs block requests that self-identify as Electron.
**ROTUNDA**: default Tauri persistent webview data store (no `incognito`), documented this branch (`src-tauri/src/lib.rs` doc comment on `open_online_window`). No UA rewriting.
**Tier**: N/A, done. UA rewriting is a Tier-2 one-liner (`WebviewWindowBuilder::user_agent`) *if* the same asset-blocking problem is ever observed against ROTUNDA's online window — not verified either way, flag for the owner rather than pre-emptively building it.

### Auto-launch on login
`app.setLoginItemSettings({ openAtLogin })`, exposed as a View-menu checkbox, non-Linux only (`menu.js:598-610`).
**ROTUNDA**: nothing.
**Tier**: 2 (`tauri-plugin-autostart`).

### Crash reporting / telemetry
Searched all of `src/*.js` for Sentry/GlitchTip/Bugsnag/crash-reporter: **none found**. `package.json` has no error-tracking dependency. ahd-client ships with zero crash telemetry.
**ROTUNDA**: also none.
**Tier**: N/A — parity already (both absent). Not an absorption blocker either way.

### Splash / loading / error recovery
`src/loading.html` shown via `loadFile` before the first game navigation (`main.js:168`), swapped for the real URL on `ready-to-show`. Four recovery overlays injected via `executeJavaScript` on failure: not-found (404), server-error (5xx, or a 200 response whose `document.contentType` is `application/json` — `main.js:931-948`, catches API errors leaking through with no HTTP error code), connection failure, and certificate failure (regex-matched from the Chromium error string, `safe-load-url.js:16`) — each with Go Back / Go Home / Retry buttons (`injectErrorOverlay`, `main.js:1184-1231`). An offline action-queue banner (`injectQueueBanner`/`dismissQueueBanner`, `main.js:1368-1400`) shows pending-action count while reconnecting.
**ROTUNDA**: no loading screen (webview shows blank/default browser error page on failure), no recovery overlay, no offline queue (moot — ROTUNDA's online window has no IPC to queue actions through).
**Tier**: loading screen + generic connection/cert-error overlay = Tier 2 (same `on_navigation`/`did-fail-load`-equivalent pattern; Tauri's `WebviewWindow` has `on_navigation` already wired this branch, a failed-load hook is the same shape). The JSON-leak detection and offline action queue are ahd-client-specific to its thick-client action-replay model and don't map onto a pure webview at all — not applicable regardless of tier.

### Badge counts
Dock badge (macOS/Linux, `app.setBadgeCount`) and Windows taskbar progress-bar-as-status, both driven by unread notification count (`tray.js:219-247`).
**ROTUNDA**: none.
**Tier**: 3 (needs an unread count, which needs Tier-3 game-state access).

### Cache management
"Clear Cache & Reload" menu item calls `session.clearCache()` on the `persist:ahd` partition (`menu.js:150-163`).
**ROTUNDA**: no menu, so no such item; Tauri's webview cache is otherwise unmanaged.
**Tier**: 2 if a menu exists at all to hang it off; trivial once there's a Rust command with `WebviewWindow` access (same shape as `open_online_window`).

### PiP / mini-mode
`src/pip.js` (462 lines) + `pip-view-poller.js` + `pip.html`/`pip-preload.js`. A frameless, transparent, always-on-top, `skipTaskbar` widget showing a persistent stat bar (AP/funds/cash/portfolio/political influence/favorability/national influence/turn — configurable order) plus five cyclable views (standard/corp/elections/global/custom-panels). Own bounds persistence, own IPC (`pip-open-main`, `pip-navigate`, `pip-cycle-view`, `pip-set-custom-panels`), own poller hitting game API endpoints independent of the main SSE stream.
**ROTUNDA**: nothing.
**Tier**: 3, and one of the largest single features in the file — it's a second full webview-plus-poller subsystem layered on Tier-3 game-state access.

### Global keyboard shortcuts
`src/shortcuts.js` (206 lines), `globalShortcut` (OS-level, works unfocused): 10 defaults (campaign, focused-view toggle, fundraise, poll, advertise, notifications, status-bar toggle, feedback, mini-mode toggle, command palette), user-remappable via cache-stored overrides.
**ROTUNDA**: none.
**Tier**: 2 for the registration mechanism (`tauri-plugin-global-shortcut` + a route-aware variant of `open_online_window`); most of the *actions* those shortcuts trigger (toggle mini-mode, open feedback, toggle status bar) are themselves Tier 3 or N/A-by-design (see PiP, feedback).

### Command palette (Cmd/Ctrl+K)
Injected overlay (`injectCommandPalette`, `main.js:1246-1362`) built from `currentNav` (country-specific routes) plus 7 static routes; fuzzy-ish substring filter, arrow-key navigation, click/Enter to navigate.
**ROTUNDA**: none.
**Tier**: 3 (route list depends on `client-nav` manifest data, same as the menu).

### Feedback / screenshot capture
`src/feedback.js` (124 lines): `webContents.capturePage()` → PNG, written to a temp file, system info (platform/arch/OS/Electron/Chrome/Node versions, memory, CPU count) bundled, dispatched to the renderer as a `CustomEvent` to open the site's own feedback modal. Also an independent "Save Screenshot" dialog flow.
**ROTUNDA**: none; also structurally harder — `capturePage()` and `dialog.showSaveDialog` both need capabilities the online webview deliberately doesn't have. Screenshot capture would need to happen Rust-side on the `WebviewWindow` (Tauri supports this) and be handed to a *site-provided* upload endpoint rather than injected back into the page, since there's no IPC to dispatch a `CustomEvent` through.
**Tier**: 3, and one of the more architecturally awkward ports — not a straight IPC-channel copy.

### Theme sync
Bidirectional: site → native via a `MutationObserver` on `data-theme` injected on every navigation (`reinitializeThemeObserver`, `main.js:449-476`) calling back through `window.ahdClient.invoke('theme-changed-on-site', ...)`; native → site via `pushThemeToSite()` PATCHing `/api/settings/theme` with cookies pulled from the session partition (`main.js:259-283`); also drives `nativeTheme.themeSource`, window background color (per-theme palette, `THEME_BACKGROUNDS`), and Windows titlebar overlay color.
**ROTUNDA**: none — no reason to have one yet, since there's no native chrome whose color needs to track the site theme.
**Tier**: 3 if ever wanted (needs the MutationObserver-injection pattern, which again needs *some* IPC path back out of the webview — currently none exists by design).

### Packaging / distribution
`electron-builder`: NSIS installer (Windows), DMG (macOS, `hardenedRuntime: false`), AppImage (Linux). `publish.provider: 'github'`, `owner: 'Egg3901'`, `repo: 'ahd-client'` — this is also the update feed `electron-updater` reads from.
**ROTUNDA**: `tauri.conf.json` `bundle.targets: "all"`, no publish/update-feed config. Matches `ROADMAP-1.0.md` P2 scope exactly (packaging + updater are explicitly the same not-yet-started wave).
**Tier**: 2, already tracked as P2.

## Already covered by this P3 pass (not gaps)

- Session/cookie persistence across restarts — verified as the Tauri default, documented in `src-tauri/src/lib.rs`.
- External-link handling — `on_navigation` + `on_new_window` in `open_online_window` (`src-tauri/src/lib.rs`), stronger than ahd-client's because the online webview has no IPC to abuse in the first place.
- Window state (size/position) — `tauri-plugin-window-state`, applies to every window by label, which is more than ahd-client does for its own main window.
- Window title — "A House Divided: Online" set in the Rust command.
- Close-to-launcher — closing the online window refocuses "main"; nothing quits the app since main stays alive throughout (Rust `on_window_event` handler, this branch).

## What must be built before ahd-client can be archived

This is a scoping question as much as an effort estimate: ROTUNDA's stated design (`FRAMEWORK.md` doctrine, `ROADMAP-1.0.md` "hardened multiplayer viewer") is a thinner client than ahd-client on purpose. Full feature parity would mean rebuilding ahd-client's entire main-process game-integration layer (SSE client, dashboard poller, cookie-authenticated REST calls) in Rust — a second implementation of client-side game logic that today lives only in ahd-client's JS. That's a real architecture decision, not a default. The waves below are ordered cheapest/least-coupled first; where to stop is an owner call.

**Wave 1 — Tauri plumbing, no game-state dependency (~1 wave):**
`tauri-plugin-updater` + signed release publishing (already scoped as P2), `tauri-plugin-deep-link` + `tauri-plugin-single-instance` for `ahd://` links (reuses the `open_online_window` Rust-command pattern from this branch), `tauri-plugin-autostart` for open-at-login, a bare tray icon (open/focus/quit only, no live state), a loading screen + generic connection/cert-error overlay on the online window (same `on_navigation`-family hooks already in place).

**Wave 2 — the game-state bridge (~2-3 waves, the real fork in the road):** an SSE (or polling) client living in ROTUNDA's Rust main process, authenticated with cookies read from the online webview's persistent session store, feeding a small internal game-state struct. This is the one piece every Tier-3 feature below depends on; nothing in Wave 3 is buildable without it.

**Wave 3 — features built on Wave 2 (~1 wave each once Wave 2 exists):** tray with live turn/AP/unread state + badge counts, native OS notifications on game events, a data-driven menu bar (Navigate/Account/Admin), command palette. Roughly one wave per feature since Wave 2 does the hard, shared part.

**Wave 4 — standalone, high-effort, lower-certainty value (~1-2 waves each, recommend owner sign-off before starting):** PiP mini-dashboard (a second webview+poller subsystem — the single biggest single item in ahd-client after the menu), feedback/screenshot capture (needs re-architecting around the no-IPC constraint, can't be a straight port), bidirectional theme sync (no native chrome currently needs it), pop-out preset windows (elections/congress/campaign/etc. as separate windows — mechanically cheap per-window but multiplies the capability-scoped-window surface area, worth asking whether the doctrine wants that at all), global shortcuts, bulk corporation wage tool (menu.js's most game-specific single feature, low reuse elsewhere).

**Not applicable regardless of wave:** offline action-replay queue (ROTUNDA's online window has no IPC to queue actions through — this is ahd-client's thick-client-with-local-replay model, which the webview-viewer design doesn't have), crash reporting (absent on both sides, not a gap), JSON-response-leak detection (specific to ahd-client's `executeJavaScript`-content-type-sniffing pattern, not something a bare webview can do without IPC either).

**Recommendation:** archive-readiness is not a single number. Wave 1 is cheap and worth doing regardless of the bigger decision. Wave 2 is the real commitment — it's a second game-client implementation in Rust, and everything past it (tray/notifications/menu/PiP/command-palette) is gated on that choice being made deliberately, not backed into feature-by-feature.
