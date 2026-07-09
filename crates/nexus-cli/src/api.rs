//! Minimal reqwest-based client for the NEXUS API.

use anyhow::{anyhow, Result};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
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

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "lowercase")]
pub enum PluginKind {
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

#[derive(Debug, Deserialize)]
pub struct Agent {
  pub id: String,
  pub status: String,
}

#[derive(Debug, Deserialize)]
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
struct ApiError {
  code: String,
  message: String,
}

#[derive(Debug, Default, Deserialize)]
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
