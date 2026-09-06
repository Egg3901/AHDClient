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

mod node_path;
mod game_versions;

use std::fs;
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, RunEvent, State, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent, WebviewBuilder, LogicalPosition, LogicalSize};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

const ONLINE_URL: &str = "https://ahousedividedgame.com";
const SANDBOX_URL: &str = "https://sandbox.ahousedividedgame.com";
const ONLINE_HOST: &str = "ahousedividedgame.com";
const SANDBOX_HOST: &str = "sandbox.ahousedividedgame.com";
const AUXILIARY_ONLINE_HOSTS: &[&str] = &[
  "www.ahousedividedgame.com",
  "auth.ahousedividedgame.com",
  "discord.com",
  "accounts.google.com",
  "www.google.com",
];
const SETTINGS_SHORTCUT_SCRIPT: &str = r#"
document.addEventListener('keydown', function (event) {
  if (event.key === 'Escape' && !event.repeat) {
    event.preventDefault();
    window.location.href = 'ahdclient://settings';
  }
}, true);
"#;

fn handle_settings_shortcut(app: &AppHandle, url: &Url) -> bool {
  if url.scheme() != "ahdclient" || url.host_str() != Some("settings") { return false; }
  let _ = app.emit("client:settings", ());
  if let Some(main) = app.get_webview_window("main") {
    let _ = main.show();
    let _ = main.set_focus();
  }
  true
}

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
    "help.era-photo-1953" => Some(HelpDestination::External("https://commons.wikimedia.org/wiki/File:Eisenhower_inauguration.gif")),
    "help.era-photo-1979" => Some(HelpDestination::External("https://commons.wikimedia.org/wiki/File:Portrait_of_Jimmy_Carter_by_Ansel_Adams_(1979)_(cropped).jpg")),
    "help.era-photo-1991" => Some(HelpDestination::External("https://commons.wikimedia.org/wiki/File:President_George_H._W._Bush_poses_for_a_photograph_with_four_of_his_predecessors.jpg")),
    "help.era-photo-1999" => Some(HelpDestination::External("https://commons.wikimedia.org/wiki/File:Bill_Clinton_1999.jpg")),
    "help.era-photo-2007" => Some(HelpDestination::External("https://commons.wikimedia.org/wiki/File:George_Bush_visit_Kansas_City_Assembly.jpg")),
    "help.era-photo-2019" => Some(HelpDestination::External("https://commons.wikimedia.org/wiki/File:President_Trump_Meets_with_the_Prime_Minister_of_Pakistan_(48350243921).jpg")),
    "help.era-photo-2023" => Some(HelpDestination::External("https://commons.wikimedia.org/wiki/File:P20230106AS-0338_(52644827761).jpg")),
    "help.wiki" => Some(HelpDestination::External("https://wiki.ahousedividedgame.com")),
    "help.about" => Some(HelpDestination::Online("/about")),
    "help.profile" => Some(HelpDestination::Online("/profile")),
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
  #[serde(default)]
  setup: Option<serde_json::Value>,
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
fn create_world(app: AppHandle, slot: String, name: String, preset: String, setup: Option<serde_json::Value>) -> Result<WorldMeta, String> {
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
    setup,
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
  generation: u64,
  child: Option<CommandChild>,
  port: Option<u16>,
  slot: Option<String>,
}

struct Game(Mutex<GameInner>, tokio::sync::Mutex<()>);

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
  let path = game_versions::game_dir(app)?.join("launch.mjs");
  if !path.exists() {
    return Err(format!(
      "game resources are missing ({}). This build was packaged without the game.",
      path.display()
    ));
  }
  Ok(path)
}

