use thiserror::Error;

#[derive(Debug, Error)]
pub enum AgenticError {
    #[error("Configuration error: {0}")]
    Config(String),

    #[error("Provider error: {0}")]
    Provider(String),

    #[error("Invalid request: {0}")]
    InvalidRequest(String),

    #[error("Rate limited. Retry after {0}s")]
    RateLimited(u64),

    #[error("Model not found: {0}")]
    ModelNotFound(String),

    #[error("Authentication failed")]
    AuthFailed,

    #[error("Session expired")]
    SessionExpired,

    #[error("Agent execution error: {0}")]
    AgentExecution(String),

    #[error("Plugin error: {0}")]
    Plugin(String),

    #[error("Skill error: {0}")]
    Skill(String),

    #[error("Kernel error: {0}")]
    Kernel(String),

    #[error("Sandbox violation: {0}")]
    SandboxViolation(String),

    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("{0}")]
    Other(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_display_config() {
        let err = AgenticError::Config("bad".to_string());
        assert_eq!(err.to_string(), "Configuration error: bad");
    }

    #[test]
    fn test_error_display_provider() {
        let err = AgenticError::Provider("down".to_string());
        assert_eq!(err.to_string(), "Provider error: down");
    }

    #[test]
    fn test_error_display_sandbox_violation() {
        let err = AgenticError::SandboxViolation("escaped".to_string());
        assert_eq!(err.to_string(), "Sandbox violation: escaped");
    }

    #[test]
    fn test_error_display_kernel() {
        let err = AgenticError::Kernel("panic".to_string());
        assert_eq!(err.to_string(), "Kernel error: panic");
    }
}
