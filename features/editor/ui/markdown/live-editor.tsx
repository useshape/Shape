"use client";

import { useEffect, useRef, useState } from "react";
import { EditorSelection, EditorState, type Extension, type Range } from "@codemirror/state";
import {
    Decoration,
    type DecorationSet,
    EditorView,
    keymap,
    ViewPlugin,
    type ViewUpdate,
    WidgetType,
    drawSelection,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { markdown, markdownKeymap, markdownLanguage } from "@codemirror/lang-markdown";
import { tags as t } from "@lezer/highlight";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ICON_SIZE_SM, Icon } from "@/components/ui/icon";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { shapeEditorChrome } from "../codemirror/theme";

/*
 * Markdown that reads like a document while you type: markup is hidden on
 * every line except the ones you are editing, headings are sized, bullets
 * and checkboxes render as glyphs.
 */

class BulletWidget extends WidgetType {
    eq() {
        return true;
    }
    toDOM() {
        const el = document.createElement("span");
        el.className = "cm-md-bullet";
        el.textContent = "•";
        return el;
    }
    ignoreEvent() {
        return true;
    }
}

class CheckWidget extends WidgetType {
    constructor(readonly checked: boolean) {
        super();
    }
    eq(other: CheckWidget) {
        return other.checked === this.checked;
    }
    toDOM(view: EditorView) {
        const el = document.createElement("input");
        el.type = "checkbox";
        el.checked = this.checked;
        el.className = "cm-md-check";
        el.addEventListener("mousedown", (event) => {
            event.preventDefault();
            const pos = view.posAtDOM(el);
            view.dispatch({
                changes: { from: pos, to: pos + 3, insert: this.checked ? "[ ]" : "[x]" },
            });
        });
        return el;
    }
    ignoreEvent() {
        return false;
    }
}

class RuleWidget extends WidgetType {
    eq() {
        return true;
    }
    toDOM() {
        const el = document.createElement("span");
        el.className = "cm-md-rule";
        return el;
    }
    ignoreEvent() {
        return true;
    }
}

const hide = Decoration.replace({});
const bullet = Decoration.replace({ widget: new BulletWidget() });
const rule = Decoration.replace({ widget: new RuleWidget() });
const checked = Decoration.replace({ widget: new CheckWidget(true) });
const unchecked = Decoration.replace({ widget: new CheckWidget(false) });

const HEADING_LINE: Record<string, Decoration> = {};
for (let level = 1; level <= 6; level++) {
    const deco = Decoration.line({ class: `cm-md-h${level}` });
    HEADING_LINE[`ATXHeading${level}`] = deco;
    if (level <= 2) HEADING_LINE[`SetextHeading${level}`] = deco;
}
const codeLine = Decoration.line({ class: "cm-md-code" });
const fenceLine = Decoration.line({ class: "cm-md-code cm-md-fence" });
const quoteLine = Decoration.line({ class: "cm-md-quote" });

function activeLines(view: EditorView): Set<number> {
    const lines = new Set<number>();
    if (!view.hasFocus) return lines;
    const { doc } = view.state;
    for (const range of view.state.selection.ranges) {
        const from = doc.lineAt(range.from).number;
        const to = doc.lineAt(range.to).number;
        for (let n = from; n <= to; n++) lines.add(n);
    }
    return lines;
}

