//! Minimal reqwest-based client for the NEXUS API.

use anyhow::{anyhow, Result};
use serde::Deserialize;
use serde::Serialize;

#[derive(Debug, Clone, Default, Deserialize)]
#[allow(dead_code)]
pub struct Plugin {
  pub id: String,
  pub slug: String,
  pub name: String,
  pub description: String,
  pub kind: PluginKind,
  pub category: String,
  #[serde(default)]
  pub avg_rating: f64,
  #[serde(default)]
  pub rating_count: u32,
  #[serde(default)]
  pub install_count: u32,
  pub status: String,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PluginKind {
  #[default]
  Plugin,
  Agent,
  Memory,
  Widget,
  Tool,
  Integration,
}

impl std::fmt::Display for PluginKind {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    let s = match self {
      PluginKind::Plugin => "plugin",
      PluginKind::Agent => "agent",
      PluginKind::Memory => "memory",
      PluginKind::Widget => "widget",
      PluginKind::Tool => "tool",
      PluginKind::Integration => "integration",
    };
    f.write_str(s)
  }
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct Agent {
  pub id: String,
  pub status: String,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct Envelope<T> {
  ok: bool,
  #[serde(default)]
  request_id: String,
  #[serde(default)]
  result: Option<T>,
  #[serde(default)]
  error: Option<ApiError>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct ApiError {
  code: String,
  message: String,
}

#[derive(Debug, Default, Deserialize)]
#[allow(dead_code)]
struct Page<T> {
  items: Vec<T>,
  #[serde(default)]
  total: usize,
}

pub struct Client {
  base: String,
  token: Option<String>,
  http: reqwest::Client,
}

impl Client {
  pub fn new(base: String, token: Option<String>) -> Self {
    Self { base, token, http: reqwest::Client::new() }
  }

  fn auth(&self, req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
    match &self.token {
      Some(t) => req.bearer_auth(t),
      None => req,
    }
  }

  async fn get_json<T: for<'de> Deserialize<'de> + Default>(&self, path: &str) -> Result<T> {
    let url = format!("{}{}", self.base, path);
    let res = self.auth(self.http.get(&url)).send().await?;
    let status = res.status();
    let body = res.text().await?;
    if !status.is_success() {
      return Err(anyhow!("request failed ({status}): {body}"));
    }
    let env: Envelope<T> = serde_json::from_str(&body).map_err(|e| anyhow!("bad envelope: {e}"))?;
    env.result.ok_or_else(|| anyhow!("empty result: {:?}", env.error))
  }

  pub async fn list_plugins(&self, category: Option<String>, kind: Option<String>, limit: u32) -> Result<Vec<Plugin>> {
    let mut q = format!("/api/v1/marketplace/plugins?limit={limit}");
    if let Some(c) = category { q.push_str(&format!("&category={c}")); }
    if let Some(k) = kind { q.push_str(&format!("&kind={k}")); }
    let page: Page<Plugin> = self.get_json(&q).await?;
    Ok(page.items)
  }

  pub async fn install_plugin(&self, slug: &str, tenant: Option<String>) -> Result<String> {
    let path = format!("/api/v1/marketplace/plugins/{}/install", slug);
    let body = serde_json::json!({ "tenantId": tenant.unwrap_or_else(|| "default".into()) });
    let url = format!("{}{}", self.base, path);
    let res = self.auth(self.http.post(&url)).json(&body).send().await?;
    let status = res.status();
    let text = res.text().await?;
    if !status.is_success() {
      return Err(anyhow!("install failed ({status}): {text}"));
    }
    let env: Envelope<serde_json::Value> = serde_json::from_str(&text)?;
    let receipt = env.result.and_then(|v| v.get("receipt").cloned()).and_then(|r| r.as_str().map(|s| s.to_string())).unwrap_or_default();
    Ok(receipt)
  }

  pub async fn list_agents(&self) -> Result<Vec<Agent>> {
    let page: Page<Agent> = self.get_json("/api/v1/agents?limit=100").await?;
    Ok(page.items)
  }
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plugin_kind_serde_roundtrip_lowercase() {
        for (json, expected) in [
            ("\"plugin\"", PluginKind::Plugin),
            ("\"agent\"", PluginKind::Agent),
            ("\"memory\"", PluginKind::Memory),
            ("\"widget\"", PluginKind::Widget),
            ("\"tool\"", PluginKind::Tool),
            ("\"integration\"", PluginKind::Integration),
        ] {
            let parsed: PluginKind = serde_json::from_str(json).unwrap();
            assert_eq!(parsed, expected);
        }
    }

    #[test]
    fn plugin_kind_display_matches_json() {
        assert_eq!(PluginKind::Plugin.to_string(), "plugin");
        assert_eq!(PluginKind::Agent.to_string(), "agent");
        assert_eq!(PluginKind::Integration.to_string(), "integration");
    }

    #[test]
    fn envelope_ok_with_result() {
        let json = r#"{"ok":true,"request_id":"r1","result":{"id":"p1","slug":"s","name":"N","description":"d","kind":"plugin","category":"c","status":"active"},"error":null}"#;
        let env: Envelope<Plugin> = serde_json::from_str(json).unwrap();
        assert!(env.ok);
        assert_eq!(env.request_id, "r1");
        assert_eq!(env.result.unwrap().id, "p1");
    }

    #[test]
    fn envelope_defaults_when_fields_absent() {
        // request_id/result/error may be absent (serde default)
        let json = r#"{"ok":false}"#;
        let env: Envelope<Plugin> = serde_json::from_str(json).unwrap();
        assert!(!env.ok);
        assert_eq!(env.request_id, "");
        assert!(env.result.is_none());
        assert!(env.error.is_none());
    }

    #[test]
    fn envelope_error_shape() {
        let json = r#"{"ok":false,"error":{"code":"E1","message":"boom"}}"#;
        let env: Envelope<Plugin> = serde_json::from_str(json).unwrap();
        let err = env.error.unwrap();
        assert_eq!(err.code, "E1");
        assert_eq!(err.message, "boom");
    }

    #[test]
    fn page_defaults_total() {
        let json = r#"{"items":[{"id":"a","status":"up"}]}"#;
        let page: Page<Agent> = serde_json::from_str(json).unwrap();
        assert_eq!(page.items.len(), 1);
        assert_eq!(page.total, 0);
    }

    #[test]
    fn client_new_constructs_with_token() {
        let c = Client::new("http://x".into(), Some("tok".into()));
        // token presence is exercised by auth(); just ensure construction is sound
        let _ = c;
    }
}
