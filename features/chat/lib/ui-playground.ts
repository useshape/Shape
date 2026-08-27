import type { ChatMessage } from "@/lib/backend/types";

function playgroundHtmlPreview(): string {
    const html = `<!doctype html><html style="height:100%"><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;overflow:hidden;background:#171717;color:#e8e8e8;font-family:system-ui,sans-serif}
body{display:flex;align-items:center;justify-content:center}
section{border:1px solid #2e2e2e;border-radius:12px;padding:16px;width:min(240px,90%)}
p{margin:0;font-size:12px;color:#9a9a9a}
h1{margin:8px 0 0;font-size:20px;font-weight:600}
.total{margin:8px 0 0;font-size:13px;color:#b3b3b3}
</style></head><body><section><p>Preview</p><h1>Checkout</h1><p class="total">Total $42.00</p></section></body></html>`;
    return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function playgroundDiagram(): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="128"><rect width="240" height="128" rx="8" fill="#2a2a2a"/><text x="24" y="72" fill="#c8c8c8" font-family="sans-serif" font-size="16">Diagram</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Fixture transcript covering every chat UI block the agent can emit. */
export const UI_PLAYGROUND_MESSAGES: ChatMessage[] = [
    {
        role: "user",
        content: "Show every chat UI element so I can restyle them.",
        timestamp: 1,
    },
    {
        role: "assistant",
        timestamp: 2,
        model: "playground",
        stats: {
            timeMs: 18400,
            tokens: 1280,
            inputTokens: 900,
            outputTokens: 380,
        },
        content: [
            "<think>Checking how the current chat layout maps onto the mockup before listing every surface.</think>",
            "<search query=\"authentication\">auth middleware</search>",
            "<grep query=\"useAuth\">src/lib/auth.ts</grep>",
            '<cat path="item.sql" start="1" end="40"></cat>',
            "<ls>.</ls>",
            "I'll remove live eval completely, then expand the MCP catalog with real brand icons fetched from official sources.",
            "<status>Chat context summarized</status>",
            '<web_search query="Neon MCP OAuth">Searching</web_search>',
            [
                '<web_result query="Neon MCP OAuth">',
                "### Neon MCP",
                "URL: https://neon.tech",
                "Hosted Postgres with MCP.",
                "---",
                "### GitHub MCP",
                "URL: https://github.com",
                "Issues and pull requests.",
                "</web_result>",
            ].join("\n"),
            '<web_visit url="https://useshape.org" host="useshape.org" title="Shape" />',
            '<mcp_call server="neon" name="Neon" tool="inspect" title="Inspecting public.users">',
            "id | email",
            "1  | ada@example.com",
            "</mcp_call>",
            '<mcp_call server="github" name="GitHub" tool="search_issues" title="Searched Issues">',
            "Found 3 open issues tagged auth.",
            "</mcp_call>",
            '<mcp_auth server="supabase" name="Supabase" />',
            '<edit file="payments.tsx"><original>const total = 0;\n</original><replacement>const total = items.reduce((sum, item) => sum + item.amount, 0);\n</replacement></edit>',
            '<create_file>lib/format-money.ts</create_file>',
            "<mkdir>src/components/billing</mkdir>",
            "<rename_file>old-checkout.tsx -> checkout.tsx</rename_file>",
            "<delete_file>legacy-cart.ts</delete_file>",
            '<git_operation op="status" status="completed">[unstaged] M payments.tsx\n[staged] A lib/format-money.ts</git_operation>',
            '<git_operation op="stage" status="completed">Staged lib/format-money.ts</git_operation>',
            '<git_operation op="log" status="completed">[commit] a1b2c3d|2026-08-20|Ada|Add checkout totals</git_operation>',
            '<git_operation op="branches" status="completed">[*] main\n[ ] feat/billing</git_operation>',
            [
                '<git_operation op="diff" status="completed">[file] payments.tsx',
                "@@ -1,3 +1,4 @@",
                "-const total = 0;",
                "+const total = items.reduce((sum, item) => sum + item.amount, 0);",
                "</git_operation>",
            ].join("\n"),
            [
                '<terminal_command status="completed" id="pg-term-ok" exit="0">npm test',
                "PASS  tests/checkout.test.ts",
                "</terminal_command>",
            ].join("\n"),
            [
                '<terminal_command status="pending" id="pg-term-ask">rm -rf dist',
                "Awaiting approval: destructive command",
                "</terminal_command>",
            ].join("\n"),
            [
                '<edit_pending id="pg-edit" file="layout.tsx" status="pending">',
                "<original>export default function Layout({ children }) {\n  return children;\n}\n</original>",
                "<replacement>export default function Layout({ children }) {\n  return <main>{children}</main>;\n}\n</replacement>",
                "</edit_pending>",
            ].join("\n"),
            "<rename_chat>Chat UI playground</rename_chat>",
            [
                '<todos title="Ship billing">',
                '<todo id="1" status="done">Read checkout flow</todo>',
                '<todo id="2" status="active">Wire Stripe MCP</todo>',
                '<todo id="3" status="pending">Write tests</todo>',
                '<todo id="4" status="cancelled">Old paypal path</todo>',
                "</todos>",
            ].join("\n"),
            [
                '<plan title="Billing rollout">',
                '<step status="done">Audit current checkout</step>',
                '<step status="active">Add MCP connections</step>',
                '<step status="pending">Ship</step>',
                "</plan>",
            ].join("\n"),
            '<plan_saved path=".shape/plans/billing-rollout.md" title="Billing rollout" />',
            [
                "<question>Which database should we inspect first?",
                "<option>Neon</option>",
                "<option>Supabase</option>",
                "<option>Skip for now</option>",
                "</question>",
            ].join("\n"),
            [
                "<review_debate>",
                "The checkout totals look correct, but the MCP connect card should stay left-aligned with file reads. Keep brand pills compact and do not indent the step list under Worked for.",
                "</review_debate>",
            ].join("\n"),
            `<attached_image name="diagram.png">${playgroundDiagram()}</attached_image>`,
            [
                '<design_previews generating="true" selected="">',
                "</design_previews>",
            ].join("\n"),
            [
                '<design_previews selected="hero">',
                `<design_preview id="hero" name="Hero" style="Minimal" path="${playgroundHtmlPreview()}" width="640" height="360" kind="html" />`,
                "</design_previews>",
            ].join("\n"),
            "",
            "Here is the full set of chat surfaces in one turn: file reads stay plain text, MCP calls use brand pills, and connect prompts sit on the left.",
            "",
            "```ts",
            "export function total(items: { amount: number }[]) {",
            "  return items.reduce((sum, item) => sum + item.amount, 0);",
            "}",
            "```",
            "",
            "> Quoted note from the plan.",
            "",
            "- Bullet one",
            "- Bullet two",
            "",
            "https://useshape.org",
        ].join("\n"),
    },
];

export const UI_PLAYGROUND_TITLE = "Chat UI playground";
