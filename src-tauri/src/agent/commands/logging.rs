/// Terminal-visible logging for the agent subsystem.
/// All log output goes to the Tauri terminal (stdout) so you can see it
/// in the dev console when running `cargo tauri dev`.

use std::fmt;

/// Log levels for agent operations
#[derive(Debug, Clone, Copy)]
pub enum LogLevel {
    Debug,
    Info,
    Warn,
    Error,
}

impl fmt::Display for LogLevel {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            LogLevel::Debug => write!(f, "DEBUG"),
            LogLevel::Info => write!(f, "INFO"),
            LogLevel::Warn => write!(f, "WARN"),
            LogLevel::Error => write!(f, "ERROR"),
        }
    }
}

/// Print a log message to the terminal with timestamp, level, and context.
pub fn agent_log(level: LogLevel, component: &str, message: &str) {
    let timestamp = chrono_timestamp();
    eprintln!("[{timestamp}] [{level}] [agent::{component}] {message}");
}

/// Convenience macros as functions
pub fn debug(component: &str, message: &str) {
    agent_log(LogLevel::Debug, component, message);
}

pub fn info(component: &str, message: &str) {
    agent_log(LogLevel::Info, component, message);
}

pub fn warn(component: &str, message: &str) {
    agent_log(LogLevel::Warn, component, message);
}

pub fn error(component: &str, message: &str) {
    agent_log(LogLevel::Error, component, message);
}

fn chrono_timestamp() -> String {
    use std::time::SystemTime;
    let now = SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs();
    let hours = (secs / 3600) % 24;
    let minutes = (secs / 60) % 60;
    let seconds = secs % 60;
    let millis = now.subsec_millis();
    format!("{:02}:{:02}:{:02}.{:03}", hours, minutes, seconds, millis)
}
