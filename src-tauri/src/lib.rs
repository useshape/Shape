mod adapters;
mod agent;
mod app_state;
pub(crate) mod commands;
mod core;
mod domain;
mod mcp;

use core::state::AppState;
use domain::lsp::service::LspState;
use domain::terminal::service::PtyState;
use tauri::{AppHandle, Emitter, Manager};

fn emit_shape_deep_link(app: &AppHandle, url: &str) {
    if url.contains("mcp/oauth") {
        let _ = app.emit("shape-mcp-oauth-callback", url);
        focus_main_window(app);
    } else if url.contains("shape://auth") || url.contains("/auth/callback") {
        let _ = app.emit("shape-oauth-callback", url);
        focus_shape_windows(app);
    }
}

fn focus_shape_windows(app: &AppHandle) {
    for label in ["main", "onboarding", "settings", "branch"] {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    } else {
        focus_shape_windows(app);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Release GUI builds have no console; ConPTY needs a hidden one to inherit
    // or Windows pops a visible console window for every terminal/shell spawn.
    crate::core::process::ensure_hidden_console_for_conpty();

    // Load env from src-tauri/ or shape/ (tauri dev cwd varies)
    let _ = dotenvy::from_filename(".env.local");
    let _ = dotenvy::from_filename("../.env.local");
    dotenvy::dotenv().ok();
    let _ = dotenvy::from_filename("../.env");

    let mut builder = tauri::Builder::default();

    // Windows/Linux spawn a new process for shape:// URLs — single-instance
    // must be registered before deep-link so argv is forwarded to this instance.
    #[cfg(any(target_os = "windows", target_os = "linux"))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            for arg in &argv {
                if arg.contains("shape://") {
                    emit_shape_deep_link(app, arg);
                    return;
                }
            }
            focus_shape_windows(app);
        }));
    }

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(PtyState::new())
        .manage(AppState::new())
        .manage(agent::AgentState::new())
        .manage(agent::index::IndexState::new())
        .manage(mcp::McpState::new())
        .manage(LspState::new())
        .manage(crate::core::workspace_trust::WorkspaceTrustState::new())
        .manage(commands::preview_render::PreviewCaptureState::default())
        .manage(commands::design_proxy::DesignProxyState::default())
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = app.deep_link().register_all();
                let handle = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    for url in event.urls() {
                        emit_shape_deep_link(&handle, url.as_ref());
                    }
                });
            }

            app.state::<commands::preview_render::PreviewCaptureState>()
                .register_listener(app.handle());

            #[cfg(windows)]
            crate::core::windows_notifications::init();

            // Initialize menu
            adapters::shortcuts::setup_menu(app.handle())?;
            app.on_menu_event(|app, event| {
                adapters::shortcuts::handle_menu_event(app, &event.id().0);
            });

            // Window initialization can be handled in Tauri config or here
            // Removing manual acrylic effects as they interfere with transparent: false

            if cfg!(debug_assertions) {
                let _ = app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                );
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // fs
            adapters::filesystem::ls_dir,
            adapters::filesystem::read_file,
            adapters::filesystem::read_file_bytes,
            adapters::filesystem::create_file,
            adapters::filesystem::create_dir,
            adapters::filesystem::delete_path,
            adapters::filesystem::trash_path,
            adapters::filesystem::rename_path,
            adapters::filesystem::pin_file,
            adapters::filesystem::close_to_right,
            adapters::filesystem::close_saved,
            adapters::filesystem::copy_path,
            adapters::filesystem::reveal_path,
            adapters::filesystem::save_file,
            adapters::filesystem::save_file_bytes,
            adapters::filesystem::mark_file_dirty,
            adapters::filesystem::get_rust_deps,
            adapters::filesystem::set_project_path,
            adapters::filesystem::open_file,
            adapters::filesystem::close_file,
            adapters::filesystem::close_all_files,
            adapters::filesystem::set_active_file,
            adapters::filesystem::reorder_files,
            adapters::filesystem::get_project_state,
            adapters::filesystem::search_project_files,
            adapters::filesystem::search_content,
            adapters::filesystem::replace_content,
            adapters::filesystem::set_diagnostics,
            adapters::filesystem::save_color_to_history,
            adapters::filesystem::get_color_history,
            adapters::open::open_url_external,
            commands::desktop_notification::show_desktop_notification,
            commands::preview_render::capture_html_preview,
            commands::preview_render::cleanup_design_sandbox,
            commands::design_proxy::start_design_proxy,
            commands::design_proxy::stop_design_proxy,
            commands::design_proxy::probe_preview_url,
            commands::design_bridge::register_design_bridge,
            commands::design_bridge::design_mode_log,
            // project stats
            commands::stats::get_project_stats,
            commands::stats::scan_project_loc,
            commands::stats::set_stats_custom_ignore,
            commands::stats::record_project_activity,
            // pty
            adapters::terminal::pty_available_shells,
            adapters::terminal::pty_spawn,
            adapters::terminal::pty_write,
            adapters::terminal::pty_resize,
            adapters::terminal::pty_kill,
            adapters::terminal::pty_kill_all,
            // shortcuts
            adapters::shortcuts::handle_shortcut,
            adapters::shortcuts::spawn_new_window,
            adapters::shortcuts::is_fresh_window,
            // github auth
            adapters::github_auth::github_auth_status,
            adapters::github_auth::github_auth_login,
            adapters::github_auth::github_auth_logout,
            adapters::github_auth::github_auth_ensure_git_helper,
            adapters::github_auth::github_api_get,
            adapters::github_auth::github_api_request,
            adapters::github_auth::github_actions_logs,
            adapters::github_auth::github_actions_download_artifact,
            adapters::github_auth::github_actions_workflow_yaml,
            adapters::github_auth::github_actions_workflow_dispatch,
            adapters::device_id::get_device_id,
            // python
            commands::python::discover_python_interpreters,
            // git
            adapters::git::git_discover_repos,
            adapters::git::git_resolve_repo_for_file,
            adapters::git::git_status,
            adapters::git::git_stage,
            adapters::git::git_stage_all,
            adapters::git::git_unstage,
            adapters::git::git_unstage_all,
            adapters::git::git_discard_changes,
            adapters::git::git_list_hunks,
            adapters::git::git_stage_hunk,
            adapters::git::git_unstage_hunk,
            adapters::git::git_restore_hunk,
            adapters::git::git_file_diff,
            adapters::git::git_create_branch,
            adapters::git::git_delete_branch,
            adapters::git::git_switch_branch,
            adapters::git::git_commit,
            adapters::git::git_commit_amend,
            adapters::git::git_diff,
            adapters::git::git_branches,
            adapters::git::git_init,
            adapters::git::git_branch_details,
            adapters::git::git_branch_graph,
            adapters::git::git_set_upstream,
            adapters::git::git_diff_branches,
            adapters::git::git_remote_branches,
            adapters::git::git_rename_branch,
            adapters::git::git_current_branch,
            adapters::git::git_log,
            adapters::git::git_log_stream_start,
            adapters::git::git_log_stream_next,
            adapters::git::git_log_stream_stop,
            adapters::git::git_activity_timeline,
            adapters::git::git_sync_status,
            adapters::git::git_sync,
            adapters::git::git_pull,
            adapters::git::git_push,
            adapters::git::git_fetch,
            adapters::git::git_has_remote,
            adapters::git::git_remote_url,
            adapters::git::git_list_remotes,
            adapters::git::git_add_remote,
            adapters::git::git_remove_remote,
            adapters::git::git_set_remote_url,
            adapters::git::git_commit_files,
            adapters::git::git_get_item_content,
            adapters::git::git_get_commit_file_content,
            adapters::git::git_open_diff,
            adapters::git::git_open_commit_diff,
            adapters::git::git_cherry_pick,
            adapters::git::git_revert_commit,
            adapters::git::git_create_branch_from_commit,
            adapters::git::git_checkout_commit,
            adapters::git::git_blame_file,
            adapters::git::git_stash_list,
            adapters::git::git_stash_save,
            adapters::git::git_stash_apply,
            adapters::git::git_stash_pop,
            adapters::git::git_stash_drop,
            adapters::git::git_stash_show,
            adapters::git::git_clone,
            adapters::git::git_list_tags,
            adapters::git::git_reset,
            adapters::git::git_create_tag,
            adapters::git::git_delete_tag,
            adapters::git::git_diff_name_status,
            adapters::git::git_get_file_at_ref,
            adapters::git::git_merge_abort,
            adapters::git::git_rebase_abort,
            adapters::git::git_in_progress,
            // packages
            adapters::packages::get_package_info,
            adapters::packages::npm_install,
            adapters::packages::npm_uninstall,
            adapters::packages::npm_update,
            adapters::packages::run_install_all,
            // outline
            adapters::outline::get_outline,
            // agent
            agent::commands::send_chat::send_chat_message,
            agent::commands::conversation::get_chat_history,
            agent::commands::conversation::get_chat_generation_state,
            agent::commands::conversation::clear_chat_history,
            agent::commands::conversation::new_chat,
            agent::commands::conversation::load_conversation,
            agent::commands::conversation::delete_conversation,
            agent::commands::approvals::stop_chat_message,
            agent::commands::conversation::get_chat_title,
            agent::commands::conversation::get_current_conversation_id,
            agent::commands::conversation::get_conversations,
            agent::commands::approvals::apply_file_edit,
            agent::commands::commit_message::generate_commit_message,
            agent::commands::git_ai::summarize_pull_request,
            agent::commands::git_ai::summarize_issue,
            agent::commands::git_ai::summarize_release,
            agent::commands::git_ai::explain_ci_log,
            agent::commands::git_ai::explain_git_changes,
            agent::commands::approvals::approve_terminal_command,
            agent::commands::approvals::reject_terminal_command,
            agent::commands::approvals::resolve_edit_approval,
            agent::commands::conversation::restore_checkpoint,
            agent::commands::conversation::get_turn_journal,
            agent::commands::conversation::get_open_turn_journals,
            agent::commands::indexing::index_project,
            agent::commands::indexing::search_codebase,
            agent::commands::indexing::get_index_status,
            agent::commands::indexing::set_index_embeddings,
            agent::commands::mcp_cmds::sync_mcp_servers,
            agent::commands::mcp_cmds::get_mcp_config_path,
            agent::commands::mcp_cmds::ensure_mcp_config,
            agent::commands::mcp_cmds::get_mcp_status,
            agent::commands::mcp_cmds::get_mcp_tools,
            agent::commands::mcp_cmds::restart_mcp_server,
            agent::commands::mcp_cmds::mcp_start_oauth,
            agent::commands::mcp_cmds::mcp_complete_oauth,
            agent::commands::mcp_cmds::call_mcp_tool,
            // lsp
            adapters::lsp::lsp_start,
            adapters::lsp::resolve_typescript_tsdk,
            adapters::lsp::lsp_send,
            adapters::lsp::lsp_stop,
            adapters::lsp::lsp_stop_all,
            // lint
            adapters::lint::eslint_lint_file,
            adapters::lint::prettier_format_file,
            // testing
            adapters::testing::discover_tests,
            adapters::testing::run_tests,
            // workspace trust
            adapters::workspace_trust::set_workspace_trusted,
            adapters::workspace_trust::is_workspace_trusted,
            // history
            adapters::history::get_file_history_command,
            adapters::history::restore_history_version_command,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
