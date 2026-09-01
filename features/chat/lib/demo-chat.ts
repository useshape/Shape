import type { ChatMessage } from "@/lib/backend";

/** Long demo thread for stress-testing scroll, virtualization, and block rendering. */
export function buildDemoChatMessages(): ChatMessage[] {
    const now = Date.now() / 1000;
    const messages: ChatMessage[] = [];

    messages.push({
        role: "user",
        content:
            "Demo every chat surface — plan, edits, approval, terminal, git, search, debate, todos, and a question. Also make this a long conversation so I can test scrolling.",
        timestamp: now - 3600,
    });

    messages.push({
        role: "assistant",
        content: [
            "<think>",
            "Planning a full surface pass so Thought / Worked / Read / Search / tools all render, then pad with many turns for scroll testing.",
            "</think>",
            "<status>Scoping the demo tour</status>",
            "<cat>lib/shape-auth/store.ts</cat>",
            "<cat>features/chat/ui/composer/input.tsx</cat>",
            "<cat>features/chat/ui/blocks/turn.tsx</cat>",
            "<cat>features/chat/ui/blocks/workflow.tsx</cat>",
            "<search>shape auth access token</search>",
            "<web_search>OpenRouter reasoning effort</web_search>",
            "<grep>reasoning_config_for_model</grep>",
            "<ls>features/chat/ui</ls>",
            "<mkdir>tmp/demo-fixtures</mkdir>",
            "<create_file>tmp/demo-fixtures/note.md</create_file>",
            "<edit file=\"features/chat/ui/shell/empty.tsx\">",
            "<original>",
            "export function ChatEmptyQuickActions() {}",
            "</original>",
            "<replacement>",
            "// removed quick actions — repo/branch live under the composer",
            "</replacement>",
            "</edit>",
            "<edit_pending id=\"demo-edit-1\" file=\"features/chat/ui/composer/input.tsx\" status=\"pending\">",
            "<original>",
            "const DEMO = false;",
            "</original>",
            "<replacement>",
            "const DEMO = true;",
            "</replacement>",
            "</edit_pending>",
            "<rename_file>tmp/demo-fixtures/note.md -> tmp/demo-fixtures/README.md</rename_file>",
            "<delete_file>tmp/demo-fixtures/scratch.txt</delete_file>",
            "<terminal_command id=\"demo-term-1\" status=\"done\" exit=\"0\">",
            "npm run typecheck",
            "</terminal_command>",
            "<tool_result>",
            "typecheck passed",
            "</tool_result>",
            "<run>cargo test -q --lib</run>",
            "<git_operation op=\"status\">",
            "[unstaged] M features/chat/ui/composer/input.tsx",
            "[unstaged] M features/chat/ui/blocks/turn.tsx",
            "</git_operation>",
            "<git_operation op=\"stage\">",
            "Staged features/chat/ui/composer/input.tsx",
            "</git_operation>",
            "<web_visit url=\"https://openrouter.ai/docs\" host=\"openrouter.ai\" title=\"OpenRouter Docs\" />",
            "<web_result>",
            "### Reasoning effort",
            "URL: https://openrouter.ai/docs",
            "Models expose effort levels such as low / medium / high for reasoning traces.",
            "</web_result>",
            "<plan title=\"menu-system-cleanup\">",
            "## Goal",
            "Unify menus on one token-driven recipe and expand the in-app demo chat.",
            "",
            "## Todos",
            "- [x] Shared menu CSS tokens",
            "- [ ] Expand demo chat markup",
            "- [ ] Wire empty-state + command palette entry",
            "</plan>",
            "<plan_saved path=\".shape/plans/menu-system-cleanup.md\" title=\"Menu system cleanup\" />",
            "<todos title=\"Demo\">",
            "<todo id=\"1\" status=\"done\">Polish composer model menu</todo>",
            "<todo id=\"2\" status=\"active\">Fix workflow search pills</todo>",
            "<todo id=\"3\" status=\"pending\">Ship fuller demo chat</todo>",
            "</todos>",
            "<review_debate>",
            "## Verdict",
            "The menu recipe is coherent; keep density IDE-like and avoid per-call-site shadows.",
            "",
            "**Strengths**",
            "- Shared tokens for radius and padding",
            "- Cursor-like elevated shell without glass",
            "",
            "**Risks**",
            "- Wide menus still need layout-only width overrides",
            "</review_debate>",
            "",
            "Here’s a compressed tour of the surfaces this chat can render:",
            "",
            "- **Thought / Worked / Status** — muted workflow chrome",
            "- **Read / Search / Grep / LS / Web** — collapsed counts",
            "- **Edit / pending approval / create / rename / delete**",
            "- **Terminal / run / git / tool_result / plan / todos**",
            "- **Review debate**",
            "",
            "I’ll keep going with a long thread so you can stress-test scrolling.",
        ].join("\n"),
        timestamp: now - 3500,
        model: "auto",
        stats: {
            timeMs: 52000,
            tokens: 4200,
            inputTokens: 3000,
            outputTokens: 1200,
            usedAuto: true,
            reasoningEffort: "high",
            mode: "Code",
        },
    });

    const topics = [
        ["How do composer attachments process images?", "Images go through a short processing state with a spinner, then fade into a thumbnail pill once compression finishes."],
        ["What about fonts uploaded to chat?", "Binary assets like fonts are inlined as usable attached_asset blocks so the agent can write them into the project when asked."],
        ["Explain Fast vs effort.", "Fast is OpenRouter priority routing. Effort (Low / Medium / High / Max) is independent — the label shows both, e.g. Max Fast."],
        ["Where does Design Mode live?", "It replaces the main area like Settings — layers in the sidebar, canvas in the center, no full-screen Run overlay."],
        ["How do background runs work?", "DevRunHost keeps a PTY alive, buffers scrollback, and Terminal attaches later without spawning a duplicate shell."],
        ["Repo sidebar context menus?", "Repos and chats have ⋯ menus plus right-click: open, new chat, reveal, remove / rename / delete."],
        ["Integrations vs MCP?", "Integrations is the deeper UI; connecting still writes servers into mcp.json for compatibility."],
        ["Settings card layout?", "Sections are card groups without divider lines; enabled switches use the accent color."],
        ["Tab context menus?", "Chat tabs support Open, Close, Close Others, and Close All from the context menu."],
        ["Demo length?", "This thread pads with many turns so virtualization and scroll anchoring can be validated."],
    ] as const;

    // Pad with many back-and-forth turns for long-chat scroll testing.
    for (let i = 0; i < 48; i++) {
        const [q, a] = topics[i % topics.length];
        const t = now - 3400 + i * 55;
        messages.push({
            role: "user",
            content: `${i + 1}. ${q}${i > 9 ? ` (turn ${i + 1})` : ""}`,
            timestamp: t,
        });
        messages.push({
            role: "assistant",
            content: [
                i % 5 === 0 ? "<think>Gathering a concise answer for the demo scroll stress test.</think>\n" : "",
                i % 7 === 0 ? `<status>Answering item ${i + 1}</status>\n` : "",
                i % 11 === 0 ? `<cat>features/chat/lib/demo-chat.ts</cat>\n` : "",
                a,
                i % 6 === 0
                    ? `\n\n\`\`\`ts\n// demo snippet ${i + 1}\nexport const turn = ${i + 1};\n\`\`\``
                    : "",
                i % 9 === 0
                    ? `\n\nAlso note: long replies should not jump the viewport when new content streams in.`
                    : "",
            ].join(""),
            timestamp: t + 20,
            model: i % 3 === 0 ? "auto" : "google/gemini-2.5-flash",
            stats: {
                timeMs: 4000 + (i % 8) * 500,
                tokens: 200 + i * 3,
                inputTokens: 120 + i,
                outputTokens: 80 + i * 2,
                usedAuto: i % 3 === 0,
                reasoningEffort: i % 4 === 0 ? "max" : "high",
                mode: i % 5 === 0 ? "Ask" : "Code",
            },
        });
    }

    messages.push({
        role: "user",
        content: "Show the question UI and an Ask-mode wrap-up too.",
        timestamp: now - 90,
    });

    messages.push({
        role: "assistant",
        content: [
            "<think>One more turn with a question block and Ask-mode framing.</think>",
            "<question>",
            "Which surface should we stress-test next?",
            "<option>Keep scrolling</option>",
            "<option>Open settings</option>",
            "<option>New chat</option>",
            "</question>",
            "",
            "Pick an option above — this is the real question block at the end of a long demo thread.",
        ].join("\n"),
        timestamp: now - 20,
        model: "auto",
        stats: {
            timeMs: 8000,
            tokens: 600,
            inputTokens: 400,
            outputTokens: 200,
            usedAuto: true,
            reasoningEffort: "high",
            mode: "Ask",
        },
    });

    return messages;
}
