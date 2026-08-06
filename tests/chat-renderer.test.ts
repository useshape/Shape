import { describe, expect, it } from "vitest";
import { dedupeTerminalChunks, parseMessageContent } from "@/features/chat/ui/md/renderer";
import { preprocessChatMarkdown, repairStreamGlitches } from "@/features/chat/ui/md/stream";

describe("parseMessageContent", () => {
    it("parses redacted_thinking blocks instead of leaking closing tags", () => {
        const chunks = parseMessageContent(
            "Hello\n<think>Checking project layout</think>\n\nReady.",
        );
        const think = chunks.find((c) => c.type === "think");
        expect(think?.content).toContain("Checking project layout");
        expect(chunks.some((c) => c.type === "text" && c.content?.includes("</think>"))).toBe(false);
    });

    it("dedupes terminal commands with the same id, keeping completed over pending", () => {
        const text = [
            '<terminal_command status="pending" id="cmd-1">npx create-next-app@latest .',
            "Awaiting approval: review",
            "</terminal_command>",
            '<terminal_command status="completed" id="cmd-1">npx create-next-app@latest .',
            "</terminal_command>",
        ].join("\n");

        const chunks = parseMessageContent(text);
        const terminals = chunks.filter((c) => c.type === "terminal_command");
        expect(terminals).toHaveLength(1);
        expect(terminals[0].commandStatus).toBe("completed");
    });

    it("dedupes duplicate pending commands with the same command text", () => {
        const cmd = "npx create-next-app@latest . --yes";
        const text = [
            `<terminal_command status="pending" id="cmd-1">${cmd}\nAwaiting approval: a</terminal_command>`,
            `<terminal_command status="pending" id="cmd-2">${cmd}\nAwaiting approval: b</terminal_command>`,
        ].join("\n");

        const chunks = parseMessageContent(text);
        const terminals = chunks.filter((c) => c.type === "terminal_command");
        expect(terminals).toHaveLength(1);
    });

    it("parses cat blocks with line ranges", () => {
        const chunks = parseMessageContent(
            '<cat path="features/chat/ui/messages/turn-workflow.tsx" start="1" end="244"></cat>',
        );
        const cat = chunks.find((c) => c.type === "cat");
        expect(cat?.content).toBe("features/chat/ui/messages/turn-workflow.tsx");
        expect(cat?.catStartLine).toBe(1);
        expect(cat?.catEndLine).toBe(244);
    });
    it("dedupes edit_pending chunks for the same id, keeping applied over pending", () => {
        const text = [
            '<edit_pending id="e1" file="src/a.ts" status="pending"><original>a</original><replacement>b</replacement></edit_pending>',
            '<edit_pending id="e1" file="src/a.ts" status="applied"><original>a</original><replacement>b</replacement></edit_pending>',
        ].join("\n");
        const chunks = parseMessageContent(text);
        const edits = chunks.filter((c) => c.type === "edit_pending");
        expect(edits).toHaveLength(1);
        expect(edits[0].commandStatus).toBe("applied");
        expect(edits[0].file).toBe("src/a.ts");
    });
});

