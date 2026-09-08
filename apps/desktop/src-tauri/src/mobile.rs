//! Mobile half of AHDClient (Android and iOS).
//!
//! One webview and no child processes. The launcher is the app's own page;
//! "Enter multiplayer" and "Link account" navigate that same webview to the
//! live site, which is how the site's cookie-backed session (and its OAuth
//! callbacks) stay inside the app. Remote pages never receive Tauri IPC: the
//! mobile capability is scoped to the app origin and Tauri exposes nothing to
//! other origins. The only way back is the `ahdclient://launcher` navigation
//! that the injected control below triggers and `on_navigation` intercepts;
//! Android's system back button walks the same history.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

use crate::{help_destination, is_online_navigation_allowed, linked_account, HelpDestination, ONLINE_URL, SANDBOX_URL};

/// Appended to the platform WebView user agent (Android, in MainActivity.kt)
/// or used as the WebKit-shaped custom agent (iOS). The site keys ad slots,
/// consent prompts and the cookie banner off this marker.
pub(crate) const USER_AGENT_MARKER: &str = concat!("AHDClient-Mobile/", env!("CARGO_PKG_VERSION"));

/// Where the launcher lives once the webview is up. Captured at creation so
/// a custom-protocol change never strands the player on the site.
struct LauncherHome(Mutex<Option<Url>>);

/// Generation counter for the account-link watcher so a second Link tap
/// retires the first watcher instead of racing it.
struct LinkWatch(AtomicU64);

const LINK_POLL: Duration = Duration::from_millis(2500);
const LINK_DEADLINE: Duration = Duration::from_secs(10 * 60);

/// A small fixed control on remote pages that returns to the launcher. It is
/// mounted after `load` (so hydration has finished) and re-mounted if the
/// site's router ever drops it. Nothing on the app's own pages.
const LAUNCHER_CONTROL_SCRIPT: &str = r#"
(function () {
  if (location.protocol === 'tauri:' || location.hostname === 'tauri.localhost') return;
  function mount() {
    if (!document.body || document.getElementById('ahdclient-launcher')) return;
    var button = document.createElement('button');
    button.id = 'ahdclient-launcher';
    button.type = 'button';
    button.setAttribute('aria-label', 'Back to the AHDClient launcher');
    button.textContent = 'AHD';
    button.style.cssText = 'position:fixed;left:max(10px,env(safe-area-inset-left));bottom:max(14px,env(safe-area-inset-bottom));z-index:2147483647;width:44px;height:44px;padding:0;border-radius:50%;border:1px solid rgba(255,255,255,.35);background:rgba(20,20,28,.74);color:#fff;font:700 12px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.04em;opacity:.6;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);cursor:pointer;';
    button.addEventListener('click', function (event) {
      event.preventDefault();
      location.href = 'ahdclient://launcher';
    });
    document.body.appendChild(button);
  }
  if (document.readyState === 'complete') mount();
  else window.addEventListener('load', mount);
  setInterval(mount, 2000);
})();
"#;

/// The app's own origin: `tauri://localhost` on iOS, `http://tauri.localhost`
/// on Android. Anything else is remote.
fn is_app_origin(url: &Url) -> bool {
  url.scheme() == "tauri" || (url.scheme() == "http" && url.host_str() == Some("tauri.localhost"))
}

fn is_launcher_request(url: &Url) -> bool {
  url.scheme() == "ahdclient" && url.host_str() == Some("launcher")
}

fn launcher_home(app: &AppHandle) -> Url {
  app
    .try_state::<LauncherHome>()
    .and_then(|home| home.0.lock().ok().and_then(|url| url.clone()))
    .unwrap_or_else(|| {
      let fallback = if cfg!(target_os = "android") { "http://tauri.localhost/" } else { "tauri://localhost/" };
      fallback.parse().expect("static launcher URL")
    })
}

fn main_webview(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
  app.get_webview_window("main").ok_or_else(|| "the app webview is missing".to_string())
}

