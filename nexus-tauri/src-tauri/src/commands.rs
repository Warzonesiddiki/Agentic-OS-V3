use crate::state::AppState;

/// Returns a friendly greeting produced by the Rust core.
#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {name}! You've been greeted from Rust!")
}

/// Returns the resolved backend port.
///
/// Errors if the backend has not completed startup yet.
#[tauri::command]
pub fn get_backend_port(state: tauri::State<'_, AppState>) -> Result<u16, String> {
    state
        .backend_port
        .lock()
        .map_err(|_| "backend port state is poisoned".to_string())?
        .ok_or_else(|| "backend port not resolved yet".to_string())
}

/// Returns the on-disk path of the bundled backend resources.
#[tauri::command]
pub fn get_backend_dir(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let guard = state
        .backend_dir
        .lock()
        .map_err(|_| "backend dir state is poisoned".to_string())?;
    guard
        .as_ref()
        .map(|p| p.to_string_lossy().into_owned())
        .ok_or_else(|| "backend dir not resolved yet".to_string())
}

/// Returns whether the bundled backend has reported a listening port.
#[tauri::command]
pub fn is_backend_ready(state: tauri::State<'_, AppState>) -> bool {
    state
        .backend_port
        .lock()
        .map(|guard| guard.is_some())
        .unwrap_or(false)
}
