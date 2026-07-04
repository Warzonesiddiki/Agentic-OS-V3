use anyhow::Result;
use async_stream::try_stream;
use futures::{Stream, StreamExt};
use serde::{Deserialize, Serialize};
use std::pin::Pin;

use crate::errors::ProviderError;

/// A parsed Server-Sent Event (SSE)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SseEvent {
    /// Optional event type name (from `event: <name>`)
    pub event: Option<String>,
    /// Accumulated data payload (from one or more `data: <payload>` lines)
    pub data: String,
    /// Optional event ID (from `id: <id>`)
    pub id: Option<String>,
    /// Optional retry interval in milliseconds (from `retry: <ms>`)
    pub retry: Option<u64>,
}

impl SseEvent {
    /// Create a new SseEvent with given data
    pub fn new(data: impl Into<String>) -> Self {
        Self {
            event: None,
            data: data.into(),
            id: None,
            retry: None,
        }
    }

    /// Create an SseEvent with an explicit event type and data
    pub fn with_event(event: impl Into<String>, data: impl Into<String>) -> Self {
        Self {
            event: Some(event.into()),
            data: data.into(),
            id: None,
            retry: None,
        }
    }

    /// Check if this event signals the end of the stream (e.g. `[DONE]`)
    pub fn is_done(&self) -> bool {
        let trimmed = self.data.trim();
        trimmed == "[DONE]" || trimmed == "DONE"
    }

    /// Attempt to parse `data` as JSON
    pub fn parse_json<T: serde::de::DeserializeOwned>(&self) -> Result<T, serde_json::Error> {
        serde_json::from_str(&self.data)
    }
}

/// Stateful decoder for Server-Sent Events (SSE) streams
#[derive(Debug, Default)]
pub struct SseDecoder {
    current_event: Option<String>,
    current_data: String,
    current_id: Option<String>,
    current_retry: Option<u64>,
    line_buffer: String,
}

impl SseDecoder {
    /// Create a new SseDecoder instance
    pub fn new() -> Self {
        Self::default()
    }

    /// Reset internal state
    pub fn reset(&mut self) {
        self.current_event = None;
        self.current_data.clear();
        self.current_id = None;
        self.current_retry = None;
    }

    /// Process a single line of SSE input. Returns `Some(SseEvent)` if a complete
    /// event is finalized (on an empty line).
    pub fn push_line(&mut self, line: &str) -> Option<SseEvent> {
        let line = line.trim_end_matches('\r');

        // Empty line signals dispatch of the current event
        if line.is_empty() {
            if !self.current_data.is_empty() || self.current_event.is_some() {
                let event = SseEvent {
                    event: self.current_event.take(),
                    data: std::mem::take(&mut self.current_data),
                    id: self.current_id.take(),
                    retry: self.current_retry.take(),
                };
                return Some(event);
            }
            return None;
        }

        // Comment lines start with `:`
        if line.starts_with(':') {
            return None;
        }

        // Field parsing: `field: value` or `field`
        let (field, value) = match line.split_once(':') {
            Some((f, v)) => (f, v.strip_prefix(' ').unwrap_or(v)),
            None => (line, ""),
        };

        match field {
            "event" => {
                self.current_event = Some(value.to_string());
            }
            "data" => {
                if !self.current_data.is_empty() {
                    self.current_data.push('\n');
                }
                self.current_data.push_str(value);
            }
            "id" => {
                self.current_id = Some(value.to_string());
            }
            "retry" => {
                if let Ok(ms) = value.trim().parse::<u64>() {
                    self.current_retry = Some(ms);
                }
            }
            _ => {
                // Unknown SSE field, ignored per spec
            }
        }

        None
    }

    /// Process a raw chunk of text, buffering partial lines and returning all completed SSE events
    pub fn decode_chunk(&mut self, chunk: &str) -> Vec<SseEvent> {
        let mut events = Vec::new();
        self.line_buffer.push_str(chunk);

        while let Some(pos) = self.line_buffer.find('\n') {
            let line = self.line_buffer[..pos].to_string();
            self.line_buffer.drain(..=pos);
            if let Some(event) = self.push_line(&line) {
                events.push(event);
            }
        }

        events
    }

    /// Flush any remaining buffered lines when stream ends
    pub fn finish(&mut self) -> Option<SseEvent> {
        if !self.line_buffer.is_empty() {
            let line = std::mem::take(&mut self.line_buffer);
            if let Some(event) = self.push_line(&line) {
                return Some(event);
            }
        }

        if !self.current_data.is_empty() || self.current_event.is_some() {
            let event = SseEvent {
                event: self.current_event.take(),
                data: std::mem::take(&mut self.current_data),
                id: self.current_id.take(),
                retry: self.current_retry.take(),
            };
            return Some(event);
        }

        None
    }
}

