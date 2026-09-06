# Releasing AHDClient (apps/desktop)

Build commands per OS for the Tauri desktop shell. Product name "AHDClient",
identifier `net.lakesidegames.ahdclient`, version tracked in the root and desktop
`package.json` files, `apps/desktop/src-tauri/tauri.conf.json`, and
`apps/desktop/src-tauri/Cargo.toml`. Run `npm run release:check` after changing
the version. CI and bundle workflows reject version or changelog drift.

## Linux (verified, this is the build this doc was written against)

Prerequisites (Debian/Ubuntu package names):

- `libwebkit2gtk-4.1-dev`, `libgtk-3-dev` (runtime: `libwebkit2gtk-4.1-0`, `libgtk-3-0`)
- `librsvg2-bin` (only needed to regenerate icons from SVG, see below)
- Rust stable toolchain (`rustc`/`cargo`), Node 22.12+
- `dpkg-deb` for the .deb target (present on any Debian-family box)
- AppImage tooling (`appimagetool`, `linuxdeploy` + plugins) is downloaded
  automatically by the Tauri bundler on first build and cached; requires
  outbound network access on that first run

Build:

```bash
npm install
npm run build:web --workspace apps/desktop
cd apps/desktop
npx tauri build
```

Artifacts land under `apps/desktop/src-tauri/target/release/bundle/`:

- `appimage/AHDClient_<version>_amd64.AppImage`
- `deb/AHDClient_<version>_amd64.deb`

`tauri.conf.json` uses the platform-native `"all"` target set. The release
workflow narrows Linux to AppImage and deb. `.deb` dependencies
(`libwebkit2gtk-4.1-0`, `libgtk-3-0`) are auto-detected by the bundler from
the linked libraries; no manual `depends` list is needed.

## Windows

The `desktop bundles` workflow builds an x64 NSIS installer on
`windows-latest`. It can be run manually or by pushing a `v*` tag. Icons are
already generated (`icons/icon.ico`); no extra icon work is needed.

## macOS

The `desktop bundles` workflow builds DMGs for Apple Silicon and Intel on
`macos-latest`. Unsigned workflow artifacts are suitable for build validation.
Public distribution still needs an Apple Developer signing identity and
notarization credentials. `icons/icon.icns` is already generated and ready.

## Icon generation

Source of truth: `apps/desktop/src/assets/ahd-logo.png`, the canonical
red-and-navy Liberty Bell used by the live game and existing client. The A
House Divided name and logo remain Lakeside Games trademarks as noted in the
repository license.

To regenerate the full icon set after changing the source:

```bash
cd apps/desktop
npx tauri icon src/assets/ahd-logo.png
```

The `tauri icon` command generates icons for every platform. This repo commits
the desktop set and the Android resources copied into `gen/android`; iOS and
MSIX-only outputs are not release inputs.

## Auto-updates

Version 2.0.2 and later check the signed stable manifest at
`https://ops.lakesidegames.net/downloads/AHDClient-latest.json`. The updater
signature proves the installer was produced with the Lakeside release key; it
is separate from Windows Authenticode publisher signing.

Set `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` in the
release environment. Never commit or publish the private key. Tauri emits
signed updater artifacts for Windows, Linux and macOS. Build `latest.json`
after every artifact is at its final URL:

```bash
node scripts/generate-update-manifest.mjs \
  --platform windows-x86_64 https://ops.lakesidegames.net/downloads/ahdclient/AHDClient_2.0.4_x64-setup.exe windows.sig \
  --platform linux-x86_64 https://ops.lakesidegames.net/downloads/ahdclient/AHDClient_2.0.4_amd64.AppImage linux.sig \
  --platform darwin-aarch64 https://ops.lakesidegames.net/downloads/ahdclient/AHDClient_aarch64.app.tar.gz mac-arm.sig \
  --platform darwin-x86_64 https://ops.lakesidegames.net/downloads/ahdclient/AHDClient_x64.app.tar.gz mac-x64.sig
```

Publish the installer first and `latest.json` last. This prevents a client
from discovering an update whose artifact is not available yet. Every staged
game includes `AHD_BUILD.json` with the client version and exact AHDGame commit.

## Verification before a release build

`npm run verify` from repo root is the merge gate: all workspace typechecks,
all bounded unit tests, and a deterministic turn and save smoke test. Full
world simulations are deliberately opt-in through `npm run verify:full` and
do not block CI or packaging. Rust CI is path-filtered to changes under
`apps/desktop/src-tauri`. Per `docs/FRAMEWORK.md`, desktop-touching changes additionally need
`npm run build:web --workspace apps/desktop` and `cargo check` in
`apps/desktop/src-tauri` to pass before a packaging run. Begin every release
candidate check with `npm run release:check`.

## Web preview publish

The web preview is served under a subpath, so it must be built with a relative base or every asset 404s/401s against the host root:

```
npm run build:preview --workspace apps/desktop
cp -r apps/desktop/dist/. <publish dir>/
```

`build:web` (absolute base) is for the Tauri bundle only.

## Game staging

Every native bundle needs two things that are not in this repository: a Node
runtime as a Tauri sidecar and the AHDGame singleplayer build as a resource.
`scripts/prepare-game.mjs` stages both. The release workflow checks out
`Egg3901/AHDGame` at `main` (override with the `AHDGAME_REF` repository
variable) and runs it before `tauri build`. Locally:

```
node scripts/prepare-game.mjs --game-dir ../AHDGame
```

The game build is large (roughly 550 MB unpacked) and takes several minutes;
`--skip-game-build` reuses an existing `dist/singleplayer` in the checkout.
Nothing staged is committed.
