use rmcp::model::Tool;
use serde::{Deserialize, Serialize};

use crate::conversation::message::{Message, MessageContent};

/// Heuristic token estimator for plain text, messages, tool definitions, and multi-modal assets.
pub struct TokenEstimator;

impl TokenEstimator {
    /// Estimate token count for a text string using byte, character, and word heuristics.
    ///
    /// Average English/code text is ~3.8-4 characters per token. Non-ASCII (e.g. CJK or Unicode symbols)
    /// averages ~1.5 characters per token.
    pub fn estimate_tokens(text: &str) -> usize {
        if text.is_empty() {
            return 0;
        }

        let total_chars = text.chars().count();
        let ascii_chars = text.chars().filter(|c| c.is_ascii()).count();
        let non_ascii_chars = total_chars.saturating_sub(ascii_chars);

        // Standard BPE heuristic: ~4 chars/token for ASCII, ~1.5 chars/token for non-ASCII
        let ascii_tokens = (ascii_chars as f64 / 3.9).ceil() as usize;
        let non_ascii_tokens = (non_ascii_chars as f64 / 1.5).ceil() as usize;

        // Base minimum of 1 token for non-empty string
        (ascii_tokens + non_ascii_tokens).max(1)
    }

    /// Estimate token count for an RMCP tool definition.
    pub fn estimate_tool_tokens(tool: &Tool) -> usize {
        let mut total = 0;
        total += Self::estimate_tokens(&tool.name);
        if let Some(desc) = &tool.description {
            total += Self::estimate_tokens(desc);
        }

        if let Ok(schema_str) = serde_json::to_string(&tool.input_schema) {
            total += Self::estimate_tokens(&schema_str);
        }

        // Add tool framing overhead (~10 tokens per tool definition)
        total + 10
    }

    /// Estimate token count for an individual conversation message.
    pub fn estimate_message_tokens(message: &Message) -> usize {
        let mut total = 4; // Base message framing overhead (role tags, separators)

        for content in &message.content {
            match content {
                MessageContent::Text(text_content) => {
                    total += Self::estimate_tokens(&text_content.text);
                }
                MessageContent::Image(_image_content) => {
                    total += Self::estimate_image_tokens(None, None, None);
                }
                MessageContent::ToolRequest(request) => {
                    total += Self::estimate_tokens(&request.id);
                    if let Ok(call) = &request.tool_call {
                        total += Self::estimate_tokens(&call.name);
                        if let Ok(args_str) = serde_json::to_string(&call.arguments) {
                            total += Self::estimate_tokens(&args_str);
                        }
                    }
                }
                MessageContent::ToolResponse(response) => {
                    total += Self::estimate_tokens(&response.id);
                    if let Ok(results) = &response.tool_result {
                        if let Ok(res_str) = serde_json::to_string(results) {
                            total += Self::estimate_tokens(&res_str);
                        }
                    }
                }
                MessageContent::Thinking(thinking) => {
                    total += Self::estimate_tokens(&thinking.thinking);
                    total += Self::estimate_tokens(&thinking.signature);
                }
                MessageContent::RedactedThinking(redacted) => {
                    total += Self::estimate_tokens(&redacted.data);
                }
                _ => {
                    // Other message content types (ActionRequired, SystemNotification, etc.)
                    total += 5;
                }
            }
        }

        total
    }

    /// Estimate total token count for a full request (system prompt, messages, and tools).
    pub fn estimate_request_tokens(
        messages: &[Message],
        tools: &[Tool],
        system_prompt: Option<&str>,
    ) -> usize {
        let mut total = 3; // Base conversation framing overhead

        if let Some(sys) = system_prompt {
            total += Self::estimate_tokens(sys) + 4;
        }

        for msg in messages {
            total += Self::estimate_message_tokens(msg);
        }

        for tool in tools {
            total += Self::estimate_tool_tokens(tool);
        }

        total
    }