/// Incremental token delta parsed from SSE stream chunks
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TokenDelta {
    /// Partial text content yielded by model
    pub content: Option<String>,
    /// Optional role associated with chunk
    pub role: Option<String>,
    /// Finish reason if stream completed (e.g. "stop", "tool_calls")
    pub finish_reason: Option<String>,
    /// Tool call id if delta is part of a tool call
    pub tool_call_id: Option<String>,
    /// Tool call name if delta contains tool name
    pub tool_name: Option<String>,
    /// Tool call arguments fragment
    pub tool_arguments: Option<String>,
}

impl TokenDelta {
    pub fn text(text: impl Into<String>) -> Self {
        Self {
            content: Some(text.into()),
            role: None,
            finish_reason: None,
            tool_call_id: None,
            tool_name: None,
            tool_arguments: None,
        }
    }
}

/// Convert an SSE line stream into an SseEvent stream
pub fn parse_sse_stream<S, E>(
    stream: S,
) -> Pin<Box<dyn Stream<Item = Result<SseEvent, ProviderError>> + Send>>
where
    S: Stream<Item = Result<String, E>> + Send + 'static,
    E: std::error::Error + Send + Sync + 'static,
{
    Box::pin(try_stream! {
        let mut decoder = SseDecoder::new();
        tokio::pin!(stream);

        while let Some(line_res) = stream.next().await {
            let line = line_res.map_err(|e| ProviderError::stream_decode_error(e.to_string()))?;
            if let Some(event) = decoder.push_line(&line) {
                if event.is_done() {
                    break;
                }
                yield event;
            }
        }

        if let Some(event) = decoder.finish() {
            if !event.is_done() {
                yield event;
            }
        }
    })
}

/// Parse OpenAI SSE data JSON into TokenDelta
pub fn parse_openai_sse_event(event: &SseEvent) -> Option<TokenDelta> {
    if event.is_done() {
        return Some(TokenDelta {
            content: None,
            role: None,
            finish_reason: Some("stop".to_string()),
            tool_call_id: None,
            tool_name: None,
            tool_arguments: None,
        });
    }

    let val: serde_json::Value = event.parse_json().ok()?;
    let choice = val.get("choices")?.get(0)?;
    let delta = choice.get("delta")?;

    let content = delta.get("content").and_then(|v| v.as_str()).map(String::from);
    let role = delta.get("role").and_then(|v| v.as_str()).map(String::from);
    let finish_reason = choice.get("finish_reason").and_then(|v| v.as_str()).map(String::from);

    let (tool_call_id, tool_name, tool_arguments) = if let Some(tool_calls) = delta.get("tool_calls").and_then(|v| v.as_array()) {
        if let Some(tc) = tool_calls.get(0) {
            let id = tc.get("id").and_then(|v| v.as_str()).map(String::from);
            let function = tc.get("function");
            let name = function.and_then(|f| f.get("name")).and_then(|v| v.as_str()).map(String::from);
            let args = function.and_then(|f| f.get("arguments")).and_then(|v| v.as_str()).map(String::from);
            (id, name, args)
        } else {
            (None, None, None)
        }
    } else {
        (None, None, None)
    };

    if content.is_some() || role.is_some() || finish_reason.is_some() || tool_call_id.is_some() || tool_name.is_some() || tool_arguments.is_some() {
        Some(TokenDelta {
            content,
            role,
            finish_reason,
            tool_call_id,
            tool_name,
            tool_arguments,
        })
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sse_decoder_basic() {
        let mut decoder = SseDecoder::new();

        assert_eq!(decoder.push_line("event: update"), None);
        assert_eq!(decoder.push_line("data: hello world"), None);
        let event = decoder.push_line("").unwrap();

        assert_eq!(event.event, Some("update".to_string()));
        assert_eq!(event.data, "hello world");
        assert!(!event.is_done());
    }

    #[test]
    fn test_sse_decoder_multiline_data() {
        let mut decoder = SseDecoder::new();

        decoder.push_line("data: line 1");
        decoder.push_line("data: line 2");
        let event = decoder.push_line("").unwrap();

        assert_eq!(event.data, "line 1\nline 2");
    }

    #[test]
    fn test_sse_decoder_comments_and_done() {
        let mut decoder = SseDecoder::new();

        assert_eq!(decoder.push_line(": keepalive comment"), None);
        decoder.push_line("data: [DONE]");
        let event = decoder.push_line("").unwrap();

        assert!(event.is_done());
    }

    #[test]
    fn test_sse_decode_chunk() {
        let mut decoder = SseDecoder::new();
        let chunk = "event: ping\ndata: pong\n\nevent: done\ndata: [DONE]\n\n";

        let events = decoder.decode_chunk(chunk);
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].data, "pong");
        assert!(events[1].is_done());
    }

    #[test]
    fn test_parse_openai_sse_event() {
        let json_str = r#"{"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}"#;
        let event = SseEvent::new(json_str);
        let delta = parse_openai_sse_event(&event).unwrap();
        assert_eq!(delta.content, Some("Hello".to_string()));
    }
}
