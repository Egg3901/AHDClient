//! Cookie matching for the iOS native cookie bridge. Kept free of crate
//! dependencies so it can be unit tested on any host.

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JarCookie {
  pub name: String,
  pub value: String,
  pub domain: String,
  pub path: String,
  pub secure: bool,
}

/// RFC 6265 domain match. A leading dot means the cookie was set for the
/// domain and its subdomains; without one it belongs to that exact host.
fn domain_matches(cookie_domain: &str, host: &str) -> bool {
  let host = host.to_ascii_lowercase();
  let domain = cookie_domain.to_ascii_lowercase();
  match domain.strip_prefix('.') {
    Some(base) => !base.is_empty() && (host == base || host.ends_with(&format!(".{base}"))),
    None => !domain.is_empty() && host == domain,
  }
}

/// RFC 6265 path match.
fn path_matches(cookie_path: &str, request_path: &str) -> bool {
  let cookie_path = if cookie_path.is_empty() { "/" } else { cookie_path };
  let request_path = if request_path.is_empty() { "/" } else { request_path };
  request_path == cookie_path
    || (request_path.starts_with(cookie_path)
      && (cookie_path.ends_with('/') || request_path[cookie_path.len()..].starts_with('/')))
}

/// Whether the browser would send this cookie to `scheme://host path`.
pub fn sent_to(cookie: &JarCookie, https: bool, host: &str, path: &str) -> bool {
  (https || !cookie.secure) && domain_matches(&cookie.domain, host) && path_matches(&cookie.path, path)
}

#[cfg(test)]
mod tests {
  use super::*;

  fn cookie(domain: &str, path: &str, secure: bool) -> JarCookie {
    JarCookie { name: "auth-token".into(), value: "v".into(), domain: domain.into(), path: path.into(), secure }
  }

  #[test]
  fn host_only_cookie_matches_exact_host_only() {
    let c = cookie("ahousedividedgame.com", "/", true);
    assert!(sent_to(&c, true, "ahousedividedgame.com", "/api/client-status"));
    assert!(!sent_to(&c, true, "www.ahousedividedgame.com", "/"));
    assert!(!sent_to(&c, true, "evilahousedividedgame.com", "/"));
  }

  #[test]
  fn dotted_domain_cookie_matches_subdomains() {
    let c = cookie(".ahousedividedgame.com", "/", false);
    assert!(sent_to(&c, true, "ahousedividedgame.com", "/"));
    assert!(sent_to(&c, true, "www.ahousedividedgame.com", "/"));
    assert!(!sent_to(&c, true, "notahousedividedgame.com", "/"));
    assert!(!sent_to(&c, true, "ahousedividedgame.com.evil.example", "/"));
  }

  #[test]
  fn domain_match_ignores_case() {
    assert!(sent_to(&cookie(".AHouseDividedGame.com", "/", false), true, "WWW.ahousedividedgame.COM", "/"));
  }

  #[test]
  fn secure_cookie_is_withheld_from_plain_http() {
    let c = cookie("ahousedividedgame.com", "/", true);
    assert!(!sent_to(&c, false, "ahousedividedgame.com", "/"));
    assert!(sent_to(&cookie("ahousedividedgame.com", "/", false), false, "ahousedividedgame.com", "/"));
  }

  #[test]
  fn path_must_be_a_prefix_on_a_segment_boundary() {
    let c = cookie("ahousedividedgame.com", "/api", false);
    assert!(sent_to(&c, true, "ahousedividedgame.com", "/api"));
    assert!(sent_to(&c, true, "ahousedividedgame.com", "/api/client-status"));
    assert!(!sent_to(&c, true, "ahousedividedgame.com", "/apis"));
    assert!(!sent_to(&c, true, "ahousedividedgame.com", "/"));
  }

  #[test]
  fn empty_paths_default_to_root() {
    assert!(sent_to(&cookie("ahousedividedgame.com", "", false), true, "ahousedividedgame.com", ""));
    assert!(sent_to(&cookie("ahousedividedgame.com", "/", false), true, "ahousedividedgame.com", "/x"));
  }

  #[test]
  fn empty_domain_never_matches() {
    assert!(!sent_to(&cookie("", "/", false), true, "ahousedividedgame.com", "/"));
    assert!(!sent_to(&cookie(".", "/", false), true, "ahousedividedgame.com", "/"));
  }
}