    /// Estimate vision token cost for an image based on dimensions and detail setting.
    ///
    /// Implements standard vision token estimation formulas:
    /// - Low detail: fixed 85 tokens.
    /// - High detail / auto: 85 base tokens + 170 tokens per 512x512 tile.
    pub fn estimate_image_tokens(
        width: Option<u32>,
        height: Option<u32>,
        detail: Option<&str>,
    ) -> usize {
        if detail == Some("low") {
            return 85;
        }

        match (width, height) {
            (Some(w), Some(h)) => {
                // Scale image to fit within 2048x2048 while preserving aspect ratio
                let max_dim = w.max(h) as f64;
                let scale = if max_dim > 2048.0 { 2048.0 / max_dim } else { 1.0 };
                let scaled_w = w as f64 * scale;
                let scaled_h = h as f64 * scale;

                // Scale so shortest side is 768px
                let min_dim = scaled_w.min(scaled_h);
                let scale_min = if min_dim > 768.0 { 768.0 / min_dim } else { 1.0 };
                let final_w = scaled_w * scale_min;
                let final_h = scaled_h * scale_min;

                // Count 512x512 tiles required
                let tiles_x = (final_w / 512.0).ceil() as usize;
                let tiles_y = (final_h / 512.0).ceil() as usize;
                let total_tiles = tiles_x * tiles_y;

                85 + (total_tiles * 170)
            }
            _ => {
                // Default high detail assumption: 2x2 tiles (565 tokens)
                565
            }
        }
    }
}

/// Token budget helper for tracking context window limits and output allowances.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TokenBudget {
    /// Maximum context limit of the target model
    pub max_context: usize,
    /// Reserved token count for model output completion
    pub reserved_completion: usize,
    /// Estimated prompt tokens currently consumed
    pub prompt_tokens: usize,
}

impl TokenBudget {
    /// Create a new TokenBudget
    pub fn new(max_context: usize, reserved_completion: usize) -> Self {
        Self {
            max_context,
            reserved_completion,
            prompt_tokens: 0,
        }
    }

    /// Set the current prompt token count
    pub fn with_prompt_tokens(mut self, prompt_tokens: usize) -> Self {
        self.prompt_tokens = prompt_tokens;
        self
    }

    /// Calculate remaining tokens available for input/context expansion
    pub fn available_tokens(&self) -> usize {
        self.max_context
            .saturating_sub(self.reserved_completion)
            .saturating_sub(self.prompt_tokens)
    }

    /// Check if additional tokens fit within the available budget
    pub fn has_capacity(&self, additional_tokens: usize) -> bool {
        self.prompt_tokens + additional_tokens + self.reserved_completion <= self.max_context
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rmcp::model::Role;

    #[test]
    fn test_estimate_tokens_plain_text() {
        assert_eq!(TokenEstimator::estimate_tokens(""), 0);
        let tokens = TokenEstimator::estimate_tokens("Hello, world! This is a test.");
        assert!((5..=10).contains(&tokens));
    }

    #[test]
    fn test_estimate_tokens_non_ascii() {
        let ascii_tokens = TokenEstimator::estimate_tokens("Hello world");
        let unicode_tokens = TokenEstimator::estimate_tokens("こんにちは世界");
        assert!(unicode_tokens > 0);
        assert_ne!(ascii_tokens, unicode_tokens);
    }

    #[test]
    fn test_estimate_message_tokens() {
        let msg = Message::new(Role::User, 1000, vec![MessageContent::text("Hello AI")]);
        let tokens = TokenEstimator::estimate_message_tokens(&msg);
        assert!(tokens >= 5);
    }

    #[test]
    fn test_token_budget_capacity() {
        let budget = TokenBudget::new(8192, 1000).with_prompt_tokens(4000);
        assert_eq!(budget.available_tokens(), 3192);
        assert!(budget.has_capacity(2000));
        assert!(!budget.has_capacity(4000));
    }

    #[test]
    fn test_estimate_image_tokens() {
        assert_eq!(TokenEstimator::estimate_image_tokens(None, None, Some("low")), 85);
        let high_detail = TokenEstimator::estimate_image_tokens(Some(1024), Some(1024), None);
        assert!(high_detail > 85);
    }
}
