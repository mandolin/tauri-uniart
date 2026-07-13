#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 文件插件只配合 capability 中的最小权限与原生对话框动态范围使用。
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
