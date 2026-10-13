//! Real WebKit smoke window, compiled only with `--features desktop-smoke`.
//! It deliberately uses the production `game` label/capability and external
//! navigation callback, but serves a credential-free fixture on loopback.

use std::io::{Read, Write};
use std::net::TcpListener;
use std::thread;

use tauri::{AppHandle, Url, WebviewUrl, WebviewWindowBuilder};

const FIXTURE: &str = r#"<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>desktop-smoke-ready</title>
<style>
  body { font: 18px sans-serif; }
  button, a { display: block; position: absolute; left: 40px; width: 280px; height: 44px; }
  #accept { top: 40px; }
  #cancel { top: 100px; }
  #blank { top: 160px; }
  #self { top: 220px; }
</style>
<button id="accept" onclick="document.title = window.confirm('Accept this desktop smoke confirmation?') ? 'smoke-accepted' : 'smoke-cancelled'">Accept confirmation</button>
<button id="cancel" onclick="document.title = window.confirm('Cancel this desktop smoke confirmation?') ? 'smoke-accepted' : 'smoke-cancelled'">Cancel confirmation</button>
<a id="blank" href="https://example.invalid/desktop-smoke-blank" target="_blank">Guarded external link in new window</a>
<a id="self" href="https://example.invalid/desktop-smoke-self">Guarded external link in current window</a>
</html>"#;

/// Start a loopback-only fixture server and open it with the same game label,
/// capability and navigation policy used by the production standalone game.
pub(crate) fn open(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
  let listener = TcpListener::bind(("127.0.0.1", 0))?;
  let port = listener.local_addr()?.port();
  thread::Builder::new()
    .name("desktop-smoke-fixture".into())
    .spawn(move || {
      for mut stream in listener.incoming().flatten() {
        let mut request = [0_u8; 1024];
        let _ = stream.read(&mut request);
        let response = format!(
          "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
          FIXTURE.len(), FIXTURE
        );
        let _ = stream.write_all(response.as_bytes());
      }
    })?;

  let url: Url = format!("http://127.0.0.1:{port}/")
    .parse()
    .map_err(|error| format!("invalid smoke fixture URL: {error}"))?;
  let navigation_app = app.clone();
  let popup_app = app.clone();
  WebviewWindowBuilder::new(app, "game", WebviewUrl::External(url))
    .title("desktop-smoke-ready")
    .inner_size(640.0, 360.0)
    .center()
    .on_document_title_changed(|window, title| {
      let _ = window.set_title(&title);
    })
    .on_navigation(move |url| crate::desktop::game_window_navigation(&navigation_app, url, port))
    .on_new_window(move |url, _features| crate::desktop::game_window_new_window(&popup_app, url))
    .build()?;

  Ok(())
}