describe("dedupeTerminalChunks", () => {
    it("prefers higher-status terminal chunks for the same id", () => {
        const result = dedupeTerminalChunks([
            { type: "terminal_command", commandId: "cmd-1", commandStatus: "pending", command: "npm test" },
            { type: "terminal_command", commandId: "cmd-1", commandStatus: "completed", command: "npm test" },
        ]);
        expect(result).toHaveLength(1);
        expect(result[0].commandStatus).toBe("completed");
    });

    it("dedupes edit_pending by id independently from terminal commands", () => {
        const result = dedupeTerminalChunks([
            {
                type: "edit_pending",
                commandId: "e1",
                commandStatus: "pending",
                file: "a.ts",
                original: "x",
                replacement: "y",
            },
            {
                type: "edit_pending",
                commandId: "e1",
                commandStatus: "applied",
                file: "a.ts",
                original: "x",
                replacement: "y",
            },
            {
                type: "terminal_command",
                commandId: "e1",
                commandStatus: "pending",
                command: "echo",
            },
        ]);
        const edits = result.filter((c) => c.type === "edit_pending");
        const terms = result.filter((c) => c.type === "terminal_command");
        expect(edits).toHaveLength(1);
        expect(edits[0].commandStatus).toBe("applied");
        expect(terms).toHaveLength(1);
    });
});
describe("preprocessChatMarkdown", () => {
    it("strips standalone horizontal rules", () => {
        expect(preprocessChatMarkdown("Hello\n---\nWorld")).toBe("Hello\n\nWorld");
    });

    it("repairs glued duplicate stream text", () => {
        const glitched =
            "Here's a thorough analysis of your repo combined withHere's a thorough analysis of your repo combined with current best-practice research:";
        const fixed = repairStreamGlitches(glitched);
        expect(fixed).not.toContain("combined withHere's");
    });

    it("converts unicode bullets to markdown lists", () => {
        expect(preprocessChatMarkdown("• Modern stack:\nNext.js")).toContain("- Modern stack:");
    });

    it("dedents indented markdown headings", () => {
        const input = "    ## Step 3\n    - item one";
        expect(preprocessChatMarkdown(input)).toContain("## Step 3\n- item one");
    });

    it("unwraps outer prose code fence", () => {
        const input = "```\n## Title\n\nBody\n```";
        expect(preprocessChatMarkdown(input)).toBe("## Title\n\nBody");
    });

    it("strips leaked tool_code JSON fences from design-mode dumps", () => {
        const input = `Here are two concepts.

\`\`\`json
{ "tool_code": "print(render_design_previews(concepts=[
  {
\`\`\`
`;
        const out = preprocessChatMarkdown(input);
        expect(out).toContain("Here are two concepts");
        expect(out).not.toContain("tool_code");
        expect(out).not.toContain("render_design_previews");
    });

    it("hides Gemini function_calls / tool_code XML (Auto + Gemini)", () => {
        const input = [
            "Searching keys.",
            "<function_calls>",
            "<tool_code>grep_search(pattern='secret')</tool_code>",
            "</function_calls>",
            "<pre_dispatch_explanation>Looking for secrets.</pre_dispatch_explanation>",
            "Done.",
        ].join("\n");
        const out = preprocessChatMarkdown(input);
        expect(out).toContain("Searching keys");
        expect(out).toContain("Done");
        expect(out).not.toContain("function_calls");
        expect(out).not.toContain("grep_search");
        expect(out).not.toContain("pre_dispatch");
    });

    it("hides Claude/Qwen/Hermes tool_call XML", () => {
        const input = [
            "Checking weather.",
            "<tool_call>",
            '<function=get_weather>',
            "<parameter=location>Paris</parameter>",
            "</function>",
            "</tool_call>",
            "Paris looks clear.",
        ].join("\n");
        const out = preprocessChatMarkdown(input);
        expect(out).toContain("Checking weather");
        expect(out).toContain("Paris looks clear");
        expect(out).not.toContain("<tool_call");
        expect(out).not.toContain("get_weather");
    });

    it("hides DeepSeek DSML tool markup", () => {
        const fw = "\uFF5C";
        const input = [
            "Running search.",
            `<${fw}${fw}DSML${fw}${fw}tool_calls>`,
            `<${fw}${fw}DSML${fw}${fw}invoke name="web_search">`,
            `<${fw}${fw}DSML${fw}${fw}parameter name="query" string="true">news</${fw}${fw}DSML${fw}${fw}parameter>`,
            `</${fw}${fw}DSML${fw}${fw}invoke>`,
            `</${fw}${fw}DSML${fw}${fw}tool_calls>`,
            "Found three results.",
        ].join("\n");
        const out = preprocessChatMarkdown(input);
        expect(out).toContain("Running search");
        expect(out).toContain("Found three results");
        expect(out).not.toContain("DSML");
        expect(out).not.toContain("web_search");
    });

    it("hides MiniMax tool_call XML", () => {
        const input = [
            "Opening terminal.",
            "<minimax:tool_call>",
            '<invoke name="run_terminal">',
            "<parameter name=\"command\">ls</parameter>",
            "</invoke>",
            "</minimax:tool_call>",
            "Listed files.",
        ].join("\n");
        const out = preprocessChatMarkdown(input);
        expect(out).toContain("Opening terminal");
        expect(out).toContain("Listed files");
        expect(out).not.toContain("minimax");
        expect(out).not.toContain("run_terminal");
    });

    it("hides Kimi / Llama special tool tokens", () => {
        const input = [
            "Searching.",
            "<|tool_calls_section_begin|>",
            "<|tool_call_begin|>functions.web_search:0<|tool_call_argument_begin|>{\"query\":\"x\"}<|tool_call_end|>",
            "<|tool_calls_section_end|>",
            "<|python_tag|>",
            "Done.",
        ].join("\n");
        const out = preprocessChatMarkdown(input);
        expect(out).toContain("Searching");
        expect(out).toContain("Done");
        expect(out).not.toContain("<|tool_");
        expect(out).not.toContain("python_tag");
    });

    it("hides Shape list_terminals / terminal_input dumps", () => {
        const input = [
            "Waiting.",
            "<list_terminals>",
            "session_id: 1 | running: true | command: npx create-next-app",
            "</list_terminals>",
            '<terminal_input session="1">|</terminal_input>',
            "Still waiting.",
        ].join("\n");
        const out = preprocessChatMarkdown(input);
        expect(out).toContain("Waiting");
        expect(out).toContain("Still waiting");
        expect(out).not.toContain("session_id");
        expect(out).not.toContain("terminal_input");
    });

    it("preserves intentional Shape UI tags for the chunk parser", () => {
        const input = 'Before\n<terminal_command status="pending" id="c1">npm test</terminal_command>\nAfter';
        // strip path must not erase terminal_command — parseMessageContent owns that.
        const out = preprocessChatMarkdown(input);
        expect(out).toContain("<terminal_command");
        expect(out).toContain("npm test");
    });
});
