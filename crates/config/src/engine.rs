use serde::Deserialize;

/// Routing-engine specific configuration.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct RoutingEngineConfig {
    /// Strategy for routing requests ("round-robin", "failover", "latency").
    #[serde(default = "default_strategy")]
    pub strategy: String,

    /// Maximum number of retries per request.
    #[serde(default = "default_max_retries")]
    pub max_retries: u32,

    /// Backoff base delay in milliseconds.
    #[serde(default = "default_backoff_ms")]
    pub backoff_base_ms: u64,

    /// Whether to enable concurrent request fan-out.
    #[serde(default)]
    pub fan_out: bool,

    /// Max concurrent requests when fan-out is enabled.
    #[serde(default = "default_max_concurrent")]
    pub max_concurrent: u32,
}

fn default_strategy() -> String {
    "round-robin".into()
}

fn default_max_retries() -> u32 {
    3
}

fn default_backoff_ms() -> u64 {
    1000
}

fn default_max_concurrent() -> u32 {
    4
}
