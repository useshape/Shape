use serde_json::Value;

use super::dispatch::{ToolCtx, ToolOutcome};

fn unavailable(name: &str) -> ToolOutcome {
    ToolOutcome {
        tool_result: format!("{name} is not available in this build."),
        ui_chunk: String::new(),
        side_effect: None,
    }
}

pub async fn tool_generate_3d_model(_args: &Value, _ctx: &ToolCtx<'_>) -> ToolOutcome {
    unavailable("generate_3d_model")
}

pub async fn tool_edit_3d_model(_args: &Value, _ctx: &ToolCtx<'_>) -> ToolOutcome {
    unavailable("edit_3d_model")
}

pub async fn tool_inspect_3d_model(_args: &Value, _ctx: &ToolCtx<'_>) -> ToolOutcome {
    unavailable("inspect_3d_model")
}

pub async fn tool_convert_3d_model(_args: &Value, _ctx: &ToolCtx<'_>) -> ToolOutcome {
    unavailable("convert_3d_model")
}