function buildDecorations(view: EditorView): DecorationSet {
    const ranges: Range<Decoration>[] = [];
    const { doc } = view.state;
    const active = activeLines(view);
    const isActive = (pos: number) => active.has(doc.lineAt(pos).number);
    const eachLine = (from: number, to: number, fn: (lineFrom: number, index: number, last: boolean) => void) => {
        const first = doc.lineAt(from).number;
        const last = doc.lineAt(Math.max(from, to - 1)).number;
        for (let n = first; n <= last; n++) fn(doc.line(n).from, n - first, n === last);
    };

    for (const { from, to } of view.visibleRanges) {
        syntaxTree(view.state).iterate({
            from,
            to,
            enter: (node) => {
                const name = node.name;
                const heading = HEADING_LINE[name];
                if (heading) {
                    ranges.push(heading.range(doc.lineAt(node.from).from));
                    return;
                }
                if (name === "FencedCode") {
                    eachLine(node.from, node.to, (lineFrom, index, last) => {
                        ranges.push((index === 0 || last ? fenceLine : codeLine).range(lineFrom));
                    });
                    return;
                }
                if (name === "Blockquote") {
                    eachLine(node.from, node.to, (lineFrom) => ranges.push(quoteLine.range(lineFrom)));
                    return;
                }
                if (name === "HorizontalRule") {
                    if (!isActive(node.from)) ranges.push(rule.range(node.from, node.to));
                    return;
                }
                if (isActive(node.from)) return;
                switch (name) {
                    case "HeaderMark": {
                        const trailingSpace = doc.sliceString(node.to, node.to + 1) === " ";
                        ranges.push(hide.range(node.from, trailingSpace ? node.to + 1 : node.to));
                        return;
                    }
                    case "ListMark": {
                        const next = node.node.nextSibling;
                        if (next?.name === "Task") {
                            const spaceAfter = doc.sliceString(node.to, node.to + 1) === " ";
                            ranges.push(hide.range(node.from, spaceAfter ? node.to + 1 : node.to));
                        } else if (!/\d/.test(doc.sliceString(node.from, node.to))) {
                            ranges.push(bullet.range(node.from, node.to));
                        }
                        return;
                    }
                    case "TaskMarker": {
                        const raw = doc.sliceString(node.from, node.to).toLowerCase();
                        ranges.push((raw.includes("x") ? checked : unchecked).range(node.from, node.to));
                        return;
                    }
                    case "EmphasisMark":
                    case "StrikethroughMark":
                    case "QuoteMark":
                    case "LinkMark":
                    case "URL":
                        ranges.push(hide.range(node.from, node.to));
                        return;
                    case "CodeMark":
                        if (node.node.parent?.name === "InlineCode") ranges.push(hide.range(node.from, node.to));
                        return;
                }
            },
        });
    }
    for (const { from, to } of view.visibleRanges) {
        let pos = from;
        while (pos <= to) {
            const line = doc.lineAt(pos);
            if (!active.has(line.number)) hideInlineHtml(line.text, line.from, ranges);
            pos = line.to + 1;
        }
    }
    return Decoration.set(ranges, true);
}

function hideInlineHtml(text: string, base: number, ranges: Range<Decoration>[]) {
    const blocked = (from: number, to: number) => ranges.some((range) => range.from < to && from < range.to);
    const add = (range: Range<Decoration>) => {
        if (!blocked(range.from, range.to)) ranges.push(range);
    };
    const patterns: RegExp[] = [
        /<u>([\s\S]*?)<\/u>/g,
        /<span style="color:(#[0-9a-fA-F]{3,8})">([\s\S]*?)<\/span>/g,
    ];
    for (const pattern of patterns) {
        for (const match of text.matchAll(pattern)) {
            const index = match.index ?? 0;
            const open = match[0].startsWith("<u>") ? "<u>" : match[0].slice(0, match[0].indexOf(">") + 1);
            const close = match[0].startsWith("<u>") ? "</u>" : "</span>";
            const inner = match[0].length - open.length - close.length;
            const openFrom = base + index;
            const innerFrom = openFrom + open.length;
            const innerTo = innerFrom + inner;
            const closeTo = innerTo + close.length;
            add(hide.range(openFrom, innerFrom));
            add(hide.range(innerTo, closeTo));
            if (inner > 0 && open !== "<u>") {
                const color = match[1] ?? "";
                add(Decoration.mark({ attributes: { style: `color: ${color}` } }).range(innerFrom, innerTo));
            } else if (inner > 0) {
                add(Decoration.mark({ class: "cm-md-u" }).range(innerFrom, innerTo));
            }
        }
    }
}

const livePreview = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;
        constructor(view: EditorView) {
            this.decorations = buildDecorations(view);
        }
        update(update: ViewUpdate) {
            if (update.docChanged || update.selectionSet || update.viewportChanged || update.focusChanged) {
                this.decorations = buildDecorations(update.view);
            }
        }
    },
    { decorations: (plugin) => plugin.decorations },
);

