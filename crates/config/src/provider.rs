use serde::Deserialize;

/// Configuration for a single AI provider.
#[derive(Debug, Clone, Deserialize)]
pub struct ProviderConfig {
    /// Provider name (e.g. "openai", "anthropic", "custom").
    pub name: String,

    /// Base API URL.
    #[serde(default = "default_api_base")]
    pub api_base: String,

    /// API key — loaded from env var if not in file.
    #[serde(default)]
    pub api_key: Option<String>,

    /// Model identifier to use.
    #[serde(default = "default_model")]
    pub model: String,

    /// Optional maximum tokens per request.
    pub max_tokens: Option<u32>,

    /// Optional temperature.
    pub temperature: Option<f32>,

    /// Request timeout in seconds.
    #[serde(default = "default_timeout")]
    pub timeout_secs: u64,
}

fn default_api_base() -> String {
    "https://api.openai.com/v1".into()
}

fn default_model() -> String {
    "gpt-4o".into()
}

fn default_timeout() -> u64 {
    120
}