pub(crate) fn navigate_main(app: &AppHandle, url: Url) -> Result<(), String> {
  main_webview(app)?.navigate(url).map_err(|e| e.to_string())
}

pub(crate) fn open_widget_link(app: &AppHandle, url: &Url) {
  if url.scheme() != "ahdclient" || url.host_str() != Some("briefing") { return; }
  let section = match url.path() {
    "/profile" => crate::briefing::Section::Profile,
    "/election" => crate::briefing::Section::Election,
    "/corporation" => crate::briefing::Section::Corporation,
    _ => return,
  };
  let app = app.clone();
  tauri::async_runtime::spawn(async move {
    // A cold launch may deliver the URL just before the main view is ready.
    for _ in 0..50 {
      if app.get_webview("main").is_some() {
        let _ = crate::briefing::open_briefing_page(app, section).await;
        return;
      }
      tokio::time::sleep(Duration::from_millis(100)).await;
    }
  });
}

/// Leave the remote page for the launcher. Deferred off the navigation
/// callback so the platform webview finishes cancelling the current request
/// before it is asked to load another.
fn go_home_soon(app: &AppHandle) {
  let app = app.clone();
  tauri::async_runtime::spawn(async move {
    tokio::time::sleep(Duration::from_millis(30)).await;
    let _ = navigate_main(&app, launcher_home(&app));
  });
}

fn open_externally(app: &AppHandle, url: &Url) {
  if matches!(url.scheme(), "https" | "http" | "mailto") {
    let _ = app.opener().open_url(url.to_string(), None::<&str>);
  }
}

/// Allowed in the app webview: the launcher itself and the online allowlist.
/// The launcher deep link goes home; everything else opens in the system
/// browser and is denied here.
fn navigation_policy(app: &AppHandle, url: &Url) -> bool {
  if is_launcher_request(url) {
    go_home_soon(app);
    return false;
  }
  if is_app_origin(url) || is_online_navigation_allowed(url) {
    return true;
  }
  open_externally(app, url);
  false
}

fn user_agent() -> Option<String> {
  if cfg!(target_os = "ios") {
    // WKWebView has no "append" hook; this is the shape iOS 17 reports, with
    // the marker the site keys on. Android appends in MainActivity.kt instead.
    Some(format!(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 {USER_AGENT_MARKER}"
    ))
  } else {
    None
  }
}

fn create_main_window(app: &AppHandle) -> tauri::Result<()> {
  let nav_app = app.clone();
  let popup_app = app.clone();
  let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
    .title("A House Divided")
    .background_color(tauri::window::Color(0x14, 0x14, 0x1c, 0xff))
    .initialization_script(LAUNCHER_CONTROL_SCRIPT)
    .on_navigation(move |url| navigation_policy(&nav_app, url))
    .on_new_window(move |url, _features| {
      open_externally(&popup_app, &url);
      tauri::webview::NewWindowResponse::Deny
    });
  if let Some(agent) = user_agent() {
    builder = builder.user_agent(&agent);
  }
  let window = builder.build()?;
  if let (Ok(url), Some(home)) = (window.url(), app.try_state::<LauncherHome>()) {
    if let Ok(mut slot) = home.0.lock() {
      *slot = Some(url);
    }
  }
  Ok(())
}

/// `target` is "live" or "sandbox"; the sandbox needs a linked supporter
/// account, checked against the site with the webview's own session.
#[tauri::command]
pub(crate) async fn open_online_window(app: AppHandle, target: Option<String>) -> Result<(), String> {
  let base = match target.as_deref() {
    None | Some("live") => ONLINE_URL,
    Some("sandbox") => {
      let account = linked_account(app.clone()).await?;
      if !account.is_some_and(|account| account.linked && account.supporter) {
        app.opener().open_url("https://www.patreon.com/cw/AHouseDividedGame/membership", None::<&str>).map_err(|e| e.to_string())?;
        return Err("Sandbox requires supporter access. Link your supporter game account in Settings.".into());
      }
      SANDBOX_URL
    }
    Some(other) => return Err(format!("unknown online target {other:?}")),
  };
  let url: Url = base.parse().map_err(|e| format!("bad online URL: {e}"))?;
  navigate_main(&app, url)
}