const proseHighlight = HighlightStyle.define([
    { tag: t.heading, fontWeight: "600", color: "var(--text-primary)" },
    { tag: t.strong, fontWeight: "600" },
    { tag: t.emphasis, fontStyle: "italic" },
    { tag: t.strikethrough, textDecoration: "line-through", color: "var(--text-muted)" },
    { tag: t.monospace, fontFamily: "var(--font-mono)", fontSize: "0.9em", color: "var(--text-secondary)" },
    { tag: t.link, color: "var(--accent-text)" },
    { tag: t.url, color: "var(--text-muted)" },
    { tag: t.quote, color: "var(--text-muted)" },
    { tag: t.list, color: "var(--text-muted)" },
    { tag: t.atom, color: "var(--text-muted)" },
    { tag: t.contentSeparator, color: "var(--text-disabled)" },
    { tag: t.processingInstruction, color: "var(--text-disabled)" },
    { tag: t.meta, color: "var(--text-disabled)" },
]);

const proseTheme = EditorView.theme({
    "&": {
        height: "100%",
        fontSize: "15px",
        backgroundColor: "transparent",
        color: "var(--text-primary)",
    },
    ".cm-scroller": {
        fontFamily: "var(--font-sans)",
        lineHeight: "1.65",
        overflow: "auto",
    },
    ".cm-content": {
        padding: "32px 0 160px",
        maxWidth: "760px",
        margin: "0 auto",
        caretColor: "var(--text-primary)",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-line": { padding: "1px 32px" },
    ".cm-cursor, .cm-dropCursor": { borderLeftWidth: "2px", borderLeftColor: "var(--text-primary)" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
        backgroundColor: "color-mix(in srgb, #e8c547 55%, transparent) !important",
    },
    ".cm-md-u": { textDecoration: "underline" },
    ".cm-md-h1": { fontSize: "1.85em", lineHeight: "1.3", paddingTop: "18px", paddingBottom: "6px" },
    ".cm-md-h2": { fontSize: "1.45em", lineHeight: "1.35", paddingTop: "14px", paddingBottom: "4px" },
    ".cm-md-h3": { fontSize: "1.2em", lineHeight: "1.4", paddingTop: "10px", paddingBottom: "2px" },
    ".cm-md-h4, .cm-md-h5, .cm-md-h6": { fontSize: "1.05em", paddingTop: "8px" },
    ".cm-md-code": {
        fontFamily: "var(--font-mono)",
        fontSize: "13px",
        lineHeight: "1.6",
        backgroundColor: "var(--surface-1)",
        marginLeft: "32px",
        marginRight: "32px",
        paddingLeft: "12px",
        paddingRight: "12px",
    },
    ".cm-md-fence": { color: "var(--text-disabled)" },
    ".cm-md-quote": {
        borderLeft: "3px solid var(--border)",
        marginLeft: "32px",
        paddingLeft: "14px",
        color: "var(--text-muted)",
    },
    ".cm-md-bullet": {
        display: "inline-block",
        width: "1.1em",
        color: "var(--text-muted)",
        textAlign: "center",
    },
    ".cm-md-check": {
        width: "15px",
        height: "15px",
        margin: "0 8px -2px 0",
        accentColor: "var(--accent)",
        cursor: "pointer",
    },
    ".cm-md-rule": {
        display: "inline-block",
        width: "100%",
        height: "1px",
        verticalAlign: "middle",
        backgroundColor: "var(--border)",
    },
});

function wrapSelection(view: EditorView, mark: string, end = mark): boolean {
    view.dispatch(
        view.state.changeByRange((range) => {
            const text = view.state.sliceDoc(range.from, range.to);
            const wrapped = text.length >= mark.length + end.length && text.startsWith(mark) && text.endsWith(end);
            const insert = wrapped ? text.slice(mark.length, text.length - end.length) : `${mark}${text}${end}`;
            return {
                changes: { from: range.from, to: range.to, insert },
                range: wrapped
                    ? EditorSelection.range(range.from, range.from + insert.length)
                    : EditorSelection.range(range.from + mark.length, range.from + mark.length + text.length),
            };
        }),
        { scrollIntoView: true },
    );
    return true;
}

const TEXT_COLORS = ["#f2f2f2", "#f5c542", "#5ee0a0", "#6eb5ff", "#ff7a7a", "#c084fc"];

function liveMarkdownExtensions(onChange: (doc: string) => void, raw: boolean): Extension[] {
    return [
        markdown({ base: markdownLanguage }),
        history(),
        drawSelection({ cursorBlinkRate: 1100 }),
        EditorView.lineWrapping,
        ...(raw ? shapeEditorChrome() : [livePreview, proseTheme, syntaxHighlighting(proseHighlight)]),
        keymap.of([
            ...markdownKeymap,
            ...defaultKeymap,
            ...historyKeymap,
            indentWithTab,
            { key: "Mod-b", run: (view) => wrapSelection(view, "**") },
            { key: "Mod-i", run: (view) => wrapSelection(view, "*") },
            { key: "Mod-u", run: (view) => wrapSelection(view, "<u>", "</u>") },
        ]),
        EditorView.contentAttributes.of({ spellcheck: raw ? "false" : "true" }),
        EditorView.updateListener.of((update) => {
            if (update.docChanged) onChange(update.state.doc.toString());
        }),
    ];
}

type Bubble = { top: number; left: number; above: boolean };

export function MarkdownLiveEditor({
    content,
    onChange,
    className,
    raw = false,
}: {
    content: string;
    onChange: (next: string) => void;
    className?: string;
    /** Source view. The document view hides markdown marks until the line is edited. */
    raw?: boolean;
}) {
    const hostRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onChangeRef = useRef(onChange);
    const lastEmitted = useRef(content);
    const contentRef = useRef(content);
    contentRef.current = content;
    const [bubble, setBubble] = useState<Bubble | null>(null);
    useEffect(() => {
        onChangeRef.current = onChange;
    }, [onChange]);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        const view = new EditorView({
            state: EditorState.create({
                doc: contentRef.current,
                extensions: [
                    ...liveMarkdownExtensions((doc) => {
                        lastEmitted.current = doc;
                        onChangeRef.current(doc);
                    }, raw),
                    EditorView.updateListener.of((update) => {
                        if (!update.selectionSet && !update.docChanged && !update.geometryChanged) return;
                        const range = update.view.state.selection.main;
                        if (range.empty) {
                            setBubble(null);
                            return;
                        }
                        const start = update.view.coordsAtPos(range.from);
                        const end = update.view.coordsAtPos(range.to);
                        if (!start || !end) {
                            setBubble(null);
                            return;
                        }
                        const top = Math.min(start.top, end.top);
                        const above = top > 56;
                        setBubble({
                            top: above ? top : Math.max(start.bottom, end.bottom),
                            left: (Math.min(start.left, end.left) + Math.max(start.right, end.right)) / 2,
                            above,
                        });
                    }),
                ],
            }),
            parent: host,
        });
        lastEmitted.current = contentRef.current;
        viewRef.current = view;
        return () => {
            view.destroy();
            viewRef.current = null;
            setBubble(null);
        };
    }, [raw]);

    // External updates (file reloaded, agent rewrote the plan) replace the doc
    // unless they merely echo what the user just typed.
    useEffect(() => {
        const view = viewRef.current;
        if (!view || content === lastEmitted.current) return;
        const current = view.state.doc.toString();
        if (current === content) return;
        lastEmitted.current = content;
        view.dispatch({
            changes: { from: 0, to: current.length, insert: content },
            selection: { anchor: Math.min(view.state.selection.main.anchor, content.length) },
        });
    }, [content]);

    const run = (fn: (view: EditorView) => boolean) => {
        const view = viewRef.current;
        if (!view) return;
        view.focus();
        fn(view);
    };

    return (
        <div className={cn("relative flex h-full min-h-0 flex-col", className)}>
            <div ref={hostRef} className="min-h-0 flex-1" />
            {bubble && !raw ? (
                <FormatBar
                    top={bubble.top}
                    left={bubble.left}
                    above={bubble.above}
                    onFormat={(mark, end) => run((view) => wrapSelection(view, mark, end))}
                    onHeading={(level) => run(setHeading(level))}
                    onList={(prefix) => run(prefixLines(prefix))}
                    onLink={() => run(insertLink)}
                    onColor={(color) => run((view) => wrapSelection(view, `<span style="color:${color}">`, "</span>"))}
                />
            ) : null}
        </div>
    );
}

