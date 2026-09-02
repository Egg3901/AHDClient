# Releasing ROTUNDA (apps/desktop)

Build commands per OS for the Tauri desktop shell. Product name "A House Divided",
identifier `net.lakesidegames.rotunda`, version tracked in
`apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src-tauri/Cargo.toml`, and
`apps/desktop/package.json` (keep the three in sync).

## Linux (verified, this is the build this doc was written against)

Prerequisites (Debian/Ubuntu package names):

- `libwebkit2gtk-4.1-dev`, `libgtk-3-dev` (runtime: `libwebkit2gtk-4.1-0`, `libgtk-3-0`)
- `librsvg2-bin` (only needed to regenerate icons from SVG, see below)
- Rust stable toolchain (`rustc`/`cargo`), Node 22+
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

- `appimage/A House Divided_<version>_amd64.AppImage`
- `deb/A House Divided_<version>_amd64.deb`

`tauri.conf.json` pins `bundle.targets` to `["appimage", "deb"]`. `.deb`
dependencies (`libwebkit2gtk-4.1-0`, `libgtk-3-0`) are auto-detected by the
bundler from the linked libraries; no manual `depends` list needed.

## Windows (not yet built here — runner decision needed)

Tauri produces an NSIS `.exe` and/or `.msi` on Windows. This box is Linux and
cannot cross-compile a Windows installer (Tauri bundling is host-platform
only). Options for the owner to decide:

1. A Windows CI runner (GitHub Actions `windows-latest`) running
   `npx tauri build` — the standard path.
2. A dedicated Windows build machine.

Once a runner exists, the command is the same (`npm install && npm run
build:web --workspace apps/desktop && npx tauri build` from `apps/desktop`).
Icons are already generated (`icons/icon.ico`); no extra icon work needed.

## macOS (not yet built here — runner decision needed)

Same constraint as Windows: Tauri bundles `.app` / `.dmg` only on a macOS
host, and Apple notarization requires an Apple Developer account + signing
identity. Needs a macOS CI runner (GitHub Actions `macos-latest`) or a Mac
build machine, decided by the owner. `icons/icon.icns` is already generated
and ready.

## Icon generation

Source of truth: `apps/desktop/src-tauri/icon-source.svg` (a square,
monochrome crop of the dome mark from `docs/assets/banner.svg`, on the
`#0a0a0a` dark background) and its 1024x1024 raster,
`apps/desktop/src-tauri/icon-source-1024.png`.

To regenerate the full icon set after changing the source:

```bash
# render the SVG at high resolution (requires librsvg2-bin: apt-get install librsvg2-bin)
rsvg-convert -w 1024 -h 1024 apps/desktop/src-tauri/icon-source.svg \
  -o apps/desktop/src-tauri/icon-source-1024.png

cd apps/desktop
npx tauri icon src-tauri/icon-source-1024.png
```

The `tauri icon` command generates icons for every platform (Windows/macOS/
iOS/Android included). This repo only commits the Linux/Windows/macOS desktop
set (`icons/32x32.png`, `64x64.png`, `128x128.png`, `128x128@2x.png`,
`icon.png`, `icon.ico`, `icon.icns`) — delete the `icons/ios/`,
`icons/android/`, and Windows `Square*Logo.png`/`StoreLogo.png` outputs after
regenerating, since this project does not ship mobile or MSIX builds.

## Auto-updates (scaffolded, disabled)

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
`apps/desktop/src-tauri` to pass before a packaging run.


## Web preview publish

The web preview is served under a subpath, so it must be built with a relative base or every asset 404s/401s against the host root:

```
npm run build:preview --workspace apps/desktop
cp -r apps/desktop/dist/. <publish dir>/
```

`build:web` (absolute base) is for the Tauri bundle only.
