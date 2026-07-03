use std::collections::HashMap;

use async_trait::async_trait;
use tracing::{info, warn};

use crate::tool::{AgenticTool, ToolError, ToolMetadata, ToolOutput};

/// Built-in tool that executes shell commands.
pub struct ShellTool;

#[async_trait]
impl AgenticTool for ShellTool {
    fn metadata(&self) -> ToolMetadata {
        ToolMetadata {
            name: "shell".into(),
            description: "Execute a shell command and return its output".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "The shell command to execute"
                    },
                    "timeout": {
                        "type": "integer",
                        "description": "Timeout in seconds (default: 30)",
                        "default": 30
                    }
                },
                "required": ["command"]
            }),
            category: "system".into(),
            builtin: true,
        }
    }

    async fn execute(&self, args: HashMap<String, serde_json::Value>) -> Result<ToolOutput, ToolError> {
        let command = args
            .get("command")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidArguments {
                name: "shell".into(),
                message: "Missing required argument: 'command'".into(),
            })?;

        info!(cmd = %command, "Shell tool executing");
        // Stub — replace with actual process execution
        warn!("Shell tool is a stub — no real execution");
        Ok(ToolOutput::ok(format!("[stub] would run: {command}")))
    }
}

/// Built-in tool that reads a file from disk.
pub struct FileReadTool;

#[async_trait]
impl AgenticTool for FileReadTool {
    fn metadata(&self) -> ToolMetadata {
        ToolMetadata {
            name: "file_read".into(),
            description: "Read the contents of a file from the filesystem".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Absolute path to the file"
                    }
                },
                "required": ["path"]
            }),
            category: "filesystem".into(),
            builtin: true,
        }
    }

    async fn execute(&self, args: HashMap<String, serde_json::Value>) -> Result<ToolOutput, ToolError> {
        let path = args
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidArguments {
                name: "file_read".into(),
                message: "Missing required argument: 'path'".into(),
            })?;

        info!(path = %path, "FileRead tool executing");
        warn!("FileRead tool is a stub — no real I/O");
        Ok(ToolOutput::ok(format!("[stub] would read: {path}")))
    }
}

/// Built-in tool that writes content to a file.
pub struct FileWriteTool;

#[async_trait]
impl AgenticTool for FileWriteTool {
    fn metadata(&self) -> ToolMetadata {
        ToolMetadata {
            name: "file_write".into(),
            description: "Write content to a file on the filesystem".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Absolute path to the file"
                    },
                    "content": {
                        "type": "string",
                        "description": "Content to write"
                    },
                    "append": {
                        "type": "boolean",
                        "description": "If true, append instead of overwrite",
                        "default": false
                    }
                },
                "required": ["path", "content"]
            }),
            category: "filesystem".into(),
            builtin: true,
        }
    }

    async fn execute(&self, args: HashMap<String, serde_json::Value>) -> Result<ToolOutput, ToolError> {
        let path = args
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidArguments {
                name: "file_write".into(),
                message: "Missing required argument: 'path'".into(),
            })?;
        let content = args
            .get("content")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidArguments {
                name: "file_write".into(),
                message: "Missing required argument: 'content'".into(),
            })?;

        info!(path = %path, len = content.len(), "FileWrite tool executing");
        warn!("FileWrite tool is a stub — no real I/O");
        Ok(ToolOutput::ok(format!(
            "[stub] would write {} bytes to: {path}",
            content.len()
        )))
    }
}

/// Built-in tool that performs a web search.
pub struct WebSearchTool;

#[async_trait]
impl AgenticTool for WebSearchTool {
    fn metadata(&self) -> ToolMetadata {
        ToolMetadata {
            name: "web_search".into(),
            description: "Search the web for information using a query string".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query"
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Maximum number of results (default: 5)",
                        "default": 5
                    }
                },
                "required": ["query"]
            }),
            category: "web".into(),
            builtin: true,
        }
    }

    async fn execute(&self, args: HashMap<String, serde_json::Value>) -> Result<ToolOutput, ToolError> {
        let query = args
            .get("query")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidArguments {
                name: "web_search".into(),
                message: "Missing required argument: 'query'".into(),
            })?;

        info!(query = %query, "WebSearch tool executing");
        warn!("WebSearch tool is a stub — no real search");
        Ok(ToolOutput::ok(format!("[stub] would search: {query}")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[tokio::test]
    async fn test_shell_tool() {
        let tool = ShellTool;
        assert_eq!(tool.metadata().name, "shell");
        assert!(tool.metadata().builtin);

        let mut args = HashMap::new();
        args.insert("command".into(), serde_json::Value::String("echo hello".into()));
        let result = tool.execute(args).await.unwrap();
        assert!(result.success);
        assert!(result.output.contains("stub"));
    }

    #[tokio::test]
    async fn test_file_read_missing_arg() {
        let tool = FileReadTool;
        let result = tool.execute(HashMap::new()).await;
        assert!(matches!(result, Err(ToolError::InvalidArguments { .. })));
    }

    #[tokio::test]
    async fn test_file_write_tool() {
        let tool = FileWriteTool;
        let mut args = HashMap::new();
        args.insert("path".into(), serde_json::Value::String("/tmp/test".into()));
        args.insert("content".into(), serde_json::Value::String("data".into()));
        let result = tool.execute(args).await.unwrap();
        assert!(result.success);
    }

    #[tokio::test]
    async fn test_web_search_tool() {
        let tool = WebSearchTool;
        let mut args = HashMap::new();
        args.insert("query".into(), serde_json::Value::String("rust programming".into()));
        let result = tool.execute(args).await.unwrap();
        assert!(result.success);
    }
}