function FormatBar({
    top,
    left,
    above,
    onFormat,
    onHeading,
    onList,
    onLink,
    onColor,
}: {
    top: number;
    left: number;
    above: boolean;
    onFormat: (mark: string, end?: string) => void;
    onHeading: (level: 0 | 1 | 2 | 3) => void;
    onList: (prefix: string) => void;
    onLink: () => void;
    onColor: (color: string) => void;
}) {
    return (
        <div
            className={cn(
                "fixed z-50 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-border-subtle bg-surface-3 px-1 py-1 shadow-sm",
                above ? "-translate-y-[calc(100%+8px)]" : "translate-y-2",
            )}
            style={{ top, left }}
            onMouseDown={(event) => event.preventDefault()}
        >
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 font-normal">
                        Text
                        <Icon icon="alt-arrow-down" size={ICON_SIZE_SM} className="text-text-muted" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-36">
                    <DropdownMenuItem onClick={() => onHeading(0)}>Text</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onHeading(1)}>Heading 1</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onHeading(2)}>Heading 2</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onHeading(3)}>Heading 3</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <span className="mx-0.5 h-4 w-px bg-border-subtle" />
            <Mark icon="text-bold" label="Bold" onClick={() => onFormat("**")} />
            <Mark icon="text-italic" label="Italic" onClick={() => onFormat("*")} />
            <Mark icon="text-underline" label="Underline" onClick={() => onFormat("<u>", "</u>")} />
            <Mark icon="text-cross" label="Strikethrough" onClick={() => onFormat("~~")} />
            <span className="mx-0.5 h-4 w-px bg-border-subtle" />
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="List">
                        <Icon icon="list" size={ICON_SIZE_SM} />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-40">
                    <DropdownMenuItem onClick={() => onList("- ")}>
                        <Icon icon="checklist" size={ICON_SIZE_SM} />
                        Bulleted list
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onList("1. ")}>
                        <Icon icon="list" size={ICON_SIZE_SM} />
                        Numbered list
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="Text color">
                        <span className="size-3.5 rounded-full bg-text-primary" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                    <div className="flex items-center gap-1 px-1">
                        {TEXT_COLORS.map((color) => (
                            <button
                                key={color}
                                type="button"
                                aria-label={color}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => onColor(color)}
                                className="size-5 rounded-full border border-border-subtle"
                                style={{ backgroundColor: color }}
                            />
                        ))}
                    </div>
                </DropdownMenuContent>
            </DropdownMenu>
            <Mark icon="link" label="Link" onClick={onLink} />
        </div>
    );
}

