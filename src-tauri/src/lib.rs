use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use btop_gui_core::Collector;
use tauri::Emitter;

const MIN_INTERVAL_MS: u64 = 250;
const MAX_INTERVAL_MS: u64 = 60_000;

static INTERVAL_MS: AtomicU64 = AtomicU64::new(1000);

#[tauri::command]
async fn kill_process(pid: u32, force: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || btop_gui_core::kill(pid, force))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
fn set_interval(ms: u64) -> Result<u64, String> {
    if !(MIN_INTERVAL_MS..=MAX_INTERVAL_MS).contains(&ms) {
        return Err(format!("interval must be between {MIN_INTERVAL_MS} and {MAX_INTERVAL_MS} ms"));
    }
    INTERVAL_MS.store(ms, Ordering::Relaxed);
    Ok(ms)
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![kill_process, set_interval])
        .setup(|app| {
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut collector = Collector::new();
                loop {
                    std::thread::sleep(Duration::from_millis(INTERVAL_MS.load(Ordering::Relaxed)));
                    if handle.emit("snapshot", collector.sample()).is_err() {
                        break;
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running btop-gui");
}
