/**
 * Remark plugin: stamp mdast nodes with data-source-start / data-source-end
 * so the rendered preview can map DOM selections back to markdown offsets.
 */

type MdastNode = {
    type?: string;
    position?: { start?: { offset?: number }; end?: { offset?: number } };
    data?: { hProperties?: Record<string, unknown> };
    children?: MdastNode[];
};

function stamp(node: MdastNode) {
    const start = node.position?.start?.offset;
    const end = node.position?.end?.offset;
    if (typeof start === "number" && typeof end === "number" && end > start) {
        const data = node.data ?? (node.data = {});
        const props = data.hProperties ?? (data.hProperties = {});
        props["data-source-start"] = String(start);
        props["data-source-end"] = String(end);
    }
    if (Array.isArray(node.children)) {
        for (const child of node.children) stamp(child);
    }
}

export function remarkSourcePositions() {
    return (tree: MdastNode) => {
        stamp(tree);
    };
}
