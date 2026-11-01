import type { Chunk } from "@/features/chat/ui/md/renderer";

const PIXEL =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";

const QUESTIONS = JSON.stringify({
    questions: [
        {
            id: "q1",
            prompt: "Which layout should this dashboard use?",
            options: [
                { id: "split", label: "Split panes", recommended: true },
                { id: "stack", label: "Single column" },
            ],
        },
    ],
    answers: null,
});

/** One realistic sample per parser chunk type. `questions` emits as `question`. */
export const SHOWCASE_MARKERS: Record<Chunk["type"], string> = {
    text: [
        "## Response blocks",
        "",
        "A short paragraph, a [link](https://shape.app), and a table:",
        "",
        "| File | Status |",
        "| --- | --- |",
        "| `auth.ts` | ready |",
        "",
        "```ts",
        "export function greet(name: string) {",
        "  return `hello ${name}`;",
        "}",
        "```",
        "",
    ].join("\n"),
    think: "<think>Checking the auth helper and the session cookie path.</think>",
    thought: "<thought>The middleware already validates the token.</thought>",
    edit: '<edit file="src/auth/session.ts"><original>return user;</original><replacement>if (!user) throw new Error("unauthenticated");\nreturn user;</replacement></edit>',
    edit_pending:
        '<edit_pending id="edit-1" file="src/lib/api.ts" status="pending"><original>fetch(url)</original><replacement>fetch(url, { cache: "no-store" })</replacement></edit_pending>',
    search: '<search query="session cookie">src/auth</search>',
    grep: '<grep query="middleware">src</grep>',
    status: "<status>Indexed the workspace</status>",
    web_search: '<web_search query="tauri save dialog webview2">tauri save dialog webview2</web_search>',
    web_result:
        '<web_result query="tauri save dialog webview2">### Tauri save dialog\nURL: https://v2.tauri.app/plugin/dialog/\nUse the native save() dialog.\n---\n### WebView2 download\nURL: https://learn.microsoft.com/en-us/microsoft-edge/webview2/\nData URLs skip Save As.</web_result>',
    search_result: '<search_result query="openFile">shape/src-tauri/src/commands/fs</search_result>',
    web_visit: '<web_visit url="https://v2.tauri.app/plugin/dialog/" host="v2.tauri.app" title="Dialog plugin" />',
    inspect_runtime: '<inspect_runtime url="http://localhost:3000" kind="console">No errors</inspect_runtime>',
    terminal_command:
        '<terminal_command id="cmd-1" status="completed" exit="0">bun run test -- tests/features/showcase.test.ts</terminal_command>',
    git_operation: '<git_operation op="status" status="completed">On branch main</git_operation>',
    run: "<run>bun run lint</run>",
    ls: "<ls>src/auth</ls>",
    cat: '<cat path="src/auth/session.ts" start="1" end="24"></cat>',
    create_file: '<create_file path="src/lib/save.ts">export function save() {}</create_file>',
    mkdir: '<mkdir path="src/lib/ui"></mkdir>',
    delete_file: '<delete_file path="tmp/scratch.ts"></delete_file>',
    rename_file: '<rename_file from="a.ts" to="b.ts"></rename_file>',
    rename_chat: "<rename_chat>Components</rename_chat>",
    tool_result: "<content>hidden scaffold</content>",
    plan: '<plan title="Ship the save dialog">1. Decode the data URL\n2. Open Save As\n3. Write bytes</plan>',
    plan_saved: '<plan_saved path=".shape/plan.md" title="Ship the save dialog"># Ship the save dialog\n\nWrite bytes after the dialog.</plan_saved>',
    todos: '<todos title="Follow-ups"><todo id="t1" status="done">Native save dialog</todo><todo id="t2" status="active">Component samples</todo><todo id="t3" status="pending">Overflow fade</todo></todos>',
    attached_image: `<attached_image name="shot.png">${PIXEL}</attached_image>`,
    sent_file: `<sent_file name="notes.txt" type="text/plain" title="Meeting notes">data:text/plain;base64,aGVsbG8=</sent_file>`,
    subagent: '<subagent id="sa-1" agent="Explore" model="auto" status="done">Found the download handler in sent-file.tsx.</subagent>',
    subagent_ref: '<subagent_ref id="sa-1" agent="Explore" task="Find the download handler" status="done" />',
    design_previews:
        '<design_previews id="dp-1" status="done" selected="calm"><design_preview id="calm" name="Calm" style="minimal" kind="html" width="800" height="480">&lt;div style="padding:24px"&gt;Calm layout&lt;/div&gt;</design_preview></design_previews>',
    review_debate:
        '<review_debate model="auto" status="done">**Confirmed issues**\n- Save As never opens for data URLs\n\n**Disputed points**\n- Whether blob URLs need the same path</review_debate>',
    persona_review:
        '<persona_review id="pr-1" status="done" url="http://localhost:3000">The download control is easy to miss on a dense message.</persona_review>',
    question: `<questions id="ask-1" status="pending">\n${QUESTIONS}\n</questions>`,
    questions: `<questions id="ask-2" status="pending">\n${QUESTIONS}\n</questions>`,
    plugin_call:
        '<plugin_call id="pl-1" toolkit="linear" name="Create issue" status="ok">Created SHAPE-12</plugin_call>',
    plugin_connect: '<plugin_connect toolkit="github" name="GitHub" />',
    generated_svg:
        '<generated_svg prompt="a small mark" credits="1" media_id="svg-1" model="mini"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><circle cx="24" cy="24" r="16" fill="#6b7280"/></svg></generated_svg>',
    generated_image: `<generated_image prompt="a gray pixel" credits="1" media_id="img-1" model="klein">${PIXEL}</generated_image>`,
    generated_audio: '<generated_audio prompt="a short tone" media_id="aud-1" model="mini"></generated_audio>',
    browse_session:
        '<browse_session id="br-1" status="done" url="https://v2.tauri.app" title="Tauri">{"image":"","console":[]}</browse_session>',
    chart: '<chart>{"title":"Turns","points":[{"label":"Mon","value":4},{"label":"Tue","value":7},{"label":"Wed","value":5}]}</chart>',
    insight_card: "<insight_card>Most downloads fail because WebView2 ignores the download attribute on data URLs.</insight_card>",
    place_map: "<place_map>ignored</place_map>",
    shown_images: `<shown_images>{"query":"mark","images":[{"title":"Pixel","url":"${PIXEL}","source":"fixture"}]}</shown_images>`,
};

export const SHOWCASE_MARKUP = Object.values(SHOWCASE_MARKERS).join("\n\n");

export function emittedShowcaseType(type: Chunk["type"]): Chunk["type"] {
    return type === "questions" ? "question" : type;
}
