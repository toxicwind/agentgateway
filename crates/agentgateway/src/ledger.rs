use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use chrono::Utc;
use serde::Serialize;
use tracing::error;

#[derive(Serialize)]
pub struct LedgerEntry {
    pub timestamp: String,
    pub service: String,
    pub event: String,
    pub metadata: serde_json::Value,
}

pub struct RecoveryLedger {
    path: PathBuf,
}

impl RecoveryLedger {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn log(&self, service: &str, event: &str, metadata: serde_json::Value) {
        let entry = LedgerEntry {
            timestamp: Utc::now().to_rfc3339(),
            service: service.to_string(),
            event: event.to_string(),
            metadata,
        };

        if let Ok(json) = serde_json::to_string(&entry) {
            match OpenOptions::new()
                .create(true)
                .append(true)
                .open(&self.path)
            {
                Ok(mut file) => {
                    if let Err(e) = writeln!(file, "{}", json) {
                        error!(?e, "RecoveryLedger: Failed to write entry");
                    }
                }
                Err(e) => {
                    error!(?e, path=?self.path, "RecoveryLedger: Failed to open ledger file");
                }
            }
        }
    }
}
