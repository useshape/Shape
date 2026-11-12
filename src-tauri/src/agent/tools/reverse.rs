use serde_json::Value;

use super::dispatch::{ToolCtx, ToolOutcome};

fn unavailable(name: &str) -> ToolOutcome {
    ToolOutcome {
        tool_result: format!("{name} is not available in this build."),
        ui_chunk: String::new(),
        side_effect: None,
    }
}

pub fn tool_re_catalog(_args: &Value, _ctx: &ToolCtx<'_>) -> ToolOutcome {
    unavailable("re_catalog")
}

pub fn tool_re_identify(_args: &Value, _ctx: &ToolCtx<'_>) -> ToolOutcome {
    unavailable("re_identify")
}

pub fn tool_re_inspect(_args: &Value, _ctx: &ToolCtx<'_>) -> ToolOutcome {
    unavailable("re_inspect")
}

pub fn tool_re_strings(_args: &Value, _ctx: &ToolCtx<'_>) -> ToolOutcome {
    unavailable("re_strings")
}

pub fn tool_re_disassemble(_args: &Value, _ctx: &ToolCtx<'_>) -> ToolOutcome {
    unavailable("re_disassemble")
}

pub fn tool_re_functions(_args: &Value, _ctx: &ToolCtx<'_>) -> ToolOutcome {
    unavailable("re_functions")
}

pub fn tool_re_callgraph(_args: &Value, _ctx: &ToolCtx<'_>) -> ToolOutcome {
    unavailable("re_callgraph")
}

pub fn tool_re_extract(_args: &Value, _ctx: &ToolCtx<'_>) -> ToolOutcome {
    unavailable("re_extract")
}
