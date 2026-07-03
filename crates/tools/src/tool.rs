use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use thiserror::Error;

/// Unique identifier for a tool instance.
pub type ToolId = uuid::Uuid;

/// Errors that can occur during tool execution.
#[derive(Debug, Error)]
pub enum ToolError {
    #[error("Tool '{name}' not found")]
    NotFound { name: String },

    #[error("Tool '{name}' execution failed: {message}")]
    ExecutionFailed { name: String, message: String },

    #[error("Invalid arguments for tool '{name}': {message}")]
    InvalidArguments { name: String, message: String },

    #[error("Tool '{name}' is not initialized")]
    NotInitialized { name: String },

    #[error(transparent)]
    Internal(#[from] Box<dyn std::error::Error + Send + Sync>),
}

/// Result of a tool execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolOutput {
    /// Whether execution succeeded.
    pub success: bool,
    /// Human-readable output text.
    pub output: String,
    /// Optional structured data payload.
    pub data: Option<serde_json::Value>,
    /// Optional error message on failure.
    pub error: Option<String>,
}

impl ToolOutput {
    pub fn ok(output: impl Into<String>) -> Self {
        Self {
            success: true,
            output: output.into(),
            data: None,
            error: None,
        }
    }

    pub fn ok_with_data(output: impl Into<String>, data: serde_json::Value) -> Self {
        Self {
            success: true,
            output: output.into(),
            data: Some(data),
            error: None,
        }
    }

    pub fn err(error: impl Into<String>) -> Self {
        let msg = error.into();
        Self {
            success: false,
            output: msg.clone(),
            data: None,
            error: Some(msg),
        }
    }
}

/// Metadata describing a tool for discovery and documentation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolMetadata {
    /// Human-readable name (e.g. "file_read").
    pub name: String,
    /// Short description of what the tool does.
    pub description: String,
    /// JSON Schema for the expected arguments.
    #[serde(default)]
    pub parameters: serde_json::Value,
    /// Category or domain tag.
    #[serde(default)]
    pub category: String,
    /// Whether the tool is built-in.
    #[serde(default)]
    pub builtin: bool,
}

/// The core trait all agentic tools must implement.
#[async_trait]
pub trait AgenticTool: Send + Sync {
    /// Return static metadata about this tool.
    fn metadata(&self) -> ToolMetadata;

    /// Execute the tool with the given arguments.
    async fn execute(&self, args: HashMap<String, serde_json::Value>) -> Result<ToolOutput, ToolError>;
}
