mod adif;

use adif::{parse_adif, serialize_adif, AdifDocument};
use std::fs;

#[tauri::command]
fn load_adif_file(path: String) -> Result<AdifDocument, String> {
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
    let mut csv = String::new();
    csv.push_str(&doc.columns.join(","));
    csv.push('\n');

    for rec in &doc.records {
        let row: Vec<String> = doc
            .columns
            .iter()
            .map(|col| {
                let val = rec.get(col).cloned().unwrap_or_default();
                if val.contains(',') || val.contains('"') || val.contains('\n') {
                    format!("\"{}\"", val.replace('"', "\"\""))
                } else {
                    val
                }
            })
            .collect();
        csv.push_str(&row.join(","));
        csv.push('\n');
    }

    fs::write(&path, csv).map_err(|e| format!("Failed to export CSV: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            load_adif_file,
            save_adif_file,
            export_csv_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
