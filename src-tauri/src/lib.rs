mod adif;

use adif::{parse_adif, serialize_adif, to_csv, AdifDocument, ParseOutcome};
use std::fs;

#[tauri::command]
fn load_adif_file(path: String) -> Result<ParseOutcome, String> {
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file {}: {}", path, e))?;
    Ok(parse_adif(&content))
}

#[tauri::command]
fn save_adif_file(path: String, doc: AdifDocument) -> Result<(), String> {
    let content = serialize_adif(&doc);
    fs::write(&path, content)
        .map_err(|e| format!("Failed to write file {}: {}", path, e))
}

#[tauri::command]
fn export_csv_file(path: String, doc: AdifDocument) -> Result<(), String> {
    fs::write(&path, to_csv(&doc)).map_err(|e| format!("Failed to export CSV: {}", e))
}

#[tauri::command]
fn render_adif(doc: AdifDocument) -> String {
    serialize_adif(&doc)
}

#[tauri::command]
fn render_csv(doc: AdifDocument) -> String {
    to_csv(&doc)
}

#[tauri::command]
fn parse_adif_text(text: String) -> ParseOutcome {
    parse_adif(&text)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            load_adif_file,
            save_adif_file,
            export_csv_file,
            render_adif,
            render_csv,
            parse_adif_text
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
