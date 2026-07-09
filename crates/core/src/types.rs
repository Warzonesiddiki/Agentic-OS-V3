use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt;

/// Provider types supported by the gateway
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ProviderKind {
    Openai,
    Anthropic,
    Google,
    Azure,
    OpenAICompatible { endpoint: String },
    Custom(String),
}

impl fmt::Display for ProviderKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ProviderKind::Openai => write!(f, "openai"),
            ProviderKind::Anthropic => write!(f, "anthropic"),
            ProviderKind::Google => write!(f, "google"),
            ProviderKind::Azure => write!(f, "azure"),
            ProviderKind::OpenAICompatible { endpoint } => {
                write!(f, "openai_compatible({})", endpoint)
            }
            ProviderKind::Custom(name) => write!(f, "custom({})", name),
        }
    }
}

/// Model identifier with provider context
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct ModelId {
    pub provider: ProviderKind,
    pub name: String,
}

impl std::fmt::Display for ModelId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}:{}", self.provider, self.name)
    }
}

/// A single message in a conversation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: MessageRole,
    pub content: MessageContent,
    pub name: Option<String>,
    pub tool_calls: Option<Vec<ToolCall>>,
    pub tool_call_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MessageRole {
    System,
    User,
    Assistant,
    Tool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(untagged)]
pub enum MessageContent {
    Text(String),
    MultiPart(Vec<ContentPart>),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ContentPart {
    Text { text: String },
    Image { data: String, mime_type: String },
    ToolResult { content: String, is_error: bool },
}

/// A tool call from the model
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ToolCall {
    pub id: String,
    pub function: ToolFunction,
    pub index: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ToolFunction {
    pub name: String,
    pub arguments: serde_json::Value,
}

/// Session represents an ongoing conversation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub provider: ProviderKind,
    pub model: String,
    pub messages: Vec<Message>,
    pub metadata: HashMap<String, String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

/// Configuration for a provider
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub kind: ProviderKind,
    pub api_key: String,
    pub base_url: Option<String>,
    pub default_model: String,
    pub rate_limit: Option<usize>,
    pub timeout_ms: Option<u64>,
}
