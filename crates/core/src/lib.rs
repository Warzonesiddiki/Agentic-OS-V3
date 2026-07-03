// crates/core/src/lib.rs

#![deny(unsafe_code)]

pub mod error;
pub mod types;

pub use error::AgenticError;
pub use types::*;
