//! # Tools
//!
//! Tool registry and lifecycle management for agentic tools.
//!
//! ## Architecture
//!
//! - [`tool::AgenticTool`] — the core trait all tools implement
//! - [`registry::ToolRegistry`] — thread-safe registry with O(1) lookup
//! - [`lifecycle::ToolLifecycle`] — init/validate/shutdown hooks
//! - [`builtin`] — stub built-in tools (shell, file_read, file_write, web_search)

pub mod builtin;
pub mod lifecycle;
pub mod registry;
pub mod tool;

pub use tool::{AgenticTool, ToolError, ToolOutput, ToolMetadata, ToolId};
pub use registry::ToolRegistry;
pub use lifecycle::{ToolLifecycle, ToolLifecycleHandle, ToolStatus, LifecycleError, NoopLifecycle, CompositeLifecycle};
