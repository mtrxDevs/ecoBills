// Phase 7 desktop shell entry point. The tray icon, low-stock polling and
// auto-update wiring live in tauri.conf.json + apps/desktop/src/native.ts.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .run(tauri::generate_context!())
    .expect("error while running ecoBills");
}
