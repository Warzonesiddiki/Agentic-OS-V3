use std::fs;
use std::process::Command;
use std::path::PathBuf;
use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Clean up the port file on application exit.
fn cleanup_port_file() {
    let port_file = std::env::temp_dir().join("nexus-port.txt");
    if port_file.exists() {
        let _ = fs::remove_file(&port_file);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let port: u16 = 9900; // default fallback

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .setup(move |app| {
            // Resolve backend directory relative to the executable location (works in dev and bundle)
            let exe_path = std::env::current_exe().expect("cannot get exe path");
            let exe_dir = exe_path.parent().expect("exe has no parent");
            // exe is target/debug/nexus-tauri.exe → go up two levels to project root
            let project_root = exe_dir.parent().expect("no parent").parent().expect("no parent");
            let backend_dir = project_root.join("src-tauri").join("resources").join("backend");
            let node_exe = backend_dir.join("node.exe");
            let server_entry = backend_dir.join("dist").join("src").join("index.js");

            // 2) Launch the Node.js backend as a sidecar with PORT=0 for dynamic allocation
            let _child = Command::new(&node_exe)
                .arg(&server_entry)
                .current_dir(&backend_dir)
                .env("PORT", "0")
                .env("NODE_ENV", "production")
                .spawn()
                .expect("Failed to start Nexus backend");

            // 3) Read the dynamic port written by the backend.
            //    Windows: %TEMP%/nexus-port.txt   Unix: /tmp/nexus-port.txt
            let port_file = std::env::temp_dir().join("nexus-port.txt");

            // Wait for the backend to write the port file (up to 10s)
            let resolved_port = {
                let mut p: u16 = port;
                for _ in 0..40 {
                    if port_file.exists() {
                        if let Ok(contents) = fs::read_to_string(&port_file) {
                            if let Ok(parsed) = contents.trim().parse::<u16>() {
                                p = parsed;
                                break;
                            }
                        }
                    }
                    std::thread::sleep(std::time::Duration::from_millis(250));
                }
                p
            };

            // 4) Inject the port into the frontend's JS context
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.eval(&format!("window.NEXUS_API_PORT = {};", resolved_port));
            }

            Ok(())
        })
        .on_window_event(|event| {
            // Clean up port file when the main window closes
            if let tauri::WindowEvent::Destroyed = event.event() {
                cleanup_port_file();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
