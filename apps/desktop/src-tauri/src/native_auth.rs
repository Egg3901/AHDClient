//! Disabled native OIDC boundary.
//!
//! The current browser and game-cookie login remains authoritative. This
//! module holds the target contract without exposing tokens or credentials to
//! renderer IPC. Production authority metadata is deliberately absent.

#![allow(dead_code)]

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use sha2::{Digest, Sha256};
use std::sync::Mutex;

pub const CANONICAL_ACCOUNT_CLAIM: &str = "lakeside_account_id";
pub const INITIAL_SCOPES: &[&str] = &["openid", "profile"];

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct AuthorityConfig {
  pub issuer: Option<String>,
  pub client_id: Option<String>,
  pub redirect_uri: Option<String>,
  pub post_logout_redirect_uri: Option<String>,
  pub accounts_audience: Option<String>,
  pub game_audience: Option<String>,
}

impl AuthorityConfig {
  pub fn enabled(&self) -> bool {
    self.issuer.is_some()
      && self.client_id.is_some()
      && self.redirect_uri.is_some()
      && self.accounts_audience.is_some()
      && self.game_audience.is_some()
  }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Pkce {
  pub verifier: String,
  pub challenge: String,
}

pub fn new_pkce() -> Result<Pkce, String> {
  let mut entropy = [0_u8; 32];
  getrandom::getrandom(&mut entropy).map_err(|_| "secure random source unavailable".to_string())?;
  let verifier = URL_SAFE_NO_PAD.encode(entropy);
  let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
  Ok(Pkce { verifier, challenge })
}

pub trait CredentialStore: Send + Sync {
  fn read(&self, grant_id: &str) -> Result<Option<Vec<u8>>, String>;
  fn write(&self, grant_id: &str, credentials: &[u8]) -> Result<(), String>;
  fn clear(&self, grant_id: &str) -> Result<(), String>;
}

/// One coordinator per grant family. Holding this guard across the token call
/// prevents two refreshes from spending the same rotating refresh token.
pub struct RefreshCoordinator(Mutex<()>);

impl RefreshCoordinator {
  pub fn new() -> Self { Self(Mutex::new(())) }

  pub fn serialized<T>(&self, refresh: impl FnOnce() -> T) -> Result<T, String> {
    let _guard = self.0.lock().map_err(|_| "refresh coordinator poisoned".to_string())?;
    Ok(refresh())
  }
}

pub fn token_failure_requires_reauthentication(status: u16, oauth_error: Option<&str>) -> bool {
  status == 400 && oauth_error == Some("invalid_grant")
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn native_oidc_stays_disabled_without_production_metadata() {
    assert!(!AuthorityConfig::default().enabled());
    assert_eq!(INITIAL_SCOPES, &["openid", "profile"]);
    assert!(!INITIAL_SCOPES.contains(&"offline_access"));
  }

  #[test]
  fn pkce_is_s256_with_url_safe_unpadded_values() {
    let pkce = new_pkce().unwrap();
    assert_eq!(pkce.verifier.len(), 43);
    assert_eq!(pkce.challenge.len(), 43);
    assert!(!pkce.verifier.contains('='));
    assert_eq!(pkce.challenge, URL_SAFE_NO_PAD.encode(Sha256::digest(pkce.verifier.as_bytes())));
  }

  #[test]
  fn only_invalid_grant_clears_that_grant() {
    assert!(token_failure_requires_reauthentication(400, Some("invalid_grant")));
    assert!(!token_failure_requires_reauthentication(403, Some("invalid_grant")));
    assert!(!token_failure_requires_reauthentication(400, Some("temporarily_unavailable")));
    assert!(!token_failure_requires_reauthentication(503, None));
  }
}
