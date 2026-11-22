/**
 * Compare the pre-send token estimate with tiktoken o200k_base
 * on the validation prompts. Exits 1 when the mean absolute error
 * is worse than 15% (below an 85% read of the real count).
 *
 * Requires Python `tiktoken` on PATH.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { estimateTokens } from "../lib/chat/estimate-tokens.ts";

const root = dirname(fileURLToPath(import.meta.url));
const promptDir = join(root, "prompts");
const files = readdirSync(promptDir).filter((name) => name.endsWith(".txt"));
const validation = files.map((name) => ({
    name,
    text: readFileSync(join(promptDir, name), "utf8"),
}));

/**
 * Fresh messages. Not the validation prompts, and not a target to tune against:
 * a miss here means the rule is wrong, not that this sentence needs a special case.
 */
const heldOut = [
    ["bug", "The send button stays on the arrow while the draft is still in the box. After forty words it should shimmer and the button should show the split spinner until the tighten pass ends."],
    ["bug-long", "The send button still shows the arrow after I hit it, and the draft stays in the box until the whole turn finishes. I want the text to shimmer only while the tighten pass is running, then the box should clear even if the model is still writing the reply. If I start typing a new message during that turn, don't wipe what I just typed. This happens on long messages, the ones over forty words, and it does not happen on a short thanks. Also the credit tooltip on hover still counts a short reply, which is fine, but it should change when I switch from the cheap model to the expensive one."],
    ["review", "Can you look at the pull request and keep it to one line at the top? I only care about the CI status. The description can fade out with a gradient so the rest is still there if you scroll, but don't add a timeline, reviewers, or labels. Put the changed files in the menu. Icons should be filled, not outline. Leave the open and closed filter alone."],
    ["snippet", "The handler in features/chat/ui/composer/input.tsx reads the draft on every keystroke and calls estimateSendCredits. That part is fine. What breaks is when the attachment is an image: we add a flat 765 tokens and the tooltip jumps. A text file should stay on the byte estimate. Please don't change the chip layout while you're in there."],
    ["sql-ask", "I need a query that lists accounts created after January 2024 which still have a null deleted_at, joined to their latest invoice. Return the email, the invoice total, and the created date. Skip test accounts where the email ends with @example.com. Order by the invoice total descending and stop at 50 rows."],
    ["css", ".panel { margin: 8px 12px; border-radius: 16px; background: #141416; }"],
    ["sql", "SELECT id, email FROM users WHERE deleted_at IS NULL AND created_at > '2024-01-01' ORDER BY created_at DESC LIMIT 50;"],
    ["ramble", "i dont need the timeline or the reviewers or the labels. just one line at the top with the checks, and the description can fade out with a gradient. files can live in the menu. please dont add tabs back."],
    ["sidebar", "When the sidebar closes, the breadcrumb and the sidebar button should stay on the same line as the traffic lights. Right now the breadcrumb snaps left and then the button drops a pixel. The terminal button belongs next to the panel icon, and the avatar stays last."],
    ["markdown", "## What I expected\n\n- The box clears when tightening finishes\n- The spinner stays on the send button\n- A new draft typed during the turn is kept\n\n## What happened\n\nThe shimmer never starts, and the old text sits there until the assistant is done writing.\n"],
    ["patch", "I'm looking at this and the count is wrong when the line starts with spaces:\n\n    if (user == null) return;\n    const name = user.name;\n    console.log(name);\n\nThe blank line between the guard and the log should not be two tokens, and the indent should not be one token per space. Don't rewrite the function, just tell me why the estimate jumps."],
    ["url", "The docs at https://example.com/docs/chat/send?lang=en#credits still say the estimate includes the whole tool loop. It doesn't. Update that section, and fix the link in README.md so it points at the same heading."],
    ["numbers", "Build 2024.11.3-beta.1 is using about 3,000 tokens on a 12px gap and a #141416 panel. The $20.00 plan includes 1_000_000 tokens, which is not what the tooltip shows for a two-sentence message."],
    ["word", "Ship"],
    ["short-ok", "ok ship it"],
    ["short-no", "no, leave the sidebar where it is"],
    ["path", "Open C:\\Users\\User\\Desktop\\shape-monorepo\\shape\\features\\chat\\ui\\composer\\input.tsx and leave the file tree out."],
    ["emoji", "Looks good 👍 but the gap next to the traffic lights is still uneven."],
    ["fr", "Le bouton doit rester sur la même ligne que les feux de la fenêtre, même quand la barre latérale est fermée."],
    ["de", "Die Schaltfläche soll auf derselben Zeile bleiben, auch wenn die Seitenleiste geschlossen ist und der Text daneben nicht springen darf."],
    ["blank-lines", "First line.\n\nSecond line after a blank line.\nThird."],
    ["long-id", "supercalifragilisticexpialidocious_repository_configuration_override"],
].map(([name, text]) => ({ name, text }));

const texts = [...validation, ...heldOut];

const py = spawnSync(
    "python",
    [
        "-c",
        `
import json, sys, tiktoken
enc = tiktoken.get_encoding("o200k_base")
texts = json.load(sys.stdin)
print(json.dumps([len(enc.encode(t)) for t in texts]))
`,
    ],
    { input: JSON.stringify(texts.map((item) => item.text)), encoding: "utf8" },
);
if (py.status !== 0) {
    console.error(py.stderr || "tiktoken is not available");
    process.exit(1);
}
const actual = JSON.parse(py.stdout);

function report(title, rows) {
    let abs = 0;
    let worst = 0;
    let worstName = "";
    console.log(`\n${title}`);
    for (const row of rows) {
        const err = Math.abs(row.est - row.actual) / Math.max(1, row.actual);
        abs += err;
        if (err > worst) {
            worst = err;
            worstName = row.name;
        }
        console.log(`${row.name}\test ${row.est}\tactual ${row.actual}\t${(err * 100).toFixed(1)}%`);
    }
    const mean = abs / rows.length;
    console.log(`mean absolute error ${(mean * 100).toFixed(1)}%  worst ${(worst * 100).toFixed(1)}% (${worstName})`);
    return mean;
}

const scored = texts.map((item, i) => ({
    name: item.name,
    est: estimateTokens(item.text),
    actual: actual[i],
    held: i >= validation.length,
}));
const validationMean = report("validation prompts", scored.filter((row) => !row.held));
const heldMean = report("held-out messages", scored.filter((row) => row.held));
if (validationMean > 0.15 || heldMean > 0.15) process.exit(1);
