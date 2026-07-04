use std::fmt;

use serde::{Deserialize, Serialize};
use thiserror::Error;
use tracing::debug;

use crate::tool::ToolMetadata;

/// Errors that can occur during lifecycle operations.
#[derive(Debug, Error)]
pub enum LifecycleError {
    #[error("Initialization failed: {0}")]
    InitFailed(String),
    #[error("Validation failed: {0}")]
    ValidationFailed(String),
    #[error("Shutdown failed: {0}")]
    ShutdownFailed(String),
}

/// The current status of a tool within its lifecycle.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ToolStatus {
    /// Tool is registered but not yet initialized.
    Registered,
    /// Tool is initializing.
    Initializing,
    /// Tool is ready for execution.
    Ready,
    /// Tool encountered an error during init.
    Failed,
    /// Tool is running a shutdown sequence.
    Stopping,
    /// Tool has been stopped.
    Stopped,
}

impl fmt::Display for ToolStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ToolStatus::Registered => write!(f, "registered"),
            ToolStatus::Initializing => write!(f, "initializing"),
            ToolStatus::Ready => write!(f, "ready"),
            ToolStatus::Failed => write!(f, "failed"),
            ToolStatus::Stopping => write!(f, "stopping"),
            ToolStatus::Stopped => write!(f, "stopped"),
        }
    }
}

/// Lifecycle hooks for a tool.
///
/// Implement this trait to add init, validate, and shutdown
/// behaviour to a tool. These hooks are called by `ToolRegistry`
/// at appropriate points.
pub trait ToolLifecycle: Send + Sync {
    /// Called when the tool is first registered.
    /// Return `Ok(())` to mark the tool as ready, or `Err` to abort registration.
    fn init(&self, _metadata: &ToolMetadata) -> Result<(), LifecycleError> {
        debug!("Lifecycle init (default no-op)");
        Ok(())
    }

    /// Validate that the tool is in a healthy state.
    /// Called before execution if the lifecycle is tracked.
    fn validate(&self, _metadata: &ToolMetadata) -> Result<(), LifecycleError> {
        debug!("Lifecycle validate (default no-op)");
        Ok(())
    }

    /// Called when the tool is being unregistered.
    /// Use this to clean up resources (close file handles, kill subprocesses, etc.).
    fn shutdown(&self, _metadata: &ToolMetadata) -> Result<(), LifecycleError> {
        debug!("Lifecycle shutdown (default no-op)");
        Ok(())
    }
}

/// A no-op lifecycle implementation. Use this when a tool has no special lifecycle needs.
pub struct NoopLifecycle;

impl ToolLifecycle for NoopLifecycle {}

/// Handle for inspecting the lifecycle state of a registered tool.
#[derive(Debug, Clone)]
pub struct ToolLifecycleHandle {
    /// The tool's name.
    pub name: String,
    /// Current lifecycle status.
    pub status: ToolStatus,
    /// Optional error message if the lifecycle failed.
    pub error: Option<String>,
}

impl ToolLifecycleHandle {
    pub fn new(name: &str) -> Self {
        Self {
            name: name.into(),
            status: ToolStatus::Registered,
            error: None,
        }
    }
}

/// Composite lifecycle that runs multiple lifecycle hooks in sequence.
///
/// All hooks must succeed for the composite to succeed. On failure,
/// already-run hooks are NOT rolled back.
pub struct CompositeLifecycle {
    hooks: Vec<Box<dyn ToolLifecycle>>,
}

impl CompositeLifecycle {
    pub fn new(hooks: Vec<Box<dyn ToolLifecycle>>) -> Self {
        Self { hooks }
    }
}

impl ToolLifecycle for CompositeLifecycle {
    fn init(&self, metadata: &ToolMetadata) -> Result<(), LifecycleError> {
        for hook in &self.hooks {
            hook.init(metadata)?;
        }
        Ok(())
    }

    fn validate(&self, metadata: &ToolMetadata) -> Result<(), LifecycleError> {
        for hook in &self.hooks {
            hook.validate(metadata)?;
        }
        Ok(())
    }

    fn shutdown(&self, metadata: &ToolMetadata) -> Result<(), LifecycleError> {
        for hook in &self.hooks {
            hook.shutdown(metadata)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tool::ToolMetadata;

    struct FailingLifecycle;

    impl ToolLifecycle for FailingLifecycle {
        fn init(&self, _metadata: &ToolMetadata) -> Result<(), LifecycleError> {
            Err(LifecycleError::InitFailed("intentional fail".into()))
        }
    }

    #[test]
    fn test_status_display() {
        assert_eq!(ToolStatus::Registered.to_string(), "registered");
        assert_eq!(ToolStatus::Ready.to_string(), "ready");
        assert_eq!(ToolStatus::Failed.to_string(), "failed");
        assert_eq!(ToolStatus::Stopped.to_string(), "stopped");
    }

    #[test]
    fn test_noop_lifecycle() {
        let lc = NoopLifecycle;
        let meta = ToolMetadata {
            name: "test".into(),
            description: "".into(),
            parameters: serde_json::json!({}),
            category: "".into(),
            builtin: false,
        };
        assert!(lc.init(&meta).is_ok());
        assert!(lc.validate(&meta).is_ok());
        assert!(lc.shutdown(&meta).is_ok());
    }

    #[test]
    fn test_failing_lifecycle() {
        let lc = FailingLifecycle;
        let meta = ToolMetadata {
            name: "test".into(),
            description: "".into(),
            parameters: serde_json::json!({}),
            category: "".into(),
            builtin: false,
        };
        assert!(lc.init(&meta).is_err());
    }
}
