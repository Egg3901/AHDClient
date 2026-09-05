//! AHDClient desktop core.
//!
//! The client is a shell around the real game. Singleplayer runs the A House
//! Divided server (a Next.js standalone build shipped as a resource) under a
//! bundled Node, against a MongoDB the launcher script finds or fetches, all
//! on loopback. This file owns that process, the per-world data directories,
//! and the two guarded windows: the local game and the live multiplayer site.
//!
//! Security shape, unchanged in spirit from 1.x: the launcher webview talks
//! only to these commands; the game and online windows get no Tauri IPC at
//! all and are plain webviews pointed at an origin we chose.

use std::fs;
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, RunEvent, State, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

const ONLINE_URL: &str = "https://ahousedividedgame.com";
const SANDBOX_URL: &str = "https://sandbox.ahousedividedgame.com";
const ONLINE_HOST: &str = "ahousedividedgame.com";
const SANDBOX_HOST: &str = "sandbox.ahousedividedgame.com";
const AUXILIARY_ONLINE_HOSTS: &[&str] = &[
  "www.ahousedividedgame.com",
  "discord.com",
  "accounts.google.com",
  "www.google.com",
];

/// How long a start may take before we give up. The first run downloads
/// MongoDB (30 to 100 MB), so this has to survive a slow connection.
const START_TIMEOUT: Duration = Duration::from_secs(900);
/// A new world bootstraps thirty countries; give the request room.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(900);
const LOG_TAIL: usize = 40;

// ---------------------------------------------------------------------------
// Help routing (kept from 1.x)
// ---------------------------------------------------------------------------

