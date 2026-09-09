//! Read-only multiplayer briefing. One fixed authenticated endpoint, with
//! credentials kept in native memory and never returned to a webview.
use std::io::Read;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Url};

const STATUS_PATH: &str = "/api/client-status?layout=full";
const MAX_BODY: u64 = 128 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Profile {
  pub name: String,
  pub avatar_url: Option<String>,
  pub actions: Option<f64>,
  pub action_cap: Option<f64>,
  pub funds: Option<f64>,
  pub personal_home_liquid: Option<f64>,
  pub home_currency: Option<String>,
  pub political_influence: Option<f64>,
  pub favorability: Option<f64>,
  #[serde(default)]
  pub is_imperial: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Election {
  pub election_id: String,
  pub election_type: Option<String>,
  pub country_id: Option<String>,
  pub state: Option<String>,
  pub status: Option<String>,
  pub election_year: Option<f64>,
  pub end_turn: Option<f64>,
  pub my_vote_pct: Option<f64>,
  pub margin_pct: Option<f64>,
  pub seats_projected: Option<f64>,
  pub total_seats: Option<f64>,
  #[serde(default)]
  pub is_multi_seat: bool,
  #[serde(default)]
  pub history: Vec<ElectionPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ElectionPoint {
  pub turn: f64,
  pub pct: f64,
  pub seats: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Corporation {
  pub sequential_id: u64,
  pub name: String,
  pub logo_url: Option<String>,
  pub ticker_symbol: Option<String>,
  pub share_price: Option<f64>,
  pub price_change1h: Option<f64>,
  pub liquid_capital: Option<f64>,
  pub liquid_currency_code: Option<String>,
  pub marketing_strength: Option<f64>,
  #[serde(default)]
  pub history: Vec<CorporationPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CorporationPoint {
  pub turn: f64,
  pub share_price: f64,
  pub marketing_strength: f64,
  pub liquid_capital: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarketWatchItem {
  pub sequential_id: u64,
  pub name: String,
  pub logo_url: Option<String>,
  pub ticker_symbol: Option<String>,
  pub share_price: Option<f64>,
  pub liquid_currency_code: Option<String>,
  pub owned_shares: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Briefing {
  pub status: String,
  pub updated_at: u64,
  pub profile: Option<Profile>,
  pub election: Option<Election>,
  pub corporation: Option<Corporation>,
  #[serde(default)]
  pub turn_briefing: Vec<TurnBriefingItem>,
  #[serde(default)]
  pub market_watch: Vec<MarketWatchItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TurnBriefingItem {
  pub category: String,
  pub label: String,
  pub value: f64,
  pub delta: f64,
  pub unit: String,
  pub href: String,
}

impl Briefing {
  fn empty(status: &str) -> Self {
    Self { status: status.into(), updated_at: now_ms(), profile: None, election: None, corporation: None, turn_briefing: Vec::new(), market_watch: Vec::new() }
  }
}

fn now_ms() -> u64 {
  SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64
}

pub(crate) fn parse_status(value: serde_json::Value) -> Result<Briefing, String> {
  if value.get("status").and_then(|s| s.as_str()) == Some("no-character") {
    return Ok(Briefing::empty("no-character"));
  }
  let mut profile: Profile = serde_json::from_value(value.clone()).map_err(|_| "Invalid briefing response.")?;
  profile.name = profile.name.chars().take(120).collect();
  profile.avatar_url = bounded_https_url(profile.avatar_url);
  let election = value.get("electionStats").filter(|v| !v.is_null()).map(|v| {
    let mut election: Election = serde_json::from_value(v.clone()).map_err(|_| "Invalid election response.")?;
    if election.election_id.len() != 24 || !election.election_id.chars().all(|c| c.is_ascii_hexdigit()) {
      return Err("Invalid election link.");
    }
    election.election_type = bounded_text(election.election_type, 40);
    election.country_id = bounded_text(election.country_id, 8);
    election.state = bounded_text(election.state, 80);
    election.status = bounded_text(election.status, 20);
    election.history.truncate(12);
    election.history.retain(|point| point.turn.is_finite() && point.pct.is_finite()
      && point.seats.map(f64::is_finite).unwrap_or(true));
    Ok(election)
  }).transpose()?;
  let corporation = value.get("corpNav").filter(|v| !v.is_null()).map(|v| {
    let mut corp: Corporation = serde_json::from_value(v.clone()).map_err(|_| "Invalid corporation response.")?;
    corp.name = corp.name.chars().take(120).collect();
    corp.logo_url = bounded_https_url(corp.logo_url);
    corp.ticker_symbol = corp.ticker_symbol.map(|value| value.chars().take(8).collect());
    corp.history.truncate(12);
    corp.history.retain(|point| point.turn.is_finite() && point.share_price.is_finite()
      && point.marketing_strength.is_finite() && point.liquid_capital.is_finite());
    Ok::<_, &str>(corp)
  }).transpose()?;
  let mut turn_briefing = value.get("turnBriefing").cloned()
    .and_then(|items| serde_json::from_value::<Vec<TurnBriefingItem>>(items).ok()).unwrap_or_default();
  turn_briefing.truncate(5);
  turn_briefing.retain(|item| item.value.is_finite() && item.delta.is_finite()
    && item.href.starts_with('/') && !item.href.starts_with("//"));
  for item in &mut turn_briefing {
    item.category = item.category.chars().take(20).collect();
    item.label = item.label.chars().take(80).collect();
    item.unit = item.unit.chars().take(16).collect();
    item.href = item.href.chars().take(160).collect();
  }
  let mut market_watch = value.get("marketWatch").cloned()
    .and_then(|items| serde_json::from_value::<Vec<MarketWatchItem>>(items).ok()).unwrap_or_default();
  market_watch.truncate(5);
  market_watch.retain(|item| item.sequential_id > 0 && item.owned_shares.is_finite() && item.owned_shares > 0.0);
  for item in &mut market_watch {
    item.name = item.name.chars().take(120).collect();
    item.logo_url = bounded_https_url(item.logo_url.take());
    item.ticker_symbol = item.ticker_symbol.take().map(|value| value.chars().take(8).collect());
  }
  Ok(Briefing { status: "ready".into(), updated_at: now_ms(), profile: Some(profile), election, corporation, turn_briefing, market_watch })
}

fn bounded_https_url(value: Option<String>) -> Option<String> {
  let value = value?.trim().to_string();
  if value.len() > 2048 { return None; }
  let url = Url::parse(&value).ok()?;
  let host = url.host_str()?.to_ascii_lowercase();
  let trusted = host == "ahousedividedgame.com"
    || host.ends_with(".ahousedividedgame.com")
    || host == "cdn.discordapp.com"
    || host.ends_with(".public.blob.vercel-storage.com");
  (url.scheme() == "https" && trusted).then_some(value)
}

fn bounded_text(value: Option<String>, limit: usize) -> Option<String> {
  value.map(|text| text.chars().take(limit).collect())
}

struct Cached {
  // Session comparison prevents one account's snapshot being reused for another.
  session: String,
  fetched: Instant,
  briefing: Briefing,
}

#[derive(Default)]
pub(crate) struct BriefingState {
  cache: Mutex<Option<Cached>>,
  fetch: tokio::sync::Mutex<()>,
}

fn session_header(app: &AppHandle) -> Result<String, String> {
  let view = app.get_webview("online-embedded")
    .or_else(|| app.get_webview("online"))
    .or_else(|| app.get_webview("main"))
    .ok_or("The app session is unavailable.")?;
  let url: Url = format!("{}{STATUS_PATH}", crate::ONLINE_URL).parse().map_err(|_| "Invalid briefing URL.")?;
  let mut cookies = view.cookies_for_url(url).map_err(|_| "Cannot read the app session.")?
    .into_iter().filter(|c| crate::is_account_session_cookie(c.name())).collect::<Vec<_>>();
  cookies.sort_by(|a, b| a.name().cmp(b.name()));
  Ok(cookies.iter().map(|c| format!("{}={}", c.name(), c.value())).collect::<Vec<_>>().join("; "))
}

#[tauri::command]
pub(crate) async fn get_briefing(app: AppHandle) -> Result<Briefing, String> {
  let state = app.state::<BriefingState>();
  let _fetch = state.fetch.lock().await;
  let header = session_header(&app)?;
  let changed_session;
  {
    let mut cache = state.cache.lock().map_err(|_| "Briefing is unavailable.")?;
    changed_session = cache.as_ref().map(|c| c.session != header).unwrap_or(true);
    if header.is_empty() {
      *cache = None;
      return Ok(Briefing::empty("signed-out"));
    }
    if let Some(cached) = cache.as_ref() {
      if cached.session == header && cached.fetched.elapsed() < Duration::from_secs(30) {
        return Ok(cached.briefing.clone());
      }
    }
    // Never retain the previous identity while fetching a new session.
    if changed_session { *cache = None; }
  }
  let request_header = header.clone();
  let result = tauri::async_runtime::spawn_blocking(move || {
    let agent = ureq::AgentBuilder::new().timeout(Duration::from_secs(12)).redirects(0).build();
    match agent.get(&format!("{}{STATUS_PATH}", crate::ONLINE_URL))
      .set("Cookie", &request_header)
      .set("Cache-Control", "no-cache")
      .set("X-AHD-Client-Version", env!("CARGO_PKG_VERSION"))
      .call() {
      Ok(response) => {
        let mut body = Vec::new();
        response.into_reader().take(MAX_BODY + 1).read_to_end(&mut body).map_err(|_| "Cannot read briefing.")?;
        if body.len() as u64 > MAX_BODY { return Err("Briefing response is too large.".into()); }
        parse_status(serde_json::from_slice(&body).map_err(|_| "Invalid briefing response.")?)
      }
      Err(ureq::Error::Status(401 | 403, _)) => Ok(Briefing::empty("signed-out")),
      Err(_) => Err("Cannot refresh. Check your connection and try again.".into()),
    }
  }).await.map_err(|_| "Briefing refresh failed.")?;
  if session_header(&app)? != header {
    *state.cache.lock().map_err(|_| "Briefing is unavailable.")? = None;
    return Ok(Briefing::empty("signed-out"));
  }
  let briefing = result.map_err(|error| if changed_session { "session-changed".into() } else { error })?;
  *state.cache.lock().map_err(|_| "Briefing is unavailable.")? = Some(Cached {
    session: header, fetched: Instant::now(), briefing: briefing.clone(),
  });
  Ok(briefing)
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Section { Profile, Election, Corporation, Stocks, Turns }

fn section_path(section: Section, briefing: Option<&Briefing>) -> String {
  match section {
    Section::Profile => "/profile".into(),
    Section::Election => briefing.and_then(|b| b.election.as_ref())
      .map(|e| format!("/elections/{}", e.election_id)).unwrap_or("/elections".into()),
    Section::Corporation => briefing.and_then(|b| b.corporation.as_ref())
      .map(|c| format!("/corporation/{}", c.sequential_id)).unwrap_or("/corporation".into()),
    Section::Stocks => "/stockmarket/global".into(),
    Section::Turns => "/profile".into(),
  }
}

#[tauri::command]
pub(crate) async fn open_briefing_page(app: AppHandle, section: Section) -> Result<(), String> {
  let briefing = get_briefing(app.clone()).await.ok();
  let path = section_path(section, briefing.as_ref());
  let url: Url = format!("{}{path}", crate::ONLINE_URL).parse().map_err(|_| "Invalid briefing link.")?;
  #[cfg(desktop)]
  { crate::desktop::open_briefing_url(app, url).await }
  #[cfg(mobile)]
  { crate::mobile::navigate_main(&app, url) }
}

#[cfg(desktop)]
#[tauri::command]
pub(crate) async fn open_briefing_window(app: AppHandle) -> Result<(), String> {
  if let Some(window) = app.get_webview_window("briefing") {
    window.show().map_err(|_| "Cannot show briefing.")?;
    return window.set_focus().map_err(|_| "Cannot focus briefing.".into());
  }
  tauri::WebviewWindowBuilder::new(&app, "briefing", tauri::WebviewUrl::App("index.html?view=briefing".into()))
    .title("AHDClient · Multiplayer briefing")
    .inner_size(380.0, 600.0).min_inner_size(320.0, 460.0)
    .always_on_top(true).resizable(true).center()
    .background_color(tauri::window::Color(0x14, 0x14, 0x1c, 0xff))
    .on_navigation(|url| (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
      || (matches!(url.scheme(), "http" | "https") && url.host_str() == Some("tauri.localhost")))
    .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
    .build().map_err(|_| "Cannot open briefing window.")?;
  Ok(())
}

#[cfg(desktop)]
#[tauri::command]
pub(crate) fn set_briefing_pinned(app: AppHandle, pinned: bool) -> Result<(), String> {
  app.get_webview_window("briefing").ok_or("Briefing window is closed.")?
    .set_always_on_top(pinned).map_err(|_| "Cannot change window pin.".into())
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;

  #[test]
  fn briefing_omits_unrequested_fields_and_preserves_missing_stats() {
    let result = parse_status(json!({"name":"Example", "actions":0, "funds":45,
      "secret":"must not cross IPC", "history":[1,2,3]})).unwrap();
    assert_eq!(result.profile.as_ref().unwrap().actions, Some(0.0));
    assert_eq!(result.profile.as_ref().unwrap().favorability, None);
    let output = serde_json::to_string(&result).unwrap();
    assert!(!output.contains("secret"));
    assert!(!output.contains("history"));
    assert_eq!(section_path(Section::Corporation, Some(&result)), "/corporation");
  }

  #[test]
  fn no_character_clears_all_cards() {
    let result = parse_status(json!({"status":"no-character"})).unwrap();
    assert!(result.profile.is_none() && result.election.is_none() && result.corporation.is_none());
  }

  #[test]
  fn invalid_payloads_cannot_create_navigation_targets() {
    assert!(parse_status(json!({"error":"failed"})).is_err());
    assert!(parse_status(json!({"name":"Example","electionStats":{"electionId":"//example.com"}})).is_err());
    assert!(parse_status(json!({"name":"Example","corpNav":{"sequentialId":"../settings","name":"Example"}})).is_err());
  }

  #[test]
  fn identity_images_allow_only_bounded_https_urls() {
    let result = parse_status(json!({
      "name":"Example",
      "avatarUrl":"http://example.com/avatar.png",
      "corpNav":{
        "sequentialId":7,
        "name":"Example Corp",
        "logoUrl":"https://cdn.ahousedividedgame.com/logo.png",
        "tickerSymbol":"EXAMPLE-LONG"
      }
    })).unwrap();
    assert_eq!(result.profile.unwrap().avatar_url, None);
    let corporation = result.corporation.unwrap();
    assert_eq!(corporation.logo_url.as_deref(), Some("https://cdn.ahousedividedgame.com/logo.png"));
    assert_eq!(corporation.ticker_symbol.as_deref(), Some("EXAMPLE-"));
  }
}
