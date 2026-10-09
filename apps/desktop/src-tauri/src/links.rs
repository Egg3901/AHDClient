//! App deep links shared by the phone shell. Pure functions, compiled on
//! every target so the desktop test run covers them.
#![cfg_attr(not(mobile), allow(dead_code))]

use tauri::Url;

/// The launcher page for `ahdclient://launcher[/briefing]`. The briefing
/// variant opens the launcher straight on its Briefing screen.
pub(crate) fn launcher_target(home: &Url, request: &Url) -> Url {
  let mut target = home.clone();
  target.set_query(None);
  target.set_fragment(None);
  if request.path().trim_end_matches('/') == "/briefing" {
    target.set_query(Some("screen=briefing"));
  }
  target
}

/// The game page an `ahdclient://page/<path>` link names (widget rows), with
/// its query. `None` for anything that is not a bounded same-origin path.
pub(crate) fn widget_page(url: &Url) -> Option<String> {
  if url.scheme() != "ahdclient" || url.host_str() != Some("page") { return None; }
  let path = match url.query() {
    Some(query) => format!("{}?{query}", url.path()),
    None => url.path().to_string(),
  };
  crate::briefing::game_page_path(&path).map(str::to_string)
}

#[cfg(test)]
mod tests {
  use super::{launcher_target, widget_page};
  use tauri::Url;

  #[test]
  fn widget_rows_open_only_game_pages() {
    let row: Url = "ahdclient://page/corporation/9".parse().unwrap();
    let tabbed: Url = "ahdclient://page/corporation/9?tab=sectors".parse().unwrap();
    assert_eq!(widget_page(&row).as_deref(), Some("/corporation/9"));
    assert_eq!(widget_page(&tabbed).as_deref(), Some("/corporation/9?tab=sectors"));
    for bad in ["ahdclient://page//example.com", "ahdclient://briefing/profile", "https://page/corporation/9"] {
      assert_eq!(widget_page(&bad.parse().unwrap()), None, "{bad}");
    }
  }

  #[test]
  fn the_briefing_menu_item_opens_the_launcher_on_its_briefing_screen() {
    let home: Url = "tauri://localhost/index.html".parse().unwrap();
    let briefing: Url = "ahdclient://launcher/briefing".parse().unwrap();
    let launcher: Url = "ahdclient://launcher".parse().unwrap();
    assert_eq!(launcher_target(&home, &briefing).as_str(), "tauri://localhost/index.html?screen=briefing");
    assert_eq!(launcher_target(&home, &launcher).as_str(), "tauri://localhost/index.html");
    let android: Url = "http://tauri.localhost/?screen=briefing".parse().unwrap();
    assert_eq!(launcher_target(&android, &launcher).as_str(), "http://tauri.localhost/");
  }
}