#[derive(Debug, PartialEq, Eq)]
enum HelpDestination {
  Online(&'static str),
  External(&'static str),
}

fn help_destination(route_id: &str) -> Option<HelpDestination> {
  match route_id {
    "help.wiki" => Some(HelpDestination::External("https://wiki.ahousedividedgame.com")),
    "help.about" => Some(HelpDestination::Online("/about")),
    "help.suggestions" => Some(HelpDestination::Online("/feedback")),
    "help.discord" => Some(HelpDestination::External("https://discord.gg/DmF8zJJuqN")),
    "help.patreon" => Some(HelpDestination::External(
      "https://www.patreon.com/cw/AHouseDividedGame/membership",
    )),
    "help.supporter-wall" => Some(HelpDestination::External("https://lakesidegames.net/supporters")),
    "help.email-support" => Some(HelpDestination::External("mailto:admin@ahousedividedgame.com")),
    "help.server-status" => Some(HelpDestination::External("https://ops.ahousedividedgame.com/status")),
    "help.privacy" => Some(HelpDestination::Online("/privacy")),
    "help.terms" => Some(HelpDestination::Online("/terms")),
    _ => None,
  }
}

fn is_online_origin(url: &Url) -> bool {
  url.scheme() == "https"
    && matches!(url.host_str(), Some(ONLINE_HOST) | Some(SANDBOX_HOST))
    && url.port_or_known_default() == Some(443)
}

fn is_online_navigation_allowed(url: &Url) -> bool {
  let secure_default_port = url.scheme() == "https" && url.port_or_known_default() == Some(443);
  is_online_origin(url)
    || (secure_default_port && url.host_str().is_some_and(|host| AUXILIARY_ONLINE_HOSTS.contains(&host)))
}

/// The local game window may only navigate within its own loopback origin.
/// Anything else (wiki, Discord, a supporter link) goes to the system browser.
fn is_local_game_url(url: &Url, port: u16) -> bool {
  url.scheme() == "http"
    && matches!(url.host_str(), Some("127.0.0.1") | Some("localhost"))
    && url.port() == Some(port)
}

// ---------------------------------------------------------------------------
// Worlds: one data directory per slot
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct WorldMeta {
  slot: String,
  name: String,
  preset: String,
  created_at: String,
  last_played_at: String,
  #[serde(default)]
  turn: Option<u64>,
  #[serde(default)]
  character: Option<String>,
}

fn now_iso() -> String {
  let secs = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map(|d| d.as_secs())
    .unwrap_or(0);
  // Civil-time conversion without a chrono dependency (Howard Hinnant's algorithm).
  let days = (secs / 86_400) as i64;
  let (h, m, s) = ((secs / 3600) % 24, (secs / 60) % 60, secs % 60);
  let z = days + 719_468;
  let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
  let doe = z - era * 146_097;
  let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
  let y = yoe + era * 400;
  let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  let mp = (5 * doy + 2) / 153;
  let d = doy - (153 * mp + 2) / 5 + 1;
  let mth = if mp < 10 { mp + 3 } else { mp - 9 };
  let y = if mth <= 2 { y + 1 } else { y };
  format!("{y:04}-{mth:02}-{d:02}T{h:02}:{m:02}:{s:02}Z")
}

/// Slot names become directory names; keep them boring.
fn valid_slot(slot: &str) -> bool {
  !slot.is_empty()
    && slot.len() <= 64
    && slot.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn worlds_dir(app: &AppHandle) -> Result<PathBuf, String> {
  let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("worlds");
  fs::create_dir_all(&dir).map_err(|e| format!("cannot create {}: {e}", dir.display()))?;
  Ok(dir)
}

fn world_dir(app: &AppHandle, slot: &str) -> Result<PathBuf, String> {
  if !valid_slot(slot) {
    return Err(format!("invalid world slot {slot:?}"));
  }
  Ok(worlds_dir(app)?.join(slot))
}

fn read_meta(dir: &PathBuf) -> Option<WorldMeta> {
  let raw = fs::read_to_string(dir.join("world.json")).ok()?;
  serde_json::from_str(&raw).ok()
}

fn write_meta(dir: &PathBuf, meta: &WorldMeta) -> Result<(), String> {
  fs::create_dir_all(dir).map_err(|e| e.to_string())?;
  let tmp = dir.join("world.json.tmp");
  fs::write(&tmp, serde_json::to_vec_pretty(meta).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
  fs::rename(&tmp, dir.join("world.json")).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_worlds(app: AppHandle) -> Result<Vec<WorldMeta>, String> {
  let mut worlds: Vec<WorldMeta> = fs::read_dir(worlds_dir(&app)?)
    .map_err(|e| e.to_string())?
    .flatten()
    .filter(|entry| entry.path().is_dir())
    .filter_map(|entry| read_meta(&entry.path()))
    .collect();
  worlds.sort_by(|a, b| b.last_played_at.cmp(&a.last_played_at));
  Ok(worlds)
}

#[tauri::command]
fn create_world(app: AppHandle, slot: String, name: String, preset: String) -> Result<WorldMeta, String> {
  let dir = world_dir(&app, &slot)?;
  if dir.join("world.json").exists() {
    return Err(format!("a world named {slot:?} already exists"));
  }
  let now = now_iso();
  let meta = WorldMeta {
    slot,
    name,
    preset,
    created_at: now.clone(),
    last_played_at: now,
    turn: None,
    character: None,
  };
  write_meta(&dir, &meta)?;
  Ok(meta)
}

#[tauri::command]
fn touch_world(
  app: AppHandle,
  slot: String,
  turn: Option<u64>,
  character: Option<String>,
) -> Result<WorldMeta, String> {
  let dir = world_dir(&app, &slot)?;
  let mut meta = read_meta(&dir).ok_or_else(|| format!("no world at {slot:?}"))?;
  meta.last_played_at = now_iso();
  if turn.is_some() {
    meta.turn = turn;
  }
  if character.is_some() {
    meta.character = character;
  }
  write_meta(&dir, &meta)?;
  Ok(meta)
}

#[tauri::command]
fn delete_world(app: AppHandle, game: State<'_, Game>, slot: String) -> Result<(), String> {
  if game.0.lock().map_err(|_| "game state poisoned")?.slot.as_deref() == Some(slot.as_str()) {
    return Err("stop the game before deleting the world it is playing".into());
  }
  let dir = world_dir(&app, &slot)?;
  if !dir.join("world.json").exists() {
    return Err(format!("no world at {slot:?}"));
  }
  fs::remove_dir_all(&dir).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// The game process
// ---------------------------------------------------------------------------

#[derive(Default)]
struct GameInner {
  child: Option<CommandChild>,
  port: Option<u16>,
  slot: Option<String>,
}

struct Game(Mutex<GameInner>);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GameInfo {
  running: bool,
  port: Option<u16>,
  slot: Option<String>,
  url: Option<String>,
}

impl GameInner {
  fn info(&self) -> GameInfo {
    GameInfo {
      running: self.child.is_some(),
      port: self.port,
      slot: self.slot.clone(),
      url: self.port.map(|p| format!("http://127.0.0.1:{p}")),
    }
  }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GameLogEvent {
  line: String,
}

fn free_port() -> Result<u16, String> {
  TcpListener::bind(("127.0.0.1", 0))
    .and_then(|l| l.local_addr())
    .map(|a| a.port())
    .map_err(|e| format!("no free loopback port: {e}"))
}

fn launcher_script(app: &AppHandle) -> Result<PathBuf, String> {
  let path = app.path().resource_dir().map_err(|e| e.to_string())?.join("game").join("launch.mjs");
  if !path.exists() {
    return Err(format!(
      "game resources are missing ({}). This build was packaged without the game.",
      path.display()
    ));
  }
  Ok(path)
}

fn stop_locked(inner: &mut GameInner) {
  if let Some(child) = inner.child.take() {
    // SIGTERM on Unix, TerminateProcess on Windows. The launcher polls our
    // pid as well, so MongoDB goes down either way.
    let _ = child.kill();
  }
  inner.port = None;
  inner.slot = None;
}

#[tauri::command]
fn game_status(game: State<'_, Game>) -> Result<GameInfo, String> {
  Ok(game.0.lock().map_err(|_| "game state poisoned")?.info())
}

#[tauri::command]
async fn game_stop(app: AppHandle, game: State<'_, Game>) -> Result<GameInfo, String> {
  if let Some(window) = app.get_webview_window("game") {
    let _ = window.close();
  }
  let mut inner = game.0.lock().map_err(|_| "game state poisoned")?;
  stop_locked(&mut inner);
  Ok(inner.info())
}

/// Start the local game for a world slot. Resolves once the server says it is
/// ready, or fails with the tail of its output. Log lines stream to the
/// launcher as `game:log` events the whole time, so a first-run MongoDB
/// download is visible rather than a frozen button.
#[tauri::command]
async fn game_start(app: AppHandle, game: State<'_, Game>, slot: String) -> Result<GameInfo, String> {
  let home = world_dir(&app, &slot)?;
  if !home.join("world.json").exists() {
    return Err(format!("no world at {slot:?}"));
  }
  {
    let mut inner = game.0.lock().map_err(|_| "game state poisoned")?;
    if inner.child.is_some() {
      if inner.slot.as_deref() == Some(slot.as_str()) {
        return Ok(inner.info());
      }
      stop_locked(&mut inner);
    }
  }

  let script = launcher_script(&app)?;
  let port = free_port()?;
  let mut command = app
    .shell()
    // Named ahd-node, not node: Linux packages install sidecars into
    // /usr/bin, and a plain "node" would collide with the system one.
    .sidecar("ahd-node")
    .map_err(|e| format!("bundled Node is missing: {e}"))?
    .args([
      script.to_string_lossy().as_ref(),
      "--port",
      &port.to_string(),
      "--home",
      home.to_string_lossy().as_ref(),
      "--no-browser",
      "--parent-pid",
      &std::process::id().to_string(),
    ])
    .env("NODE_ENV", "production");
  if let Ok(mongod) = std::env::var("MONGOD_PATH") {
    command = command.env("MONGOD_PATH", mongod);
  }

  let (mut rx, child) = command.spawn().map_err(|e| format!("could not start the game: {e}"))?;
  {
    let mut inner = game.0.lock().map_err(|_| "game state poisoned")?;
    inner.child = Some(child);
    inner.port = Some(port);
    inner.slot = Some(slot.clone());
  }

  let ready_marker = format!("ready at http://127.0.0.1:{port}");
  let mut tail: Vec<String> = Vec::new();
  let started = tokio::time::Instant::now();

  loop {
    let remaining = START_TIMEOUT.checked_sub(started.elapsed()).unwrap_or(Duration::ZERO);
    let event = match tokio::time::timeout(remaining, rx.recv()).await {
      Ok(Some(event)) => event,
      Ok(None) => {
        fail_start(&app, &game, &tail);
        return Err(format!("the game exited before it was ready:\n{}", tail.join("\n")));
      }
      Err(_) => {
        fail_start(&app, &game, &tail);
        return Err(format!(
          "the game did not become ready within {} seconds:\n{}",
          START_TIMEOUT.as_secs(),
          tail.join("\n")
        ));
      }
    };
    match event {
      CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
        let line = String::from_utf8_lossy(&bytes).trim_end().to_string();
        if line.is_empty() {
          continue;
        }
        let _ = app.emit("game:log", GameLogEvent { line: line.clone() });
        tail.push(line.clone());
        if tail.len() > LOG_TAIL {
          tail.remove(0);
        }
        if line.contains(&ready_marker) {
          break;
        }
      }
      CommandEvent::Terminated(status) => {
        fail_start(&app, &game, &tail);
        return Err(format!(
          "the game exited with code {:?} before it was ready:\n{}",
          status.code,
          tail.join("\n")
        ));
      }
      CommandEvent::Error(message) => {
        tail.push(message);
      }
      _ => {}
    }
  }

  // Keep draining after readiness so the pipe never fills, and notice exits.
  let drain_app = app.clone();
  tauri::async_runtime::spawn(async move {
    while let Some(event) = rx.recv().await {
      match event {
        CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
          let line = String::from_utf8_lossy(&bytes).trim_end().to_string();
          if !line.is_empty() {
            let _ = drain_app.emit("game:log", GameLogEvent { line });
          }
        }
        CommandEvent::Terminated(status) => {
          if let Some(game) = drain_app.try_state::<Game>() {
            if let Ok(mut inner) = game.0.lock() {
              inner.child = None;
              inner.port = None;
              inner.slot = None;
            }
          }
          let _ = drain_app.emit(
            "game:exited",
            GameLogEvent { line: format!("game exited with code {:?}", status.code) },
          );
          if let Some(window) = drain_app.get_webview_window("game") {
            let _ = window.close();
          }
          break;
        }
        _ => {}
      }
    }
  });

  let _ = touch_world(app.clone(), slot, None, None);
  Ok(game.0.lock().map_err(|_| "game state poisoned")?.info())
}

fn fail_start(app: &AppHandle, game: &State<'_, Game>, tail: &[String]) {
  if let Ok(mut inner) = game.0.lock() {
    stop_locked(&mut inner);
  }
  let _ = app.emit("game:exited", GameLogEvent { line: tail.last().cloned().unwrap_or_default() });
}

/// Proxy an HTTP request to the running game for the launcher (new game,
/// status). The launcher webview has no network access of its own by CSP;
/// routing through here keeps that true and keeps the game's loopback-only
/// gate honest, since the Host header is exactly what a browser would send.
#[tauri::command]
async fn game_request(
  game: State<'_, Game>,
  method: String,
  path: String,
  body: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
  let port = game
    .0
    .lock()
    .map_err(|_| "game state poisoned")?
    .port
    .ok_or("the game is not running")?;
  if !path.starts_with('/') || path.contains("..") {
    return Err(format!("refusing request path {path:?}"));
  }
  let url = format!("http://127.0.0.1:{port}{path}");
  let method = method.to_ascii_uppercase();
  tauri::async_runtime::spawn_blocking(move || {
    let agent = ureq::AgentBuilder::new().timeout(REQUEST_TIMEOUT).build();
    let request = agent.request(&method, &url).set("Accept", "application/json");
    let response = match body {
      Some(json) => request.send_json(json),
      None => request.call(),
    };
    match response {
      Ok(res) => res.into_json::<serde_json::Value>().map_err(|e| format!("bad response from the game: {e}")),
      Err(ureq::Error::Status(code, res)) => {
        let detail = res
          .into_json::<serde_json::Value>()
          .ok()
          .and_then(|v| v.get("error").and_then(|e| e.as_str()).map(str::to_string))
          .unwrap_or_else(|| format!("HTTP {code}"));
        Err(detail)
      }
      Err(e) => Err(format!("could not reach the game: {e}")),
    }
  })
  .await
  .map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

#[tauri::command]
async fn open_game_window(app: AppHandle, game: State<'_, Game>, path: Option<String>) -> Result<(), String> {
  let port = game
    .0
    .lock()
    .map_err(|_| "game state poisoned")?
    .port
    .ok_or("the game is not running")?;
  let path = path.unwrap_or_else(|| "/".to_string());
  if !path.starts_with('/') {
    return Err(format!("refusing game path {path:?}"));
  }
  let url: Url = format!("http://127.0.0.1:{port}{path}")
    .parse()
    .map_err(|e| format!("bad game URL: {e}"))?;

  if let Some(existing) = app.get_webview_window("game") {
    existing.navigate(url).map_err(|e| e.to_string())?;
    existing.set_focus().map_err(|e| e.to_string())?;
    return Ok(());
  }

  let nav_app = app.clone();
  let new_window_app = app.clone();
  let close_app = app.clone();
  let window = WebviewWindowBuilder::new(&app, "game", WebviewUrl::External(url))
    .title("A House Divided")
    .inner_size(1440.0, 900.0)
    .center()
    .resizable(true)
    .on_navigation(move |url| {
      if is_local_game_url(url, port) {
        true
      } else {
        let _ = nav_app.opener().open_url(url.to_string(), None::<&str>);
        false
      }
    })
    .on_new_window(move |url, _features| {
      let _ = new_window_app.opener().open_url(url.to_string(), None::<&str>);
      tauri::webview::NewWindowResponse::Deny
    })
    .build()
    .map_err(|e| e.to_string())?;
  window.on_window_event(move |event| {
    if matches!(event, WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed) {
      let _ = close_app.emit("game:window-closed", ());
      if let Some(main) = close_app.get_webview_window("main") {
        let _ = main.set_focus();
        let _ = main.show();
      }
    }
  });
  Ok(())
}

/// `target` is "live" or "sandbox". Both use the same zero-capability window;
/// the sandbox is a separate deployment with its own accounts and world.
#[tauri::command]
async fn open_online_window(app: AppHandle, target: Option<String>) -> Result<(), String> {
  let base = match target.as_deref() {
    None | Some("live") => ONLINE_URL,
    Some("sandbox") => SANDBOX_URL,
    Some(other) => return Err(format!("unknown online target {other:?}")),
  };
  let url: Url = base.parse().map_err(|e| format!("bad online URL: {e}"))?;
  open_online_url(app, url).await
}

async fn open_online_url(app: AppHandle, url: Url) -> Result<(), String> {
  if let Some(existing) = app.get_webview_window("online") {
    existing.navigate(url).map_err(|e| e.to_string())?;
    existing.set_focus().map_err(|e| e.to_string())?;
    return Ok(());
  }
  let nav_app = app.clone();
  let new_window_app = app.clone();
  let close_app = app.clone();
  let title = if url.host_str() == Some(SANDBOX_HOST) {
    "A House Divided: Sandbox"
  } else {
    "A House Divided: Online"
  };
  let window = WebviewWindowBuilder::new(&app, "online", WebviewUrl::External(url))
    .title(title)
    .inner_size(1280.0, 800.0)
    .center()
    .resizable(true)
    .on_navigation(move |url| {
      if is_online_navigation_allowed(url) {
        true
      } else {
        let _ = nav_app.opener().open_url(url.to_string(), None::<&str>);
        false
      }
    })
    .on_new_window(move |url, _features| {
      let _ = new_window_app.opener().open_url(url.to_string(), None::<&str>);
      tauri::webview::NewWindowResponse::Deny
    })
    .build()
    .map_err(|e| e.to_string())?;
  window.on_window_event(move |event| {
    if matches!(event, WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed) {
      if let Some(main) = close_app.get_webview_window("main") {
        let _ = main.set_focus();
      }
    }
  });
  Ok(())
}

#[tauri::command]
async fn open_help_destination(app: AppHandle, route_id: String) -> Result<(), String> {
  match help_destination(&route_id) {
    Some(HelpDestination::Online(path)) => {
      let url: Url = format!("{ONLINE_URL}{path}").parse().map_err(|e| format!("bad Help URL: {e}"))?;
      open_online_url(app, url).await
    }
    Some(HelpDestination::External(url)) => app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string()),
    None => Err(format!("unknown Help destination: {route_id}")),
  }
}

// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_window_state::Builder::default().build())
    .manage(Game(Mutex::new(GameInner::default())))
    .invoke_handler(tauri::generate_handler![
      open_online_window,
      open_help_destination,
      open_game_window,
      game_start,
      game_stop,
      game_status,
      game_request,
      list_worlds,
      create_world,
      touch_world,
      delete_world,
    ])
    .build(tauri::generate_context!())
    .expect("error while building AHDClient")
    .run(|app, event| {
      if let RunEvent::ExitRequested { .. } | RunEvent::Exit = event {
        if let Some(game) = app.try_state::<Game>() {
          if let Ok(mut inner) = game.0.lock() {
            stop_locked(&mut inner);
          }
        }
      }
    });
}

#[cfg(test)]
mod tests {
  use super::{
    help_destination, is_local_game_url, is_online_navigation_allowed, is_online_origin, valid_slot, HelpDestination,
  };
  use tauri::Url;

  #[test]
  fn help_routes_resolve_only_to_allowlisted_targets() {
    assert_eq!(
      help_destination("help.wiki"),
      Some(HelpDestination::External("https://wiki.ahousedividedgame.com")),
    );
    assert_eq!(help_destination("help.about"), Some(HelpDestination::Online("/about")));
    assert_eq!(
      help_destination("help.discord"),
      Some(HelpDestination::External("https://discord.gg/DmF8zJJuqN")),
    );
    assert_eq!(help_destination("help.not-real"), None);
  }

  #[test]
  fn online_navigation_stays_in_app_only_for_the_exact_https_origin() {
    let allowed: Url = "https://ahousedividedgame.com/play".parse().unwrap();
    let http: Url = "http://ahousedividedgame.com/play".parse().unwrap();
    let custom_port: Url = "https://ahousedividedgame.com:444/play".parse().unwrap();
    let redirector: Url = "https://www.ahousedividedgame.com/play".parse().unwrap();
    let subdomain: Url = "https://accounts.ahousedividedgame.com/".parse().unwrap();
    let unrelated: Url = "https://example.com/".parse().unwrap();
    let sandbox: Url = "https://sandbox.ahousedividedgame.com/play".parse().unwrap();

    assert!(is_online_origin(&allowed));
    assert!(is_online_origin(&sandbox));
    assert!(!is_online_origin(&http));
    assert!(!is_online_origin(&custom_port));
    assert!(!is_online_origin(&redirector));
    assert!(!is_online_origin(&subdomain));
    assert!(!is_online_origin(&unrelated));
  }

  #[test]
  fn online_navigation_keeps_only_required_auth_hosts_in_the_webview() {
    let callback_redirector: Url = "https://www.ahousedividedgame.com/api/auth/callback/discord".parse().unwrap();
    let discord: Url = "https://discord.com/oauth2/authorize".parse().unwrap();
    let google_accounts: Url = "https://accounts.google.com/o/oauth2/v2/auth".parse().unwrap();
    let google_callback: Url = "https://www.google.com/".parse().unwrap();
    let insecure_auth: Url = "http://discord.com/oauth2/authorize".parse().unwrap();
    let fake_auth: Url = "https://login.discord.com/".parse().unwrap();
    let custom_port: Url = "https://accounts.google.com:444/".parse().unwrap();

    assert!(is_online_navigation_allowed(&callback_redirector));
    assert!(is_online_navigation_allowed(&discord));
    assert!(is_online_navigation_allowed(&google_accounts));
    assert!(is_online_navigation_allowed(&google_callback));
    assert!(!is_online_navigation_allowed(&insecure_auth));
    assert!(!is_online_navigation_allowed(&fake_auth));
    assert!(!is_online_navigation_allowed(&custom_port));
  }

  #[test]
  fn game_window_navigation_is_pinned_to_its_own_loopback_port() {
    let same: Url = "http://127.0.0.1:3111/country/us".parse().unwrap();
    let localhost: Url = "http://localhost:3111/".parse().unwrap();
    let other_port: Url = "http://127.0.0.1:3112/".parse().unwrap();
    let https: Url = "https://127.0.0.1:3111/".parse().unwrap();
    let remote: Url = "http://ahousedividedgame.com:3111/".parse().unwrap();
    let wiki: Url = "https://wiki.ahousedividedgame.com/".parse().unwrap();

    assert!(is_local_game_url(&same, 3111));
    assert!(is_local_game_url(&localhost, 3111));
    assert!(!is_local_game_url(&other_port, 3111));
    assert!(!is_local_game_url(&https, 3111));
    assert!(!is_local_game_url(&remote, 3111));
    assert!(!is_local_game_url(&wiki, 3111));
  }

  #[test]
  fn world_slots_are_plain_directory_names() {
    assert!(valid_slot("world-1"));
    assert!(valid_slot("cold_war_1953"));
    assert!(!valid_slot(""));
    assert!(!valid_slot("../etc"));
    assert!(!valid_slot("a/b"));
    assert!(!valid_slot("space here"));
  }
}
