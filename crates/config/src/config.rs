use std::path::Path;

use serde::Deserialize;
use thiserror::Error;

use crate::engine::RoutingEngineConfig;
use crate::provider::ProviderConfig;
use crate::skill::SkillManagerConfig;

/// Top-level configuration for Agentic OS.
#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    /// Application name / instance label.
    #[serde(default = "default_app_name")]
    pub app_name: String,

    /// Log level (trace/debug/info/warn/error).
    #[serde(default = "default_log_level")]
    pub log_level: String,

    /// AI provider configurations.
    #[serde(default)]
    pub providers: Vec<ProviderConfig>,

    /// Routing engine settings.
    #[serde(default)]
    pub engine: RoutingEngineConfig,

    /// Skill manager settings.
    #[serde(default)]
    pub skill: SkillManagerConfig,
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

fn default_app_name() -> String {
    "agentic-os".into()
}

fn default_log_level() -> String {
    "info".into()
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/// Errors that can occur while loading or applying configuration.
#[derive(Debug, Error)]
pub enum ConfigError {
    /// The config file could not be read.
    #[error("failed to read config file {path}: {source}")]
    ReadFile {
        path: String,
        #[source]
        source: std::io::Error,
    },

    /// The TOML content could not be parsed.
    #[error("failed to parse config: {0}")]
    Parse(#[from] toml::de::Error),
}

impl Config {
    /// Load configuration from a TOML file path.
    ///
    /// Returns an error if the file cannot be read or the TOML is malformed.
    pub fn from_file<P: AsRef<Path>>(path: P) -> Result<Self, ConfigError> {
        let path = path.as_ref();
        let content =
            std::fs::read_to_string(path).map_err(|source| ConfigError::ReadFile {
                path: path.display().to_string(),
                source,
            })?;
        toml::from_str(&content).map_err(ConfigError::from)
    }

    /// Load configuration from a raw TOML string (useful for tests).
    pub fn from_toml(s: &str) -> Result<Self, ConfigError> {
        toml::from_str(s).map_err(ConfigError::from)
    }

    /// Apply environment variable overrides on top of the parsed config.
    ///
    /// Supported variables (prefixed with `AGENTIC_OS_`):
    ///
    /// | Variable                     | Field            |
    /// |------------------------------|------------------|
    /// | `AGENTIC_OS_LOG_LEVEL`       | `log_level`      |
    /// | `AGENTIC_OS_ENGINE_STRATEGY` | `engine.strategy`|
    ///
    /// Overrides are only applied when the corresponding env var is set.
    pub fn apply_env_overrides(&mut self) {
        if let Ok(val) = std::env::var("AGENTIC_OS_LOG_LEVEL") {
            self.log_level = val;
        }
        if let Ok(val) = std::env::var("AGENTIC_OS_ENGINE_STRATEGY") {
            self.engine.strategy = val;
        }
    }

    /// Convenience: load from file, then apply env overrides.
    pub fn load<P: AsRef<Path>>(path: P) -> Result<Self, ConfigError> {
        let mut cfg = Self::from_file(path)?;
        cfg.apply_env_overrides();
        Ok(cfg)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn minimal_toml_uses_defaults() {
        let toml = r#"
        [engine]
        strategy = "failover"
        "#;
        let cfg = Config::from_toml(toml).unwrap();
        assert_eq!(cfg.app_name, "agentic-os");
        assert_eq!(cfg.log_level, "info");
        assert_eq!(cfg.engine.strategy, "failover");
        assert!(cfg.providers.is_empty());
    }

    #[test]
    fn full_config_roundtrip() {
        let toml = r#"
        app_name = "my-agent"
        log_level = "debug"

        [[providers]]
        name = "openai"
        model = "gpt-4"

        [engine]
        strategy = "latency"
        max_retries = 5

        [skill]
        lazy_load = true
        cache_size = 128
        "#;
        let cfg = Config::from_toml(toml).unwrap();
        assert_eq!(cfg.app_name, "my-agent");
        assert_eq!(cfg.log_level, "debug");
        assert_eq!(cfg.providers.len(), 1);
        assert_eq!(cfg.providers[0].name, "openai");
        assert_eq!(cfg.engine.strategy, "latency");
        assert_eq!(cfg.engine.max_retries, 5);
        assert!(cfg.skill.lazy_load);
        assert_eq!(cfg.skill.cache_size, 128);
    }

    #[test]
    fn env_override_changes_log_level() {
        let mut cfg = Config::from_toml("").unwrap();
        assert_eq!(cfg.log_level, "info");

        // Safety: restore after test
        let prior = std::env::var("AGENTIC_OS_LOG_LEVEL").ok();
        std::env::set_var("AGENTIC_OS_LOG_LEVEL", "trace");
        cfg.apply_env_overrides();
        assert_eq!(cfg.log_level, "trace");

        // Cleanup
        match prior {
            Some(v) => std::env::set_var("AGENTIC_OS_LOG_LEVEL", v),
            None => std::env::remove_var("AGENTIC_OS_LOG_LEVEL"),
        }
    }

    #[test]
    fn env_override_engine_strategy() {
        let mut cfg = Config::from_toml("").unwrap();
        assert_eq!(cfg.engine.strategy, "round-robin");

        let prior = std::env::var("AGENTIC_OS_ENGINE_STRATEGY").ok();
        std::env::set_var("AGENTIC_OS_ENGINE_STRATEGY", "failover");
        cfg.apply_env_overrides();
        assert_eq!(cfg.engine.strategy, "failover");

        match prior {
            Some(v) => std::env::set_var("AGENTIC_OS_ENGINE_STRATEGY", v),
            None => std::env::remove_var("AGENTIC_OS_ENGINE_STRATEGY"),
        }
    }

    #[test]
    fn from_file_returns_error_on_missing() {
        let err = Config::from_file("/tmp/nonexistent-config-12345.toml").unwrap_err();
        assert!(
            matches!(&err, ConfigError::ReadFile { .. }),
            "expected ReadFile error, got {err}"
        );
    }

    #[test]
    fn from_file_returns_error_on_bad_toml() {
        use std::io::Write;
        let dir = std::env::temp_dir();
        let path = dir.join("bad-config-12345.toml");
        let mut f = std::fs::File::create(&path).unwrap();
        writeln!(f, "this is [[[ not valid toml").unwrap();

        let err = Config::from_file(&path).unwrap_err();
        assert!(
            matches!(&err, ConfigError::Parse(_)),
            "expected Parse error, got {err}"
        );

        std::fs::remove_file(&path).unwrap();
    }
}
