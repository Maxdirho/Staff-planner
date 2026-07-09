use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const DATABASE_FILE_NAME: &str = "staff-planner.sqlite";

fn validate_state_json(value: &str) -> Result<(), String> {
    let parsed: Value = serde_json::from_str(value).map_err(|error| error.to_string())?;
    let object = parsed
        .as_object()
        .ok_or_else(|| "Lo stato dell'app deve essere un oggetto JSON".to_string())?;

    for key in ["employees", "stores", "shifts", "absences"] {
        if !object.get(key).is_some_and(Value::is_array) {
            return Err(format!("Campo JSON mancante o non valido: {key}"));
        }
    }

    Ok(())
}

fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory.join(DATABASE_FILE_NAME))
}

fn open_database(app: &AppHandle) -> Result<Connection, String> {
    let connection = Connection::open(database_path(app)?).map_err(|error| error.to_string())?;
    connection
        .execute(
            "CREATE TABLE IF NOT EXISTS app_state (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )",
            [],
        )
        .map_err(|error| error.to_string())?;
    Ok(connection)
}

#[tauri::command]
fn load_data(app: AppHandle, key: String) -> Result<Option<String>, String> {
    let connection = open_database(&app)?;
    connection
        .query_row(
            "SELECT value FROM app_state WHERE key = ?1",
            params![key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_data(app: AppHandle, key: String, value: String) -> Result<(), String> {
    validate_state_json(&value)?;
    let connection = open_database(&app)?;
    connection
        .execute(
            "INSERT INTO app_state (key, value, updated_at)
             VALUES (?1, ?2, datetime('now'))
             ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = datetime('now')",
            params![key, value],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![load_data, save_data])
        .run(tauri::generate_context!())
        .expect("errore durante l'avvio di Staff Planner");
}