function Mark({ icon, label, onClick }: { icon: "text-bold" | "text-italic" | "text-underline" | "text-cross" | "link"; label: string; onClick: () => void }) {
    return (
        <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={label} title={label} onClick={onClick}>
            <Icon icon={icon} size={ICON_SIZE_SM} />
        </Button>
    );
}

function setHeading(level: 0 | 1 | 2 | 3) {
    const prefix = level === 0 ? "" : `${"#".repeat(level)} `;
    return (view: EditorView) => {
        view.dispatch(
            view.state.changeByRange((range) => {
                const doc = view.state.doc;
                const fromLine = doc.lineAt(range.from);
                const toLine = doc.lineAt(range.to);
                const changes = [];
                let delta = 0;
                for (let n = fromLine.number; n <= toLine.number; n++) {
                    const line = doc.line(n);
                    const stripped = line.text.replace(/^#{1,6}\s+/, "");
                    changes.push({ from: line.from, to: line.to, insert: prefix + stripped });
                    delta += prefix.length - (line.text.length - stripped.length);
                }
                return {
                    changes,
                    range: EditorSelection.range(range.from, Math.max(range.from, range.to + delta)),
                };
            }),
        );
        return true;
    };
}

function prefixLines(prefix: string) {
    return (view: EditorView) => {
        view.dispatch(
            view.state.changeByRange((range) => {
                const doc = view.state.doc;
                const fromLine = doc.lineAt(range.from);
                const toLine = doc.lineAt(range.to);
                const changes = [];
                for (let n = fromLine.number; n <= toLine.number; n++) {
                    const line = doc.line(n);
                    changes.push({ from: line.from, insert: prefix });
                }
                return { changes, range: EditorSelection.range(range.from + prefix.length, range.to + prefix.length * (toLine.number - fromLine.number + 1)) };
            }),
        );
        return true;
    };
}

function insertLink(view: EditorView): boolean {
    const range = view.state.selection.main;
    const selected = view.state.sliceDoc(range.from, range.to) || "text";
    const insert = `[${selected}](url)`;
    const urlFrom = range.from + selected.length + 3;
    view.dispatch({
        changes: { from: range.from, to: range.to, insert },
        selection: EditorSelection.range(urlFrom, urlFrom + 3),
    });
    return true;
}
