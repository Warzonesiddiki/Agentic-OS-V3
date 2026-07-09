use std::path::PathBuf;
use std::sync::Mutex;

/// Shared, thread-safe application state for the Nexus desktop shell.
///
/// Holds runtime values resolved during the Tauri `setup` hook so that
/// front-end command invocations can read them without re-computing paths
/// or re-reading the port file on every call.
pub struct AppState {
    /// Resolved listening port of the bundled Nexus backend (set after setup).
    pub backend_port: Mutex<Option<u16>>,
    /// Directory that contains the bundled backend resources.
    pub backend_dir: Mutex<Option<PathBuf>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            backend_port: Mutex::new(None),
            backend_dir: Mutex::new(None),
        }
    }
}

impl AppState {
    /// Persist the resolved backend port.
    pub fn set_backend_port(&self, port: u16) {
        if let Ok(mut guard) = self.backend_port.lock() {
            *guard = Some(port);
        }
    }

    /// Persist the resolved backend directory.
    pub fn set_backend_dir(&self, dir: PathBuf) {
        if let Ok(mut guard) = self.backend_dir.lock() {
            *guard = Some(dir);
        }
    }
}
