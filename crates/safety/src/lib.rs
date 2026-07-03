// crates/safety/src/lib.rs — Content safety pipeline

#![deny(unsafe_code)]

mod pii;
mod injection;
mod jailbreak;
mod profanity;
mod safety_checker;

pub use safety_checker::SafetyManager;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SafetyResult {
    pub pii_detected: Vec<String>,
    pub injection: Option<String>,
    pub jailbreak: Option<String>,
    pub blocked: bool,
    pub reason: Option<String>,
}