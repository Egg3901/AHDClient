//! AHDClient core.
//!
//! The client is a shell around the real game. On desktop, singleplayer runs
//! the A House Divided server (a Next.js standalone build shipped as a
//! resource) under a bundled Node, against a MongoDB the launcher script
//! finds or fetches, all on loopback; that half lives in `desktop.rs`. On
//! Android and iOS there is no local game: the app is the launcher plus the
//! live multiplayer site in the same webview; see `mobile.rs`.
//!
//! This file holds what both halves share: the online origin policy, Help
//! routing, account linking (read from the platform cookie jar, never
//! crossing IPC) and diagnostics delivery.
//!
//! Security shape, unchanged in spirit from 1.x: the launcher webview talks
//! only to these commands; remote content gets no Tauri IPC at all and is a
//! plain webview pointed at an origin we chose.

#[cfg(desktop)]
mod desktop;
#[cfg(desktop)]
mod game_versions;
#[cfg(mobile)]
mod mobile;
#[cfg(desktop)]
mod node_path;
mod briefing;

use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Url};

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
    "help.account" => Some(HelpDestination::Online("/settings")),
    "help.report-issue" => Some(HelpDestination::External(concat!("https://github.com/Egg3901/AHDClient/issues/new?labels=bug&title=%5B", env!("CARGO_PKG_VERSION"), "%5D%20&body=What%20happened%3F%0A%0ASteps%20to%20reproduce%3A%0A1.%20"))),
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


#[tauri::command]
async fn submit_diagnostics(report: serde_json::Value) -> Result<(), String> {
  let body = serde_json::to_string(&report).map_err(|_| "invalid diagnostic report")?;
  if body.len() > 40_000 { return Err("diagnostic report is too large".into()); }
  tauri::async_runtime::spawn_blocking(move || {
    let agent = ureq::AgentBuilder::new().timeout(Duration::from_secs(10)).redirects(0).build();
    let response = agent.post("https://ahousedividedgame.com/api/client/diagnostics")
      .set("Content-Type", "application/json")
      .set("User-Agent", "AHDClient/2")
      .send_string(&body).map_err(|_| "diagnostic delivery unavailable")?;
    if response.status() == 202 { Ok(()) } else { Err("diagnostic delivery unavailable".into()) }
  }).await.map_err(|_| "diagnostic delivery failed")?
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LinkedAccount {
  linked: bool,
  display_name: String,
  supporter: bool,
  /// Player picture from the game account API (`avatarUrl`, shipped by the game).
  #[serde(default)]
  avatar_url: Option<String>,
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


// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default().plugin(tauri_plugin_opener::init())
    .manage(briefing::BriefingState::default());
  #[cfg(mobile)]
  let builder = builder.plugin(tauri_plugin_briefing_widgets::init());
  #[cfg(desktop)]
  let builder = desktop::configure(builder);
  #[cfg(mobile)]
  let builder = mobile::configure(builder);
  builder
    .build(tauri::generate_context!())
    .expect("error while building AHDClient")
    .run(|app, event| {
      #[cfg(desktop)]
      if let tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit = event {
        desktop::on_exit(app);
      }
      #[cfg(mobile)]
      if let tauri::RunEvent::Opened { urls } = event {
        for url in urls { mobile::open_widget_link(app, &url); }
      }
    });
}

#[cfg(test)]
mod tests {
  use super::{
    help_destination, is_account_session_cookie, is_online_navigation_allowed, is_online_origin, HelpDestination,
    LinkedAccount,
  };
  use tauri::Url;

  #[test]
  fn linked_account_parses_with_and_without_avatar_url() {
    let without: LinkedAccount = serde_json::from_value(serde_json::json!({
      "linked": true, "displayName": "Ada", "supporter": false,
      "singleplayer": { "entitled": true, "expiresAt": null },
    }))
    .expect("account without avatarUrl parses");
    assert_eq!(without.avatar_url, None);
    let with: LinkedAccount = serde_json::from_value(serde_json::json!({
      "linked": true, "displayName": "Ada", "supporter": true,
      "avatarUrl": "https://cdn.discordapp.com/avatars/1/a.png",
      "singleplayer": { "entitled": true, "expiresAt": null },
    }))
    .expect("account with avatarUrl parses");
    assert_eq!(
      with.avatar_url.as_deref(),
      Some("https://cdn.discordapp.com/avatars/1/a.png")
    );
  }

  #[test]
  fn help_routes_resolve_only_to_allowlisted_targets() {
    assert_eq!(
      help_destination("help.wiki"),
      Some(HelpDestination::External("https://wiki.ahousedividedgame.com")),
    );
    assert_eq!(help_destination("help.about"), Some(HelpDestination::Online("/about")));
    assert_eq!(help_destination("help.profile"), Some(HelpDestination::Online("/profile")));
    assert!(matches!(
      help_destination("help.report-issue"),
      Some(HelpDestination::External(url)) if url.contains(env!("CARGO_PKG_VERSION"))
    ));
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
}
