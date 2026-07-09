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

    #[error("Model error: {0}")]
    Model(String),

    #[error("Network error: {0}")]
    Network(String),

    #[error("Operation timed out: {0}")]
    Timeout(String),

    #[error("Authentication error: {0}")]
    Auth(String),

    #[error("Resource not found: {0}")]
    NotFound(String),

    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("Tool execution error: {0}")]
    Tool(String),

    #[error("Kernel error: {0}")]
    Kernel(String),

    #[error("Sandbox error: {0}")]
    Sandbox(String),

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
    fn test_all_error_variants_construct_and_display() {
        let cases: Vec<AgenticError> = vec![
            AgenticError::Config("bad config".into()),
            AgenticError::Provider("provider down".into()),
            AgenticError::Model("model missing".into()),
            AgenticError::Network("timeout".into()),
            AgenticError::Timeout("took too long".into()),
            AgenticError::Auth("unauthorized".into()),
            AgenticError::NotFound("resource gone".into()),
            AgenticError::RateLimited(30),
            AgenticError::InvalidInput("bad input".into()),
            AgenticError::Tool("tool failed".into()),
            AgenticError::Kernel("ring violation".into()),
            AgenticError::Sandbox("escaped sandbox".into()),
            AgenticError::Skill("skill broken".into()),
            AgenticError::SandboxViolation("wrote outside root".into()),
            AgenticError::Other("misc".into()),
        ];

        for (i, e) in cases.iter().enumerate() {
            // Display must not panic and must produce non-empty output.
            let rendered = format!("{}", e);
            assert!(!rendered.is_empty(), "variant {} rendered empty", i);
            // Debug must not panic.
            let _ = format!("{:?}", e);
        }
    }

    #[test]
    fn test_io_conversion_via_from() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "no such file");
        let e: AgenticError = io_err.into();
        assert!(matches!(e, AgenticError::Io(_)));
        assert!(format!("{}", e).contains("no such file"));
    }

    #[test]
    fn test_serde_conversion_via_from() {
        let bad = serde_json::from_str::<serde_json::Value>("{not json");
        let io_err = bad.unwrap_err();
        let e: AgenticError = io_err.into();
        assert!(matches!(e, AgenticError::Serde(_)));
    }

    #[test]
    fn test_error_is_send_and_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<AgenticError>();
    }
}
