// crates/installer/src/lib.rs

#![deny(unsafe_code)]

pub mod download;
pub mod extract;
pub mod verify;
pub mod completions;
pub mod installer;
pub mod self_update;

pub use installer::Installer;
pub use self_update::SelfUpdater;

#[derive(Debug, thiserror::Error)]
pub enum InstallerError {
    #[error("Download failed: {0}")]
    Download(#[from] reqwest::Error),

    #[error("Checksum mismatch")]
    ChecksumMismatch {
        expected: String,
        actual: String,
    },

    #[error("Extraction failed")]
    Extraction,

    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Serde(#[from] serde_json::Error),
}