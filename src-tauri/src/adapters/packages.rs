use crate::core::error::AppError;
use crate::domain::packages::service;
pub use crate::commands::packages::PackageInfo;

#[tauri::command]
pub async fn get_package_info(
    project_path: String,
    package_manager: Option<String>,
) -> Result<PackageInfo, AppError> {
    service::get_package_info(project_path, package_manager).await
}

#[tauri::command]
pub async fn npm_install(
    project_path: String,
    package_name: String,
    dev: bool,
    package_manager: Option<String>,
) -> Result<(), AppError> {
    service::npm_install(project_path, package_name, dev, package_manager).await
}

#[tauri::command]
pub async fn npm_uninstall(
    project_path: String,
    package_name: String,
    package_manager: Option<String>,
) -> Result<(), AppError> {
    service::npm_uninstall(project_path, package_name, package_manager).await
}

#[tauri::command]
pub async fn npm_update(
    project_path: String,
    package_name: Option<String>,
    package_manager: Option<String>,
) -> Result<(), AppError> {
    service::npm_update(project_path, package_name, package_manager).await
}

#[tauri::command]
pub async fn run_install_all(
    project_path: String,
    package_manager: Option<String>,
) -> Result<(), AppError> {
    service::run_install_all(project_path, package_manager).await
}
