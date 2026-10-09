//! The one place that reads or clears WebView cookies.
//!
//! wry's iOS cookie calls wait for WebKit by re-entering the main run loop
//! from inside tao's event handler. Tao's run loop observer then fires in the
//! middle of that handler and panics in a function that cannot unwind, which
//! aborts the app (TestFlight crash on 2.3.25, a quarter second after launch).
//! wry's Android reader waits ten seconds for the main thread and then drops
//! its reply channel; when the main thread answers later, wry unwraps the
//! failed send and aborts (Android 16 launch test on 2.4.0). Both platforms
//! read through the native plugin instead, which waits on the calling thread.
//! Every caller here runs on an async worker or its own thread, never the
//! main thread.
use tauri::{webview::Cookie, AppHandle, Url, Webview};

#[cfg(mobile)]
fn companion(app: &AppHandle) -> tauri::State<'_, tauri_plugin_briefing_widgets::NativeCompanion<tauri::Wry>> {
  use tauri::Manager;
  app.state::<tauri_plugin_briefing_widgets::NativeCompanion<tauri::Wry>>()
}

pub(crate) fn cookies_for_url(app: &AppHandle, view: &Webview, url: Url) -> Result<Vec<Cookie<'static>>, String> {
  #[cfg(mobile)]
  {
    let _ = view;
    companion(app).cookies_for_url(&url)
  }
  #[cfg(not(mobile))]
  {
    let _ = app;
    view.cookies_for_url(url).map_err(|e| e.to_string())
  }
}

pub(crate) fn all_cookies(app: &AppHandle, view: &Webview) -> Result<Vec<Cookie<'static>>, String> {
  #[cfg(target_os = "ios")]
  {
    let _ = view;
    companion(app).all_cookies()
  }
  #[cfg(not(target_os = "ios"))]
  {
    let _ = app;
    view.cookies().map_err(|e| e.to_string())
  }
}

pub(crate) fn delete_cookie(app: &AppHandle, view: &Webview, cookie: Cookie<'static>) -> Result<(), String> {
  #[cfg(target_os = "ios")]
  {
    let _ = view;
    companion(app).delete_cookie(&cookie)
  }
  #[cfg(not(target_os = "ios"))]
  {
    let _ = app;
    view.delete_cookie(cookie).map_err(|e| e.to_string())
  }
}
