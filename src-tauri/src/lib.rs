#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // P1.1 不注册 plugin 或 command，前端没有通用系统能力入口。
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
