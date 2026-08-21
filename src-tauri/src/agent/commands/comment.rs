//! Focused, non-conversational completion for editor comments.
use super::streaming;
use crate::agent::model_router;
use crate::core::error::AppError;
use reqwest::Client;

#[tauri::command]
pub async fn generate_editor_comment(
    instruction: String,
    file_path: String,
    line: usize,
    file_context: String,
    access_token: Option<String>,
    mention_hints: Option<String>,
) -> Result<String, AppError> {
    let instruction = instruction.trim();
    if instruction.is_empty() {
        return Err(AppError::Message(
            "Describe the comment you want AI to write.".to_string(),
        ));
    }
    let auth_token = access_token
        .filter(|token| !token.trim().is_empty())
        .ok_or_else(|| AppError::Env("Sign in to Shape to use AI comments.".to_string()))?;

    let mentions = mention_hints
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| {
            format!(
                "\nTo mention people or files, copy these tokens exactly (including @): {value}.\n"
            )
        })
        .unwrap_or_default();
    let prompt = format!(
        "Write a concise code review comment for line {line} in {file_path}.\n\
         Return only the comment body in Markdown, with no preamble or surrounding quotes.\n\
         Use only the supplied file excerpt; do not use tools or browse the repo.\n\
         {mentions}\n\
         User instruction:\n{instruction}\n\n\
         File excerpt (the target line starts with >>>):\n{file_context}"
    );
    let context = streaming::ProxyContext::new("editor_comment");
    let (comment, _, _) = streaming::complete_chat_with_max_tokens(
        &Client::new(),
        &auth_token,
        &prompt,
        model_router::MODEL_FAST,
        160,
        &context,
    )
    .await?;

    if comment.trim().is_empty() {
        return Err(AppError::Message(
            "AI returned an empty comment.".to_string(),
        ));
    }
    Ok(comment)
}
