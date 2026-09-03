use tauri::{Manager, Url};
#[cfg(desktop)]
use tauri::{WebviewUrl, WebviewWindowBuilder, WindowEvent};
#[cfg(desktop)]
use tauri_plugin_opener::OpenerExt;

/// Canonical multiplayer viewer target. See docs/FRAMEWORK.md
/// "Security doctrine" #2 for the tightly bounded navigation policy.
const ONLINE_URL: &str = "https://ahousedividedgame.com";
#[cfg(desktop)]
const ONLINE_HOST: &str = "ahousedividedgame.com";
#[cfg(desktop)]
const AUXILIARY_ONLINE_HOSTS: &[&str] = &[
  "www.ahousedividedgame.com",
  "discord.com",
  "accounts.google.com",
  "www.google.com",
];

/// True if `url` is the exact HTTPS online origin. Anything else
/// (in-page navigation or a clicked link) gets kicked out to the system
/// browser instead of being followed inside the app.
#[cfg(desktop)]
fn is_online_origin(url: &Url) -> bool {
  url.scheme() == "https"
    && url.host_str() == Some(ONLINE_HOST)
    && url.port_or_known_default() == Some(443)
}

/// The multiplayer webview may stay inside the game origin and the small set
/// of OAuth and callback hosts used by the existing mobile client. It still
/// has no Tauri remote API access or capabilities. Other links open in the
/// system browser.
#[cfg(desktop)]
fn is_online_navigation_allowed(url: &Url) -> bool {
  let secure_default_port =
    url.scheme() == "https" && url.port_or_known_default() == Some(443);
  is_online_origin(url)
    || (secure_default_port
      && url
        .host_str()
        .is_some_and(|host| AUXILIARY_ONLINE_HOSTS.contains(&host)))
}

/// Opens (or focuses) the multiplayer window.
///
/// Security doctrine (docs/FRAMEWORK.md #2/#3): this window is a dedicated
/// webview onto the live site with zero Tauri capabilities. It is built here,
/// in Rust, specifically so `on_navigation` / `on_new_window` can be wired up
/// without handing the "online" webview any IPC surface to call back into —
/// capabilities/online.json grants it nothing at all. Only the trusted "main"
/// window's capability may invoke this command.
///
/// - Session persistence: no `.incognito(true)` is set, so the webview uses
///   the platform's normal persistent cookie/storage jar (WebView2 user data
///   folder / WKWebView default store / WebKitGTK profile), which survives
///   app restarts by default. This is the Tauri default; nothing extra is
///   configured to get it.
/// - Navigation: `on_navigation` allows the canonical game origin and the
///   OAuth hosts used by its sign-in flow. Anything else opens in the system
///   browser through `tauri_plugin_opener`.
/// - `window.open()` / `target="_blank"`: `on_new_window` always denies creating
///   a second Tauri-managed webview window and instead opens the URL in the
///   system browser. This is what stops remote content from spawning a new
///   capability-bearing window.
#[tauri::command]
#[cfg(desktop)]
fn open_online_window(app: tauri::AppHandle) -> Result<(), String> {
  if let Some(existing) = app.get_webview_window("online") {
    existing.set_focus().map_err(|e| e.to_string())?;
    return Ok(());
  }

  let url: Url = ONLINE_URL.parse().map_err(|e| format!("bad ONLINE_URL: {e}"))?;

  let nav_app = app.clone();
  let new_window_app = app.clone();
  let close_app = app.clone();

  let window = WebviewWindowBuilder::new(&app, "online", WebviewUrl::External(url))
    .title("AHDClient: Online")
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
      // Every window.open()/target=_blank request is routed to the system
      // browser; never create a second capability-bearing webview window.
      let _ = new_window_app
        .opener()
        .open_url(url.to_string(), None::<&str>);
      tauri::webview::NewWindowResponse::Deny
    })
    .build()
    .map_err(|e| e.to_string())?;

  // Close-to-launcher: closing the online window (its default OS close
  // button behavior, unaltered) drops back to whatever's underneath. The
  // "main" window (holding the launcher/singleplayer UI) is never touched by
  // this and stays alive the whole time, so this just brings it back to the
  // front so the player lands on the launcher instead of an empty desktop.
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
#[cfg(mobile)]
fn open_online_window(app: tauri::AppHandle) -> Result<(), String> {
  let url: Url = ONLINE_URL.parse().map_err(|error| format!("bad ONLINE_URL: {error}"))?;
  let main = app
    .get_webview_window("main")
    .ok_or_else(|| "main webview is unavailable".to_string())?;
  main.navigate(url).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_opener::init());

  #[cfg(desktop)]
  let builder = builder
    // Restores/persists window size + position per label (main and online
    // alike) across app restarts. Runs entirely on the Rust side via window
    // events; grants no capability to any webview.
    .plugin(tauri_plugin_window_state::Builder::default().build());

  builder
    .invoke_handler(tauri::generate_handler![open_online_window])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
  use super::{is_online_navigation_allowed, is_online_origin};
  use tauri::Url;

  #[test]
  fn online_navigation_stays_in_app_only_for_the_exact_https_origin() {
    let allowed: Url = "https://ahousedividedgame.com/play".parse().unwrap();
    let http: Url = "http://ahousedividedgame.com/play".parse().unwrap();
    let custom_port: Url = "https://ahousedividedgame.com:444/play".parse().unwrap();
    let redirector: Url = "https://www.ahousedividedgame.com/play".parse().unwrap();
    let subdomain: Url = "https://accounts.ahousedividedgame.com/".parse().unwrap();
    let unrelated: Url = "https://example.com/".parse().unwrap();

    assert!(is_online_origin(&allowed));
    assert!(!is_online_origin(&http));
    assert!(!is_online_origin(&custom_port));
    assert!(!is_online_origin(&redirector));
    assert!(!is_online_origin(&subdomain));
    assert!(!is_online_origin(&unrelated));
  }

  #[test]
  fn online_navigation_keeps_only_required_auth_hosts_in_the_webview() {
    let callback_redirector: Url = "https://www.ahousedividedgame.com/api/auth/callback/discord"
      .parse()
      .unwrap();
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
