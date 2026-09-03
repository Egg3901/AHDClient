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

## Android

The checked-in Tauri Android project lives at
`apps/desktop/src-tauri/gen/android`. It packages the same local singleplayer
engine and React UI as desktop. On Android, Play Online navigates the app's
single webview so OAuth callbacks and multiplayer cookies remain in the same
session. Remote pages do not receive Tauri API access because no remote origin
is present in the capability configuration. Android Back follows web history
back toward the local launcher.

Install Android SDK Platform 36, Build Tools 36, NDK 27.0.12077973, JDK 21,
and the Rust Android targets. Then run:

```bash
npm run android:build:apk --workspace apps/desktop -- --debug --target aarch64
npm run android:build:aab --workspace apps/desktop -- --target aarch64
```

The first command is the local and CI validation build. It writes
`app-universal-debug.apk` under
`apps/desktop/src-tauri/gen/android/app/build/outputs/apk/universal/debug/`.
The AAB command produces an unsigned release bundle for validation. Play
distribution requires an owner-provided upload key. `.github/workflows/verify-android.yml`
builds and retains the ARM64 debug APK without signing secrets.

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

## Auto-updates (credential-blocked, disabled)

`tauri-plugin-updater` is **not** wired in yet. The release channel (where
signed update manifests get hosted) and the signing keypair are an owner
decision, not made here. What's staged for when that decision lands:

- `apps/desktop/src-tauri/Cargo.toml` has a commented dependency line:
  `# tauri-plugin-updater = "2"`
- `apps/desktop/src-tauri/tauri.conf.updater.example.json` has the
  `plugins.updater` config block to copy into `tauri.conf.json`
  (`pubkey` + `endpoints`), with `TBD` placeholders for the host and key

To enable:

1. Pick and stand up an update-manifest host (owner decision).
2. `npx tauri signer generate` — keep the private key out of the repo (secret
   store / CI secret), commit only the public key into the config.
3. Uncomment `tauri-plugin-updater` in `Cargo.toml`, add
   `.plugin(tauri_plugin_updater::Builder::new().build())` in
   `apps/desktop/src-tauri/src/lib.rs`.
4. Merge the `plugins.updater` block from `tauri.conf.updater.example.json`
   into `tauri.conf.json` with the real endpoint and pubkey.
5. CI publishes a signed `latest.json` per target alongside each release
   build, matching the endpoint template.

## Verification before a release build

`npm run typecheck` from repo root is the fast gate (all workspaces). Full
`npm run verify` (typecheck + engine tests) is the merge gate per
`docs/FRAMEWORK.md`; desktop-touching changes additionally need
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