fn stop_locked(inner: &mut GameInner) {
  inner.generation = inner.generation.wrapping_add(1);
  if let Some(mut child) = inner.child.take() {
    // Ask the Node supervisor to stop its server and MongoDB first. A direct
    // kill terminates only the supervisor and can strand the world processes.
    if child.write(b"shutdown\n").is_ok() {
      std::thread::sleep(Duration::from_millis(1800));
    }
    // The supervisor exits after its bounded shutdown window. This is only
    // a fallback for a supervisor that stopped responding to its control pipe.
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
  if let Some(view) = app.get_webview("game-embedded") { let _ = view.close(); }
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
  let _start_guard = game.1.try_lock().map_err(|_| "a world is already starting")?;
  let home = world_dir(&app, &slot)?;
  if !home.join("world.json").exists() {
    return Err(format!("no world at {slot:?}"));
  }
  let generation = {
    let mut inner = game.0.lock().map_err(|_| "game state poisoned")?;
    if inner.child.is_some() {
      if inner.slot.as_deref() == Some(slot.as_str()) {
        return Ok(inner.info());
      }
      stop_locked(&mut inner);
    }
    inner.generation = inner.generation.wrapping_add(1);
    inner.generation
  };

  let script = node_path::path_for_node(&launcher_script(&app)?);
  let launch_dir = script.parent().ok_or("game resource directory is missing")?;
  let port = free_port()?;
  let mut mongo_port = free_port()?;
  while mongo_port == port { mongo_port = free_port()?; }
  let mut command = app
    .shell()
    // Named ahd-node, not node: Linux packages install sidecars into
    // /usr/bin, and a plain "node" would collide with the system one.
    .sidecar("ahd-node")
    .map_err(|e| format!("bundled Node is missing: {e}"))?
    .current_dir(launch_dir)
    .args([
      script.to_string_lossy().as_ref(),
      "--port",
      &port.to_string(),
      "--mongo-port",
      &mongo_port.to_string(),
      "--home",
      node_path::path_for_node(&home).to_string_lossy().as_ref(),
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
    if inner.generation != generation {
      let _ = child.kill();
      return Err("world start cancelled".into());
    }
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
        fail_start(&app, &game, &tail, generation);
        return Err(format!("the game exited before it was ready:\n{}", tail.join("\n")));
      }
      Err(_) => {
        fail_start(&app, &game, &tail, generation);
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
        fail_start(&app, &game, &tail, generation);
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
              if inner.generation != generation { break; }
              inner.child = None;
              inner.port = None;
              inner.slot = None;
            }
          }
          let _ = drain_app.emit(
            "game:exited",
            GameLogEvent { line: format!("game exited with code {:?}", status.code) },
          );
          if let Some(view) = drain_app.get_webview("game-embedded") { let _ = view.close(); }
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

fn fail_start(app: &AppHandle, game: &State<'_, Game>, tail: &[String], generation: u64) {
  if let Ok(mut inner) = game.0.lock() {
    if inner.generation != generation { return; }
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
  if !path.starts_with("/api/singleplayer/") || path.contains("..") || path.contains(['\r', '\n', '\\']) {
    return Err(format!("refusing request path {path:?}"));
  }
  let url = format!("http://127.0.0.1:{port}{path}");
  let method = method.to_ascii_uppercase();
  tauri::async_runtime::spawn_blocking(move || {
    let agent = ureq::AgentBuilder::new().timeout(REQUEST_TIMEOUT).redirects(0).build();
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

struct StatisticsConsent(AtomicBool);

#[tauri::command]
fn set_statistics_consent(consent: State<'_, StatisticsConsent>, enabled: bool) {
  consent.0.store(enabled, Ordering::SeqCst);
}

#[tauri::command]
async fn submit_statistics(app: AppHandle, consent: State<'_, StatisticsConsent>, report: serde_json::Value) -> Result<(), String> {
  if !consent.0.load(Ordering::SeqCst) { return Err("statistics sharing is disabled".into()); }
  let body = serde_json::to_string(&report).map_err(|_| "invalid report")?;
  if body.len() > 8192 { return Err("report is too large".into()); }
  tauri::async_runtime::spawn_blocking(move || {
    if !app.state::<StatisticsConsent>().0.load(Ordering::SeqCst) { return Err("statistics sharing is disabled".into()); }
    // A separate HTTP client with no WebView cookies, credentials, redirect
    // following, device identifiers, or request/response-body logging.
    let agent = ureq::AgentBuilder::new().timeout(Duration::from_secs(10)).redirects(0).build();
    let response = agent.post("https://ahousedividedgame.com/api/client/statistics")
      .set("Content-Type", "application/json")
      .set("User-Agent", "AHDClient/2")
      .send_string(&body).map_err(|_| "statistics delivery unavailable")?;
    if response.status() == 202 { Ok(()) } else { Err("statistics delivery unavailable".into()) }
  }).await.map_err(|_| "statistics delivery failed")?
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LinkedAccount {
  linked: bool,
  display_name: String,
  supporter: bool,
  #[serde(default)]
  singleplayer: SingleplayerEntitlement,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct SingleplayerEntitlement {
  entitled: bool,
  expires_at: Option<String>,
}

fn is_account_session_cookie(name: &str) -> bool {
  matches!(name, "auth-token" | "authjs.session-token" | "__Secure-authjs.session-token" | "next-auth.session-token" | "__Secure-next-auth.session-token")
    || name.strip_prefix("auth-token-").is_some_and(|suffix| !suffix.is_empty() && suffix.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'))
    || ["authjs.session-token.", "__Secure-authjs.session-token.", "next-auth.session-token.", "__Secure-next-auth.session-token."].iter().any(|prefix| name.strip_prefix(prefix).is_some_and(|suffix| !suffix.is_empty() && suffix.chars().all(|c| c.is_ascii_digit())))
}

#[tauri::command]
async fn linked_account(app: AppHandle) -> Result<Option<LinkedAccount>, String> {
  // Read the platform WebView cookie store. Credentials never cross IPC or
  // enter launcher storage, telemetry, URLs or log messages.
  // A new link is completed inside the online child WebView. Reading only the
  // launcher cookie jar made a successful sign-in invisible until restart.
  let view = app
    .get_webview("online-embedded")
    .or_else(|| app.get_webview("online"))
    .or_else(|| app.get_webview("main"))
    .ok_or("launcher is missing")?;
  let url: Url = format!("{ONLINE_URL}/api/client/account").parse().map_err(|_| "invalid account URL")?;
  let cookies = view.cookies_for_url(url).map_err(|_| "cannot access the app session")?;
  let header = cookies.iter()
    .filter(|cookie| is_account_session_cookie(cookie.name()))
    .map(|cookie| format!("{}={}", cookie.name(), cookie.value()))
    .collect::<Vec<_>>().join("; ");
  if header.is_empty() { return Ok(None); }
  tauri::async_runtime::spawn_blocking(move || {
    let agent = ureq::AgentBuilder::new().timeout(Duration::from_secs(15)).redirects(0).build();
    match agent.get(&format!("{ONLINE_URL}/api/client/account")).set("Cookie", &header).call() {
      Ok(response) => response.into_json::<LinkedAccount>().map(Some).map_err(|_| "invalid account response".into()),
      Err(ureq::Error::Status(401, _)) => Ok(None),
      Err(_) => Err("Cannot check the linked account. Connect to the internet and try again.".into()),
    }
  }).await.map_err(|_| "account check failed")?
}

#[tauri::command]
async fn link_account(app: AppHandle, separate_window: Option<bool>) -> Result<(), String> {
  let url: Url = format!("{ONLINE_URL}/client/link").parse().map_err(|_| "invalid account URL")?;
  if separate_window.unwrap_or(false) { open_online_url(app, url).await }
  else { open_embedded(&app, url, None) }
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

const EMBEDDED_TOP: f64 = 64.0;

fn close_embedded(app: &AppHandle) {
  for label in ["game-embedded", "online-embedded"] {
    if let Some(view) = app.get_webview(label) { let _ = view.close(); }
  }
}

#[tauri::command]
fn close_embedded_game(app: AppHandle) {
  close_embedded(&app);
}

fn open_embedded(app: &AppHandle, url: Url, local_port: Option<u16>) -> Result<(), String> {
  close_embedded(app);
  let window = app.get_window("main").ok_or("launcher window is missing")?;
  let size = window.inner_size().map_err(|e| e.to_string())?
    .to_logical::<f64>(window.scale_factor().map_err(|e| e.to_string())?);
  let nav_app = app.clone();
  let popup_app = app.clone();
  let label = if local_port.is_some() { "game-embedded" } else { "online-embedded" };
  let builder = WebviewBuilder::new(label, WebviewUrl::External(url))
    .initialization_script(SETTINGS_SHORTCUT_SCRIPT)
    .on_navigation(move |url| {
      if handle_settings_shortcut(&nav_app, url) { return false; }
      let allowed = match local_port {
        Some(port) => is_local_game_url(url, port),
        None => is_online_navigation_allowed(url),
      };
      if !allowed && matches!(url.scheme(), "https" | "http" | "mailto") {
        let _ = nav_app.opener().open_url(url.to_string(), None::<&str>);
      }
      allowed
    })
    .on_new_window(move |url, _| {
      if matches!(url.scheme(), "https" | "http" | "mailto") {
        let _ = popup_app.opener().open_url(url.to_string(), None::<&str>);
      }
      tauri::webview::NewWindowResponse::Deny
    });
  window.add_child(builder, LogicalPosition::new(0.0, EMBEDDED_TOP),
    LogicalSize::new(size.width, (size.height - EMBEDDED_TOP).max(1.0)))
    .map_err(|e| e.to_string())?;
  Ok(())
}



#[tauri::command]
async fn open_game_window(app: AppHandle, game: State<'_, Game>, path: Option<String>, separate_window: Option<bool>) -> Result<(), String> {
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

  if !separate_window.unwrap_or(false) {
    if let Some(existing) = app.get_webview_window("game") { let _ = existing.close(); }
    return open_embedded(&app, url, Some(port));
  }
  close_embedded(&app);
  if let Some(existing) = app.get_webview_window("game") {
    existing.navigate(url).map_err(|e| e.to_string())?;
    existing.set_focus().map_err(|e| e.to_string())?;
    return Ok(());
  }

  let nav_app = app.clone();
  let new_window_app = app.clone();
  let close_app = app.clone();
  let window = WebviewWindowBuilder::new(&app, "game", WebviewUrl::External(url))
    .initialization_script(SETTINGS_SHORTCUT_SCRIPT)
    .title("A House Divided")
    .inner_size(1440.0, 900.0)
    .center()
    .resizable(true)
    .on_navigation(move |url| {
      if handle_settings_shortcut(&nav_app, url) { return false; }
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
async fn open_online_window(app: AppHandle, target: Option<String>, separate_window: Option<bool>) -> Result<(), String> {
  let base = match target.as_deref() {
    None | Some("live") => ONLINE_URL,
    Some("sandbox") => {
      let account = linked_account(app.clone()).await?;
      if !account.is_some_and(|account| account.linked && account.supporter) {
        app.opener().open_url("https://www.patreon.com/cw/AHouseDividedGame/membership", None::<&str>).map_err(|e| e.to_string())?;
        return Err("Sandbox requires supporter access. Link your supporter game account in Settings.".into());
      }
      SANDBOX_URL
    },
    Some(other) => return Err(format!("unknown online target {other:?}")),
  };
  let url: Url = base.parse().map_err(|e| format!("bad online URL: {e}"))?;
  if !separate_window.unwrap_or(false) {
    if let Some(existing) = app.get_webview_window("online") { let _ = existing.close(); }
    return open_embedded(&app, url, None);
  }
  close_embedded(&app);
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
    .initialization_script(SETTINGS_SHORTCUT_SCRIPT)
    .title(title)
    .inner_size(1280.0, 800.0)
    .center()
    .resizable(true)
    .on_navigation(move |url| {
      if handle_settings_shortcut(&nav_app, url) { return false; }
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

#[tauri::command]
async fn list_game_versions(app: AppHandle) -> Result<Vec<game_versions::GameVersion>, String> {
  tauri::async_runtime::spawn_blocking(move || game_versions::list(&app)).await.map_err(|_| "Game version check failed.".to_string())?
}

#[tauri::command]
async fn install_game_version(app: AppHandle, game: State<'_, Game>, version: String) -> Result<(), String> {
  if game.0.lock().map_err(|_| "game state poisoned")?.child.is_some() { return Err("Stop the local game before changing versions.".into()); }
  tauri::async_runtime::spawn_blocking(move || game_versions::install(&app, &version)).await.map_err(|_| "Game installation failed.".to_string())?
}

#[tauri::command]
fn select_game_version(app: AppHandle, game: State<'_, Game>, version: Option<String>) -> Result<(), String> {
  if game.0.lock().map_err(|_| "game state poisoned")?.child.is_some() { return Err("Stop the local game before changing versions.".into()); }
  game_versions::select(&app, version.as_deref())
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
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .manage(Game(Mutex::new(GameInner::default()), tokio::sync::Mutex::new(())))
    .manage(StatisticsConsent(AtomicBool::new(false)))
    .invoke_handler(tauri::generate_handler![
      set_statistics_consent,
      submit_statistics,
      linked_account,
      link_account,
      close_embedded_game,
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
      list_game_versions,
      install_game_version,
      select_game_version,
    ])
    .on_window_event(|window, event| {
      if window.label() == "main" && matches!(event, WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. }) {
        if let (Ok(size), Ok(scale)) = (window.inner_size(), window.scale_factor()) {
          let logical = size.to_logical::<f64>(scale);
          for label in ["game-embedded", "online-embedded"] {
            if let Some(view) = window.app_handle().get_webview(label) {
              let _ = view.set_position(LogicalPosition::new(0.0, EMBEDDED_TOP));
              let _ = view.set_size(LogicalSize::new(logical.width, (logical.height - EMBEDDED_TOP).max(1.0)));
            }
          }
        }
      }
    })
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
    help_destination, is_account_session_cookie, is_local_game_url, is_online_navigation_allowed, is_online_origin, valid_slot, HelpDestination,
  };
  use tauri::Url;

  #[test]
  fn help_routes_resolve_only_to_allowlisted_targets() {
    assert_eq!(
      help_destination("help.wiki"),
      Some(HelpDestination::External("https://wiki.ahousedividedgame.com")),
    );
    assert_eq!(help_destination("help.about"), Some(HelpDestination::Online("/about")));
    assert_eq!(help_destination("help.profile"), Some(HelpDestination::Online("/profile")));
    assert_eq!(
      help_destination("help.discord"),
      Some(HelpDestination::External("https://discord.gg/DmF8zJJuqN")),
    );
    assert_eq!(help_destination("help.not-real"), None);
  }

  #[test]
  fn account_cookie_filter_accepts_environment_scoped_game_sessions() {
    assert!(is_account_session_cookie("auth-token-production"));
    assert!(is_account_session_cookie("auth-token-sandbox-staging"));
    assert!(!is_account_session_cookie("auth-token-"));
    assert!(!is_account_session_cookie("auth-token-production.copy"));
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
