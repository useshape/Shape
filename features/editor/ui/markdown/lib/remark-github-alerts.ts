/**
 * Turn GitHub alert blockquotes (`> [!NOTE]`) into styled nodes.
 * Walks mdast without extra unist deps.
 */

const ALERTS = ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"] as const;
export type GithubAlertKind = (typeof ALERTS)[number];

type MdastNode = {
    type?: string;
    value?: string;
    children?: MdastNode[];
    data?: { hName?: string; hProperties?: Record<string, unknown> };
};

const ALERT_RE = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i;

function firstTextNode(node: MdastNode | undefined): MdastNode | null {
    if (!node) return null;
    if (node.type === "text") return node;
    if (!node.children) return null;
    for (const child of node.children) {
        const found = firstTextNode(child);
        if (found) return found;
    }
    return null;
}

function stampAlert(blockquote: MdastNode, kind: GithubAlertKind) {
    const data = blockquote.data ?? (blockquote.data = {});
    data.hName = "blockquote";
    const props = data.hProperties ?? (data.hProperties = {});
    props["data-md-alert"] = kind;
}

function visit(node: MdastNode) {
    if (node.type === "blockquote" && Array.isArray(node.children) && node.children.length) {
        const first = firstTextNode(node.children[0]);
        const raw = first?.value ?? "";
        const match = raw.match(ALERT_RE);
        if (match && first) {
            const kind = match[1]!.toUpperCase() as GithubAlertKind;
            first.value = raw.slice(match[0].length);
            stampAlert(node, kind);
        }
    }
    if (Array.isArray(node.children)) {
        for (const child of node.children) visit(child);
    }
}

export function remarkGithubAlerts() {
    return (tree: MdastNode) => {
        visit(tree);
    };
}
