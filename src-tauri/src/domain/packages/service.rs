use crate::commands::packages;
use crate::core::error::AppError;

pub use crate::commands::packages::PackageInfo;

pub async fn get_package_info(project_path: String, package_manager: Option<String>) -> Result<PackageInfo, AppError> {
    tauri::async_runtime::spawn_blocking(move || packages::get_package_info(project_path, package_manager))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn npm_install(
    project_path: String,
    package_name: String,
    dev: bool,
    package_manager: Option<String>,
) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        packages::npm_install(project_path, package_name, dev, package_manager)
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn npm_uninstall(
    project_path: String,
    package_name: String,
    package_manager: Option<String>,
) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        packages::npm_uninstall(project_path, package_name, package_manager)
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn npm_update(
    project_path: String,
    package_name: Option<String>,
    package_manager: Option<String>,
) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        packages::npm_update(project_path, package_name, package_manager)
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn run_install_all(project_path: String, package_manager: Option<String>) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        packages::run_install_all(project_path, package_manager)
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}
