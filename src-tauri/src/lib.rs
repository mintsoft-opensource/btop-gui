use std::time::Duration;

use btop_gui_core::Collector;
use tauri::Emitter;

const SAMPLE_INTERVAL: Duration = Duration::from_secs(1);

#[tauri::command]
async fn kill_process(pid: u32, force: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || btop_gui_core::kill(pid, force))
        .await
        .map_err(|error| error.to_string())?
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![kill_process])
        .setup(|app| {
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut collector = Collector::new();
                loop {
                    std::thread::sleep(SAMPLE_INTERVAL);
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
