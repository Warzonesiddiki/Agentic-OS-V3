use std::sync::Arc;

use dashmap::DashMap;
use tracing::{debug, error, info, warn};

use crate::tool::{AgenticTool, ToolError, ToolMetadata, ToolOutput};
use crate::lifecycle::{ToolLifecycle, ToolLifecycleHandle, ToolStatus};

/// Thread-safe registry of agentic tools.
///
/// Tools are identified by their name (from `ToolMetadata`).
/// Registration, lookup, and removal are all O(1) on average.
pub struct ToolRegistry {
    tools: DashMap<String, Arc<dyn AgenticTool>>,
    lifecycles: DashMap<String, ToolLifecycleHandle>,
}

impl ToolRegistry {
    /// Create a new empty registry.
    pub fn new() -> Self {
        Self {
            tools: DashMap::new(),
            lifecycles: DashMap::new(),
        }
    }

    /// Register a tool with optional lifecycle hooks.
    ///
    /// Returns an error if a tool with the same name is already registered.
    pub fn register<L: ToolLifecycle + 'static>(
        &self,
        tool: Arc<dyn AgenticTool>,
        lifecycle: Option<L>,
    ) -> Result<(), ToolError> {
        let meta = tool.metadata();
        let name = meta.name.clone();

        if self.tools.contains_key(&name) {
            return Err(ToolError::ExecutionFailed {
                name,
                message: "A tool with this name is already registered".into(),
            });
        }

        // Run init hook if lifecycle provided
        if let Some(lc) = lifecycle {
            let mut handle = ToolLifecycleHandle::new(&name);
            if let Err(e) = lc.init(&meta) {
                handle.status = ToolStatus::Failed;
                handle.error = Some(e.to_string());
                self.lifecycles.insert(name.clone(), handle);
                return Err(ToolError::ExecutionFailed {
                    name,
                    message: format!("Lifecycle init failed: {e}"),
                });
            }
            handle.status = ToolStatus::Ready;
            self.lifecycles.insert(name.clone(), handle);
        }

        self.tools.insert(name.clone(), tool);
        info!(tool = %name, "Tool registered");
        debug!(metadata = ?meta, "Tool metadata");
        Ok(())
    }

    /// Unregister a tool by name, running its shutdown hook if available.
    pub fn unregister(&self, name: &str) -> Result<(), ToolError> {
        self.tools.remove(name);

        if let Some((_, mut handle)) = self.lifecycles.remove(name) {
            handle.status = ToolStatus::Stopped;
            debug!(tool = %name, "Tool lifecycle stopped");
        }

        info!(tool = %name, "Tool unregistered");
        Ok(())
    }

    /// Retrieve a reference to a registered tool.
    pub fn get(&self, name: &str) -> Option<Arc<dyn AgenticTool>> {
        self.tools.get(name).map(|r| r.clone())
    }

    /// Execute a tool by name with the given arguments.
    pub async fn execute(
        &self,
        name: &str,
        args: std::collections::HashMap<String, serde_json::Value>,
    ) -> Result<ToolOutput, ToolError> {
        let tool = self
            .get(name)
            .ok_or_else(|| ToolError::NotFound { name: name.into() })?;

        // Check lifecycle status
        if let Some(handle) = self.lifecycles.get(name) {
            if handle.status != ToolStatus::Ready {
                return Err(ToolError::NotInitialized { name: name.into() });
            }
        }

        debug!(tool = %name, "Executing tool");
        let result = tool.execute(args).await;

        match &result {
            Ok(out) => {
                if out.success {
                    info!(tool = %name, "Tool succeeded");
                } else {
                    warn!(tool = %name, error = ?out.error, "Tool returned failure");
                }
            }
            Err(e) => {
                error!(tool = %name, error = %e, "Tool execution error");
            }
        }

        result
    }

    /// List all registered tools with their metadata.
    pub fn list(&self) -> Vec<ToolMetadata> {
        self.tools
            .iter()
            .map(|r| r.metadata())
            .collect()
    }

    /// Check if a tool is registered.
    pub fn has(&self, name: &str) -> bool {
        self.tools.contains_key(name)
    }

    /// Return the number of registered tools.
    pub fn len(&self) -> usize {
        self.tools.len()
    }

    /// Returns true if no tools are registered.
    pub fn is_empty(&self) -> bool {
        self.tools.is_empty()
    }

    /// Get the lifecycle status for a tool, if tracked.
    pub fn tool_status(&self, name: &str) -> Option<ToolStatus> {
        self.lifecycles.get(name).map(|h| h.status)
    }
}

impl Default for ToolRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use crate::tool::{AgenticTool, ToolMetadata, ToolOutput};
    use async_trait::async_trait;

    struct EchoTool;

    #[async_trait]
    impl AgenticTool for EchoTool {
        fn metadata(&self) -> ToolMetadata {
            ToolMetadata {
                name: "echo".into(),
                description: "Echo back the input".into(),
                parameters: serde_json::json!({}),
                category: "test".into(),
                builtin: false,
            }
        }

        async fn execute(&self, _args: HashMap<String, serde_json::Value>) -> Result<ToolOutput, ToolError> {
            Ok(ToolOutput::ok("echo"))
        }
    }

    #[tokio::test]
    async fn test_register_and_get() {
        let registry = ToolRegistry::new();
        let tool = Arc::new(EchoTool);
        registry.register::<crate::lifecycle::NoopLifecycle>(tool.clone(), None).unwrap();
        assert!(registry.has("echo"));
        assert_eq!(registry.len(), 1);
    }

    #[tokio::test]
    async fn test_duplicate_registration() {
        let registry = ToolRegistry::new();
        let tool = Arc::new(EchoTool);
        registry.register::<crate::lifecycle::NoopLifecycle>(tool.clone(), None).unwrap();
        let result = registry.register::<crate::lifecycle::NoopLifecycle>(tool.clone(), None);
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_unregister() {
        let registry = ToolRegistry::new();
        let tool = Arc::new(EchoTool);
        registry.register::<crate::lifecycle::NoopLifecycle>(tool, None).unwrap();
        registry.unregister("echo").unwrap();
        assert!(!registry.has("echo"));
        assert!(registry.is_empty());
    }

    #[tokio::test]
    async fn test_execute_not_found() {
        let registry = ToolRegistry::new();
        let result = registry.execute("nonexistent", HashMap::new()).await;
        assert!(matches!(result, Err(ToolError::NotFound { .. })));
    }
}