/// Send the webview to the site's link page and watch the cookie jar. Once
/// the site reports a linked session the webview comes back to the launcher,
/// which re-reads the account on mount. Gives up quietly after ten minutes
/// or as soon as the player returns on their own.
#[tauri::command]
pub(crate) async fn link_account(app: AppHandle) -> Result<(), String> {
  let url: Url = format!("{ONLINE_URL}/client/link").parse().map_err(|_| "invalid account URL")?;
  navigate_main(&app, url)?;
  let generation = app.state::<LinkWatch>().0.fetch_add(1, Ordering::SeqCst) + 1;
  tauri::async_runtime::spawn(async move {
    let started = tokio::time::Instant::now();
    loop {
      tokio::time::sleep(LINK_POLL).await;
      if app.state::<LinkWatch>().0.load(Ordering::SeqCst) != generation || started.elapsed() > LINK_DEADLINE {
        break;
      }
      let Ok(view) = main_webview(&app) else { break };
      if view.url().map(|url| is_app_origin(&url)).unwrap_or(true) {
        break;
      }
      if let Ok(Some(account)) = linked_account(app.clone()).await {
        if account.linked {
          let _ = navigate_main(&app, launcher_home(&app));
          break;
        }
      }
    }
  });
  Ok(())
}

#[tauri::command]
pub(crate) async fn open_help_destination(app: AppHandle, route_id: String) -> Result<(), String> {
  match help_destination(&route_id) {
    Some(HelpDestination::Online(path)) => {
      let url: Url = format!("{ONLINE_URL}{path}").parse().map_err(|e| format!("bad Help URL: {e}"))?;
      navigate_main(&app, url)
    }
    Some(HelpDestination::External(url)) => app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string()),
    None => Err(format!("unknown Help destination: {route_id}")),
  }
}

pub(crate) fn configure(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
  builder
    .manage(LauncherHome(Mutex::new(None)))
    .manage(LinkWatch(AtomicU64::new(0)))
    .invoke_handler(tauri::generate_handler![
      crate::briefing::get_briefing,
      crate::briefing::open_briefing_page,
      crate::submit_diagnostics,
      crate::linked_account,
      link_account,
      open_online_window,
      open_help_destination,
    ])
    .setup(|app| {
      create_main_window(app.handle())?;
      Ok(())
    })
}

#[cfg(test)]
mod tests {
  use super::{is_app_origin, is_launcher_request, USER_AGENT_MARKER};
  use tauri::Url;

  #[test]
  fn app_origin_matches_both_mobile_custom_protocol_shapes() {
    let ios: Url = "tauri://localhost/index.html".parse().unwrap();
    let android: Url = "http://tauri.localhost/".parse().unwrap();
    let site: Url = "https://ahousedividedgame.com/".parse().unwrap();
    let spoof: Url = "https://tauri.localhost/".parse().unwrap();
    assert!(is_app_origin(&ios));
    assert!(is_app_origin(&android));
    assert!(!is_app_origin(&site));
    assert!(!is_app_origin(&spoof));
  }

  #[test]
  fn only_the_launcher_deep_link_returns_home() {
    let home: Url = "ahdclient://launcher".parse().unwrap();
    let settings: Url = "ahdclient://settings".parse().unwrap();
    let web: Url = "https://ahousedividedgame.com/launcher".parse().unwrap();
    assert!(is_launcher_request(&home));
    assert!(!is_launcher_request(&settings));
    assert!(!is_launcher_request(&web));
  }

  #[test]
  fn user_agent_marker_carries_the_client_version() {
    assert!(USER_AGENT_MARKER.starts_with("AHDClient-Mobile/"));
    assert_eq!(USER_AGENT_MARKER.trim_start_matches("AHDClient-Mobile/"), env!("CARGO_PKG_VERSION"));
  }
}
