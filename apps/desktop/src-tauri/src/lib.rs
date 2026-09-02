use tauri::{Manager, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_opener::OpenerExt;

/// Multiplayer viewer target. The online window is a plain webview onto this
/// origin and nothing else; see docs/FRAMEWORK.md "Security doctrine" #2.
const ONLINE_URL: &str = "https://www.ahousedividedgame.com";
const ONLINE_HOST: &str = "www.ahousedividedgame.com";

/// True if `url` is the exact HTTPS online origin. Anything else
/// (in-page navigation or a clicked link) gets kicked out to the system
/// browser instead of being followed inside the app.
fn is_online_origin(url: &Url) -> bool {
  url.scheme() == "https" && url.host_str() == Some(ONLINE_HOST)
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
/// - External links: `on_navigation` only allows staying on the exact HTTPS
///   `www.ahousedividedgame.com` origin; anything else denies the in-app navigation and opens the
///   system browser via `tauri_plugin_opener`, called directly from Rust (no IPC
///   round-trip through the online webview).
/// - `window.open()` / `target="_blank"`: `on_new_window` always denies creating
///   a second Tauri-managed webview window and instead opens the URL in the
///   system browser. This is what stops remote content from spawning a new
///   capability-bearing window.
#[tauri::command]
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
    .title("A House Divided: Online")
    .inner_size(1280.0, 800.0)
    .center()
    .resizable(true)
    .on_navigation(move |url| {
      if is_online_origin(url) {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_opener::init())
    // Restores/persists window size + position per label (main and online
    // alike) across app restarts. Runs entirely on the Rust side via window
    // events; grants no capability to any webview.
    .plugin(tauri_plugin_window_state::Builder::default().build())
    .invoke_handler(tauri::generate_handler![open_online_window])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
  use super::is_online_origin;
  use tauri::Url;

  #[test]
  fn online_navigation_stays_in_app_only_for_the_exact_https_origin() {
    let allowed: Url = "https://www.ahousedividedgame.com/play".parse().unwrap();
    let http: Url = "http://www.ahousedividedgame.com/play".parse().unwrap();
    let apex: Url = "https://ahousedividedgame.com/play".parse().unwrap();
    let subdomain: Url = "https://accounts.ahousedividedgame.com/".parse().unwrap();
    let unrelated: Url = "https://example.com/".parse().unwrap();

    assert!(is_online_origin(&allowed));
    assert!(!is_online_origin(&http));
    assert!(!is_online_origin(&apex));
    assert!(!is_online_origin(&subdomain));
    assert!(!is_online_origin(&unrelated));
  }
}
