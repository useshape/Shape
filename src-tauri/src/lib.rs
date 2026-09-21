mod agent;
mod app_state;
pub(crate) mod commands;
mod core;
mod domain;
mod mcp;

use core::state::AppState;
use domain::terminal::service::PtyState;
use tauri::{AppHandle, Emitter, Manager};

fn emit_shape_deep_link(app: &AppHandle, url: &str) {
    if url.contains("mcp/oauth") {
        let _ = app.emit("shape-mcp-oauth-callback", url);
        focus_main_window(app);
    } else if url.contains("shape://auth") || url.contains("/auth/callback") {
        let _ = app.emit("shape-oauth-callback", url);
        focus_shape_windows(app);
    } else {
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
            commands::ipc::shortcuts::setup_menu(app.handle())?;
            app.on_menu_event(|app, event| {
                commands::ipc::shortcuts::handle_menu_event(app, &event.id().0);
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
            commands::ipc::filesystem::ls_dir,
            commands::ipc::filesystem::read_file,
            commands::ipc::filesystem::read_file_bytes,
            commands::ipc::filesystem::create_file,
            commands::ipc::filesystem::create_dir,
            commands::ipc::filesystem::delete_path,
            commands::ipc::filesystem::trash_path,
            commands::ipc::filesystem::rename_path,
            commands::ipc::filesystem::pin_file,
            commands::ipc::filesystem::close_to_right,
            commands::ipc::filesystem::close_saved,
            commands::ipc::filesystem::copy_path,
            commands::ipc::filesystem::reveal_path,
            commands::ipc::filesystem::open_in_app,
            commands::ipc::filesystem::save_file,
            commands::ipc::filesystem::save_file_bytes,
            commands::ipc::filesystem::mark_file_dirty,
            commands::ipc::filesystem::get_rust_deps,
            commands::ipc::filesystem::set_project_path,
            commands::ipc::filesystem::open_file,
            commands::ipc::filesystem::close_file,
            commands::ipc::filesystem::close_all_files,
            commands::ipc::filesystem::set_active_file,
            commands::ipc::filesystem::reorder_files,
            commands::ipc::filesystem::get_project_state,
            commands::ipc::filesystem::search_project_files,
            commands::ipc::filesystem::search_content,
            commands::ipc::filesystem::replace_content,
            commands::ipc::filesystem::set_diagnostics,
            commands::ipc::filesystem::save_color_to_history,
            commands::ipc::filesystem::get_color_history,
            commands::ipc::open::open_url_external,
            commands::desktop_notification::show_desktop_notification,
            commands::preview_render::capture_html_preview,
            commands::preview_render::capture_page_preview,
            commands::preview_render::remember_preview_url_cmd,
            commands::preview_render::cleanup_design_sandbox,
            commands::design_proxy::start_design_proxy,
            commands::design_proxy::stop_design_proxy,
            commands::design_proxy::probe_preview_url,
            commands::design_bridge::register_design_bridge,
            commands::design_bridge::design_mode_log,
            commands::design_source::inspect_design_project,
            commands::design_source::list_design_assets,
            commands::design_source::resolve_design_element,
            commands::design_source::apply_design_source_patch,
            commands::design_source::undo_design_source_patch,
            commands::design_source::redo_design_source_patch,
            // project stats
            commands::stats::get_project_stats,
            commands::stats::scan_project_loc,
            commands::stats::set_stats_custom_ignore,
            commands::stats::record_project_activity,
            // pty
            commands::ipc::terminal::pty_available_shells,
            commands::ipc::terminal::pty_spawn,
            commands::ipc::terminal::pty_spawn_run,
            commands::ipc::terminal::pty_read_output,
            commands::ipc::terminal::pty_write,
            commands::ipc::terminal::pty_resize,
            commands::ipc::terminal::pty_kill,
            commands::ipc::terminal::pty_kill_all,
            // shortcuts
            commands::ipc::shortcuts::handle_shortcut,
            commands::ipc::shortcuts::spawn_new_window,
            commands::ipc::shortcuts::is_fresh_window,
            // github auth
            commands::ipc::github_auth::github_auth_status,
            commands::ipc::github_auth::github_auth_login,
            commands::ipc::github_auth::github_auth_logout,
            commands::ipc::github_auth::github_auth_ensure_git_helper,
            commands::ipc::github_auth::github_api_get,
            commands::ipc::github_auth::github_api_request,
            commands::ipc::github_auth::github_actions_logs,
            commands::ipc::github_auth::github_actions_download_artifact,
            commands::ipc::github_auth::github_actions_workflow_yaml,
            commands::ipc::github_auth::github_actions_workflow_dispatch,
            commands::ipc::device_id::get_device_id,
            // python
            commands::python::discover_python_interpreters,
            // git
            commands::ipc::git::git_discover_repos,
            commands::ipc::git::git_resolve_repo_for_file,
            commands::ipc::git::git_status,
            commands::ipc::git::git_stage,
            commands::ipc::git::git_stage_all,
            commands::ipc::git::git_unstage,
            commands::ipc::git::git_unstage_all,
            commands::ipc::git::git_discard_changes,
            commands::ipc::git::git_list_hunks,
            commands::ipc::git::git_stage_hunk,
            commands::ipc::git::git_unstage_hunk,
            commands::ipc::git::git_restore_hunk,
            commands::ipc::git::git_file_diff,
            commands::ipc::git::git_create_branch,
            commands::ipc::git::git_delete_branch,
            commands::ipc::git::git_switch_branch,
            commands::ipc::git::git_commit,
            commands::ipc::git::git_commit_amend,
            commands::ipc::git::git_diff,
            commands::ipc::git::git_branches,
            commands::ipc::git::git_init,
            commands::ipc::git::git_branch_details,
            commands::ipc::git::git_branch_graph,
            commands::ipc::git::git_set_upstream,
            commands::ipc::git::git_diff_branches,
            commands::ipc::git::git_remote_branches,
            commands::ipc::git::git_rename_branch,
            commands::ipc::git::git_current_branch,
            commands::ipc::git::git_log,
            commands::ipc::git::git_log_stream_start,
            commands::ipc::git::git_log_stream_next,
            commands::ipc::git::git_log_stream_stop,
            commands::ipc::git::git_activity_timeline,
            commands::ipc::git::git_sync_status,
            commands::ipc::git::git_sync,
            commands::ipc::git::git_pull,
            commands::ipc::git::git_push,
            commands::ipc::git::git_fetch,
            commands::ipc::git::git_has_remote,
            commands::ipc::git::git_remote_url,
            commands::ipc::git::git_list_remotes,
            commands::ipc::git::git_add_remote,
            commands::ipc::git::git_remove_remote,
            commands::ipc::git::git_set_remote_url,
            commands::ipc::git::git_commit_files,
            commands::ipc::git::git_get_item_content,
            commands::ipc::git::git_get_commit_file_content,
            commands::ipc::git::git_open_diff,
            commands::ipc::git::git_open_commit_diff,
            commands::ipc::git::git_cherry_pick,
            commands::ipc::git::git_revert_commit,
            commands::ipc::git::git_create_branch_from_commit,
            commands::ipc::git::git_checkout_commit,
            commands::ipc::git::git_blame_file,
            commands::ipc::git::git_stash_list,
            commands::ipc::git::git_stash_save,
            commands::ipc::git::git_stash_apply,
            commands::ipc::git::git_stash_pop,
            commands::ipc::git::git_stash_drop,
            commands::ipc::git::git_stash_show,
            commands::ipc::git::git_clone,
            commands::ipc::git::git_list_tags,
            commands::ipc::git::git_reset,
            commands::ipc::git::git_create_tag,
            commands::ipc::git::git_delete_tag,
            commands::ipc::git::git_diff_name_status,
            commands::ipc::git::git_get_file_at_ref,
            commands::ipc::git::git_merge_abort,
            commands::ipc::git::git_rebase_abort,
            commands::ipc::git::git_in_progress,
            // packages
            commands::ipc::packages::get_package_info,
            commands::ipc::packages::npm_install,
            commands::ipc::packages::npm_uninstall,
            commands::ipc::packages::npm_update,
            commands::ipc::packages::run_install_all,
            commands::ipc::packages::scaffold_web_project,
            // outline
            commands::ipc::outline::get_outline,
            // agent
            agent::commands::send_chat::send_chat_message,
            agent::commands::send_chat::update_turn_policy,
            agent::commands::conversation::get_chat_history,
            agent::commands::conversation::get_chat_generation_state,
            agent::commands::conversation::clear_chat_history,
            agent::commands::conversation::new_chat,
            agent::commands::conversation::load_conversation,
            agent::commands::conversation::fork_conversation,
            agent::commands::conversation::set_message_feedback,
            agent::commands::conversation::delete_conversation,
            agent::commands::approvals::stop_chat_message,
            agent::commands::conversation::get_chat_title,
            agent::commands::conversation::get_current_conversation_id,
            agent::commands::conversation::get_conversations,
            agent::commands::approvals::apply_file_edit,
            agent::commands::commit_message::generate_commit_message,
            agent::commands::git_ai::summarize_pull_request,
            agent::commands::git_ai::review_pull_request,
            agent::commands::git_ai::draft_pull_request,
            agent::commands::git_ai::summarize_issue,
            agent::commands::git_ai::summarize_release,
            agent::commands::git_ai::explain_ci_log,
            agent::commands::git_ai::explain_git_changes,
            agent::commands::approvals::approve_terminal_command,
            agent::commands::approvals::reject_terminal_command,
            agent::commands::approvals::resolve_edit_approval,
            agent::commands::approvals::answer_ask_user,
            agent::commands::approvals::select_design_preview,
            agent::commands::conversation::restore_checkpoint,
            agent::commands::conversation::get_turn_journal,
            agent::commands::conversation::get_open_turn_journals,
            agent::commands::indexing::index_project,
            agent::commands::indexing::search_codebase,
            agent::commands::indexing::get_index_status,
            agent::commands::indexing::set_index_embeddings,
            agent::commands::indexing::set_chat_memory_enabled,
            agent::commands::indexing::set_byok_keys,
            agent::commands::mcp_cmds::sync_mcp_servers,
            agent::commands::mcp_cmds::get_mcp_config_path,
            agent::commands::mcp_cmds::ensure_mcp_config,
            agent::commands::mcp_cmds::read_mcp_config,
            agent::commands::mcp_cmds::write_mcp_config,
            agent::commands::mcp_cmds::get_mcp_status,
            agent::commands::mcp_cmds::get_mcp_tools,
            agent::commands::mcp_cmds::restart_mcp_server,
            agent::commands::mcp_cmds::mcp_start_oauth,
            agent::commands::mcp_cmds::mcp_complete_oauth,
            agent::commands::mcp_cmds::mcp_clear_oauth,
            agent::commands::mcp_cmds::call_mcp_tool,
            // lint
            commands::ipc::lint::eslint_lint_file,
            commands::ipc::lint::prettier_format_file,
            // testing
            commands::ipc::testing::discover_tests,
            commands::ipc::testing::run_tests,
            // workspace trust
            commands::ipc::workspace_trust::set_workspace_trusted,
            commands::ipc::workspace_trust::is_workspace_trusted,
            // history
            commands::ipc::history::get_file_history_command,
            commands::ipc::history::restore_history_version_command,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
