"use client";

import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import { stripLeakedToolCode, stripOrphanThinkTags } from "./stream";
import { ChatMarkdown } from "./view";

import {
    isRenderableWorkflowBlock,
    WORKFLOW_CHUNK_TYPES,
} from '../blocks/workflow';
import { TurnWorkflowSummary } from '../blocks/turn';
import { GeneratingIndicator } from '../blocks/generating';
import { PlanningBlock, PlanSavedBlock } from '../blocks/plan';
import { DesignPreviewGallery, type DesignPreviewItem } from '../blocks/gallery';
import { ReviewDebatePanel } from '../blocks/debate';
import { QuestionBlock } from '../blocks/question';
import { hostnameOf } from '@/lib/favicon';

function hostnameFromUrl(url: string): string {
    return hostnameOf(url);
}

const TERMINAL_STATUS_RANK: Record<string, number> = {
    pending: 1,
    blocked: 2,
    running: 3,
    background: 3,
    rejected: 4,
    error: 4,
    cancelled: 4,
    failed: 5,
    completed: 5,
};

/** Pending edit lifecycle rank: later states replace the pending card. */
const EDIT_PENDING_STATUS_RANK: Record<string, number> = {
    pending: 1,
    cancelled: 2,
    rejected: 3,
    applied: 4,
};

/** Keep one terminal_command / edit_pending block per id (or per command when pending). Prefer higher status. */
export function dedupeTerminalChunks(chunks: Chunk[]): Chunk[] {
    const skip = new Set<number>();

    const rank = (chunk: Chunk) =>
        (chunk.type === 'edit_pending' ? EDIT_PENDING_STATUS_RANK : TERMINAL_STATUS_RANK)[
            chunk.commandStatus || ''
        ] ?? 0;

    const byId = new Map<string, number>();
    chunks.forEach((chunk, index) => {
        if ((chunk.type !== 'terminal_command' && chunk.type !== 'edit_pending') || !chunk.commandId) return;
        const key = `${chunk.type}:${chunk.commandId}`;
        const existing = byId.get(key);
        if (existing === undefined) {
            byId.set(key, index);
            return;
        }
        if (rank(chunk) >= rank(chunks[existing])) {
            skip.add(existing);
            byId.set(key, index);
        } else {
            skip.add(index);
        }
    });

    const byPendingCommand = new Map<string, number>();
    chunks.forEach((chunk, index) => {
        if (skip.has(index)) return;
        if (chunk.type !== 'terminal_command' || chunk.commandStatus !== 'pending') return;
        const cmd = chunk.command?.trim();
        if (!cmd) return;
        const existing = byPendingCommand.get(cmd);
        if (existing === undefined) {
            byPendingCommand.set(cmd, index);
            return;
        }
        skip.add(existing);
        byPendingCommand.set(cmd, index);
    });

    return chunks.filter((_, index) => !skip.has(index));
}

export type Chunk = {
    type: 'text' | 'edit' | 'edit_pending' | 'search' | 'grep' | 'status' | 'web_search' | 'think' | 'thought' | 'search_result' | 'web_result' | 'web_visit' | 'terminal_command' | 'git_operation' | 'run' | 'ls' | 'cat' | 'create_file' | 'mkdir' | 'delete_file' | 'rename_file' | 'rename_chat' | 'tool_result' | 'plan' | 'plan_saved' | 'todos' | 'attached_image' | 'subagent' | 'subagent_ref' | 'design_previews' | 'review_debate' | 'question';
    content?: string;
    file?: string;
    query?: string;
    original?: string;
    replacement?: string;
    isGenerating?: boolean;
    command?: string;
    commandId?: string;
    commandStatus?: string;
    commandReason?: string;
    /** Terminal session id for live output correlation. */
    sessionId?: number;
    /** Exit code once a terminal command finished. */
    exitCode?: number;
    gitOp?: string;
    gitStatus?: string;
    catStartLine?: number;
    catEndLine?: number;
    designPreviews?: DesignPreviewItem[];
    selectedConcept?: string;
    questionOptions?: string[];
    todos?: Array<{ id: string; label: string; status: "done" | "active" | "pending" | "cancelled" }>;
    visitUrl?: string;
    visitHost?: string;
    visitTitle?: string;
};

export function parseMessageContent(text: string): Chunk[] {
    text = stripLeakedToolCode(text);
    const chunks: Chunk[] = [];
    let currentIndex = 0;

    const getInnerTagContent = (block: string, tag: string) => {
        const startTag = `<${tag}>`;
        const endTag = `</${tag}>`;
        const start = block.indexOf(startTag);
        if (start === -1) return undefined;
        const end = block.indexOf(endTag, start);
        if (end === -1) return block.slice(start + startTag.length).replace(/^\n|\n$/g, '');
        return block.slice(start + startTag.length, end).replace(/^\n|\n$/g, '');
    };

    const parseEditBlock = (block: string, isGenerating: boolean): Chunk => {
        const fileMatch = block.match(/<edit\s+file="([^"]*)"/);
        const file = fileMatch ? fileMatch[1] : undefined;
        return {
            type: 'edit',
            file,
            original: getInnerTagContent(block, 'original') || '',
            replacement: getInnerTagContent(block, 'replacement') || '',
            isGenerating,
        };
    };

    /** Edit staged for user approval (require-edit-approval mode). */
    const parseEditPendingBlock = (block: string, isGenerating: boolean): Chunk => {
        const idMatch = block.match(/\bid="([^"]*)"/);
        const fileMatch = block.match(/\bfile="([^"]*)"/);
        const statusMatch = block.match(/\bstatus="([^"]*)"/);
        return {
            type: 'edit_pending',
            file: fileMatch ? fileMatch[1] : undefined,
            commandId: idMatch ? idMatch[1] : undefined,
            commandStatus: statusMatch ? statusMatch[1] : 'pending',
            original: getInnerTagContent(block, 'original') || '',
            replacement: getInnerTagContent(block, 'replacement') || '',
            isGenerating,
        };
    };

    const parsePlanSavedBlock = (block: string): Chunk => {
        const pathMatch = block.match(/path="([^"]*)"/);
        const titleMatch = block.match(/title="([^"]*)"/);
        return {
            type: 'plan_saved',
            file: pathMatch ? pathMatch[1] : undefined,
            content: titleMatch ? titleMatch[1] : 'Implementation Plan',
        };
    };

    const parsePlanBlock = (block: string): Chunk => {
        const titleMatch = block.match(/<plan\s+title="([^"]*)"/);
        const title = titleMatch ? titleMatch[1] : 'Plan';
        return {
            type: 'plan',
            content: block,
            file: title,
        };
    };

    const parseTodosBlock = (block: string): Chunk => {
        const titleMatch = block.match(/<todos\s+title="([^"]*)"/);
        const title = titleMatch ? titleMatch[1] : 'Todos';
        const todoMatches = [...block.matchAll(/<todo\s+([^>]*)>([\s\S]*?)<\/todo>/g)];
        const todos = todoMatches.map((m) => {
            const attrs = m[1] ?? '';
            const id = attrs.match(/id="([^"]*)"/)?.[1] ?? '';
            const statusRaw = (attrs.match(/status="([^"]*)"/)?.[1] ?? 'pending').toLowerCase();
            const status: "done" | "active" | "pending" | "cancelled" =
                statusRaw === 'completed' || statusRaw === 'done' || statusRaw === 'complete'
                    ? 'done'
                    : statusRaw === 'in_progress' || statusRaw === 'active'
                        ? 'active'
                        : statusRaw === 'cancelled' || statusRaw === 'canceled'
                            ? 'cancelled'
                            : 'pending';
            return { id, label: (m[2] ?? '').trim(), status };
        });
        return {
            type: 'todos',
            content: title,
            todos,
        };
    };

    const pushOrReplaceTodos = (chunk: Chunk) => {
        const idx = chunks.findIndex((c) => c.type === 'todos');
        if (idx >= 0) chunks[idx] = chunk;
        else chunks.push(chunk);
    };

    const parseSubagentRefBlock = (tagFull: string, isGenerating: boolean): Chunk => {
        const getAttr = (name: string) => {
            const m = tagFull.match(new RegExp(`${name}="([^"]*)"`));
            return m ? m[1] : '';
        };
        return {
            type: 'subagent_ref',
            file: getAttr('id'),
            query: getAttr('agent'),
            command: getAttr('model'),
            content: getAttr('task'),
            commandStatus: getAttr('status') || (isGenerating ? 'running' : 'done'),
            isGenerating,
        };
    };

    const parseGitOperationBlock = (tagFull: string, content: string, isGenerating: boolean): Chunk => {
        const opMatch = tagFull.match(/op="([^"]+)"/);
        const statusMatch = tagFull.match(/status="([^"]+)"/);
        return {
            type: 'git_operation',
            content,
            gitOp: opMatch ? opMatch[1] : undefined,
            gitStatus: statusMatch ? statusMatch[1] : (isGenerating ? 'running' : 'completed'),
            isGenerating,
        };
    };

    const parseCatBlock = (tagFull: string, content: string, isGenerating: boolean): Chunk => {
        const getAttr = (name: string) => {
            const m = tagFull.match(new RegExp(`${name}="([^"]*)"`));
            return m ? m[1] : undefined;
        };
        const path = getAttr('path') || content.trim();
        const start = getAttr('start');
        const end = getAttr('end');
        return {
            type: 'cat',
            content: path,
            catStartLine: start ? Number.parseInt(start, 10) : undefined,
            catEndLine: end ? Number.parseInt(end, 10) : undefined,
            isGenerating,
        };
    };

    const parseDesignPreviewsBlock = (block: string): Chunk => {
        const selectedMatch = block.match(/selected="([^"]*)"/);
        const selected = selectedMatch?.[1] ?? "";
        const previews: DesignPreviewItem[] = [];
        const re = /<design_preview\s+([^>]+)\/>/g;
        let match: RegExpExecArray | null;
        while ((match = re.exec(block)) !== null) {
            const attrs = match[1];
            const get = (name: string) => attrs.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? "";
            const kindAttr = get("kind");
            const id = get("id");
            const path = get("path");
            if (!id.trim() || !path.trim()) continue;
            if (previews.some((p) => p.id === id)) continue;
            previews.push({
                id,
                name: get("name"),
                style: get("style"),
                path,
                width: Number.parseInt(get("width"), 10) || 1280,
                height: Number.parseInt(get("height"), 10) || 800,
                renderMs: Number.parseInt(get("render_ms"), 10) || undefined,
                kind: kindAttr === "html" || kindAttr === "png" ? kindAttr : undefined,
            });
        }
        return { type: "design_previews", designPreviews: previews, selectedConcept: selected };
    };

    const parseReviewDebateBlock = (block: string): Chunk => {
        const inner = block
            .replace(/^<review_debate>\s*/i, "")
            .replace(/\s*<\/review_debate>$/i, "")
            .trim();
        return { type: "review_debate", content: inner };
    };

    const parseQuestionBlock = (block: string): Chunk => {
        const options: string[] = [];
        const optionRe = /<option>([\s\S]*?)<\/option>/gi;
        let match: RegExpExecArray | null;
        while ((match = optionRe.exec(block)) !== null) {
            const opt = match[1].trim();
            if (opt) options.push(opt);
        }
        const inner = block
            .replace(/^<question[^>]*>/i, "")
            .replace(/\s*<\/question>$/i, "");
        const questionText = inner.replace(/<option>[\s\S]*?<\/option>/gi, "").trim();
        return {
            type: "question",
            content: questionText,
            questionOptions: options,
        };
    };

    const parseWebVisitBlock = (tagFull: string, isGenerating: boolean): Chunk => {
        const get = (name: string) => tagFull.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? "";
        const url = get("url");
        const host = get("host") || hostnameFromUrl(url);
        const title = get("title") || host;
        return {
            type: "web_visit",
            visitUrl: url,
            visitHost: host,
            visitTitle: title,
            content: host,
            isGenerating,
        };
    };

    while (currentIndex < text.length) {
        const searchTags = [
            { type: 'edit', start: '<edit', end: '</edit>' },
            // Longer tag wins the same-index tie-break against '<edit'.
            { type: 'edit_pending', start: '<edit_pending', end: '</edit_pending>' },
            { type: 'design_previews', start: '<design_previews', end: '</design_previews>' },
            { type: 'review_debate', start: '<review_debate', end: '</review_debate>' },
            { type: 'question', start: '<question', end: '</question>' },
            { type: 'search_result', start: '<search_result', end: '</search_result>' },
            { type: 'search', start: '<search', end: '</search>' },
            { type: 'grep', start: '<grep', end: '</grep>' },
            { type: 'web_search', start: '<web_search', end: '</web_search>' },
            { type: 'status', start: '<status', end: '</status>' },
            { type: 'think', start: '<think>', end: '</think>' },
            { type: 'think', start: '<think', end: '</think>' },
            { type: 'thought', start: '<thought', end: '</thought>' },
            { type: 'plan', start: '<plan', end: '</plan>' },
            { type: 'plan_saved', start: '<plan_saved', end: '</plan_saved>' },
            { type: 'todos', start: '<todos', end: '</todos>' },
            { type: 'web_result', start: '<web_result', end: '</web_result>' },
            { type: 'web_visit', start: '<web_visit', end: '</web_visit>' },
            { type: 'ls', start: '<ls', end: '</ls>' },
            { type: 'cat', start: '<cat', end: '</cat>' },
            { type: 'run', start: '<run', end: '</run>' },
            { type: 'create_file', start: '<create_file', end: '</create_file>' },
            { type: 'mkdir', start: '<mkdir', end: '</mkdir>' },
            { type: 'delete_file', start: '<delete_file', end: '</delete_file>' },
            { type: 'rename_file', start: '<rename_file', end: '</rename_file>' },
            { type: 'rename_chat', start: '<rename_chat', end: '</rename_chat>' },
            { type: 'subagent_ref', start: '<subagent_ref', end: '/>' },
            { type: 'subagent', start: '<subagent', end: '</subagent>' },
            { type: 'terminal_command', start: '<terminal_command', end: '</terminal_command>' },
            { type: 'git_operation', start: '<git_operation', end: '</git_operation>' },
            // Hidden tool/result scaffolding (Shape UI + cross-model leak grammars).
            // Defense-in-depth with stripLeakedToolCode — never render as prose.
            { type: 'tool_result', start: '<tool_result', end: '</tool_result>' },
            { type: 'tool_result', start: '<terminal_read', end: '</terminal_read>' },
            { type: 'tool_result', start: '<terminal_input', end: '</terminal_input>' },
            { type: 'tool_result', start: '<list_terminals', end: '</list_terminals>' },
            { type: 'tool_result', start: '<tool_code', end: '</tool_code>' },
            { type: 'tool_result', start: '<tool_call', end: '</tool_call>' },
            { type: 'tool_result', start: '<tool_calls', end: '</tool_calls>' },
            { type: 'tool_result', start: '<tool_response', end: '</tool_response>' },
            { type: 'tool_result', start: '<function_call', end: '</function_call>' },
            { type: 'tool_result', start: '<function_calls', end: '</function_calls>' },
            { type: 'tool_result', start: '<function_response', end: '</function_response>' },
            { type: 'tool_result', start: '<minimax:tool_call', end: '</minimax:tool_call>' },
            { type: 'tool_result', start: '<invoke', end: '</invoke>' },
            { type: 'tool_result', start: '<parameter', end: '</parameter>' },
            { type: 'tool_result', start: '<arg_key', end: '</arg_key>' },
            { type: 'tool_result', start: '<arg_value', end: '</arg_value>' },
            { type: 'tool_result', start: '<pre_dispatch_explanation', end: '</pre_dispatch_explanation>' },
            { type: 'tool_result', start: '<tools', end: '</tools>' },
            { type: 'tool_result', start: '<new_path', end: '</new_path>' },
            { type: 'tool_result', start: '<content', end: '</content>' },
            { type: 'tool_result', start: '<analysis', end: '</analysis>' },
            { type: 'tool_result', start: '<file_content', end: '</file_content>' },
            { type: 'attached_image', start: '<attached_image', end: '</attached_image>' }
        ];

        let firstMatch: { type: string, index: number, startTag: string, endTag: string } | null = null;
        for (const tag of searchTags) {
            const index = text.indexOf(tag.start, currentIndex);
            if (index !== -1) {
                if (
                    !firstMatch
                    || index < firstMatch.index
                    || (index === firstMatch.index && tag.start.length > firstMatch.startTag.length)
                ) {
                    firstMatch = { type: tag.type, index, startTag: tag.start, endTag: tag.end };
                }
            }
        }

        if (!firstMatch) {
            const tail = stripOrphanThinkTags(text.slice(currentIndex));
            if (tail) chunks.push({ type: 'text', content: tail });
            break;
        }

        if (firstMatch.index > currentIndex) {
            const segment = stripOrphanThinkTags(text.slice(currentIndex, firstMatch.index));
            if (segment) chunks.push({ type: 'text', content: segment });
        }

        const gtIndex = text.indexOf('>', firstMatch.index);
        let contentStartIndex: number;
        let endIndex: number;

        if (gtIndex === -1) {
            contentStartIndex = text.length;
            endIndex = -1;
        } else {
            contentStartIndex = gtIndex + 1;
            endIndex = text.indexOf(firstMatch.endTag, contentStartIndex);
        }

        if (endIndex === -1) {
            const content = text.slice(contentStartIndex);
            const fullTag = text.slice(firstMatch.index);
            if (firstMatch.type === 'edit') {
                chunks.push(parseEditBlock(fullTag, true));
            } else if (firstMatch.type === 'edit_pending') {
                chunks.push(parseEditPendingBlock(fullTag, true));
            } else if (firstMatch.type === 'plan') {
                chunks.push(parsePlanBlock(fullTag));
            } else if (firstMatch.type === 'plan_saved') {
                chunks.push(parsePlanSavedBlock(fullTag));
            } else if (firstMatch.type === 'todos') {
                pushOrReplaceTodos(parseTodosBlock(fullTag));
            } else if (firstMatch.type === 'terminal_command') {
                const tagFull = text.slice(firstMatch.index, contentStartIndex);
                const statusMatch = tagFull.match(/status="([^"]+)"/);
                const idMatch = tagFull.match(/id="([^"]+)"/);
                const sessionMatch = tagFull.match(/session="(\d+)"/);
                const exitMatch = tagFull.match(/exit="(-?\d+)"/);
                const lines = content.split('\n').filter(Boolean);
                const cmd = lines[0]?.trim() || '';
                const reasonLine = lines.find(l => l.includes('Awaiting approval:') || l.includes('Blocked:'));
                const reason = reasonLine?.replace(/^.*?(Awaiting approval:|Blocked:)\s*/, '').trim();
                chunks.push({
                    type: 'terminal_command',
                    content,
                    command: cmd,
                    commandId: idMatch ? idMatch[1] : undefined,
                    commandStatus: statusMatch ? statusMatch[1] : 'pending',
                    commandReason: reason,
                    sessionId: sessionMatch ? Number(sessionMatch[1]) : undefined,
                    exitCode: exitMatch ? Number(exitMatch[1]) : undefined,
                    isGenerating: true,
                });
            } else if (firstMatch.type === 'git_operation') {
                const tagFull = text.slice(firstMatch.index, contentStartIndex);
                chunks.push(parseGitOperationBlock(tagFull, content, true));
            } else if (firstMatch.type === 'cat') {
                const tagFull = text.slice(firstMatch.index, contentStartIndex);
                chunks.push(parseCatBlock(tagFull, content, true));
            } else if (firstMatch.type === 'subagent_ref') {
                const tagFull = text.slice(firstMatch.index, gtIndex + 1);
                chunks.push(parseSubagentRefBlock(tagFull, true));
            } else if (firstMatch.type === 'design_previews') {
                chunks.push(parseDesignPreviewsBlock(text.slice(firstMatch.index)));
            } else if (firstMatch.type === 'review_debate') {
                chunks.push(parseReviewDebateBlock(text.slice(firstMatch.index)));
            } else if (firstMatch.type === 'question') {
                chunks.push(parseQuestionBlock(text.slice(firstMatch.index)));
            } else if (firstMatch.type === 'run') {
                chunks.push({
                    type: 'run',
                    content,
                    command: content.trim(),
                    isGenerating: true,
                });
            } else if (firstMatch.type === 'web_result' || firstMatch.type === 'search_result') {
                const tagFull = text.slice(firstMatch.index, contentStartIndex);
                const queryMatch = tagFull.match(/query="([^"]+)"/);
                chunks.push({
                    type: firstMatch.type as Chunk['type'],
                    content,
                    query: queryMatch ? queryMatch[1] : undefined,
                    isGenerating: true
                });
            } else if (firstMatch.type === 'web_visit') {
                const tagFull = text.slice(firstMatch.index, contentStartIndex);
                chunks.push(parseWebVisitBlock(tagFull, true));
            } else {
                chunks.push({
                    type: firstMatch.type as Chunk['type'],
                    content,
                    isGenerating: true,
                    command: firstMatch.type === 'terminal_command' ? content : undefined
                });
            }
            break;
        } else {
            const content = text.slice(contentStartIndex, endIndex);
            const fullBlock = text.slice(firstMatch.index, endIndex + firstMatch.endTag.length);
            if (firstMatch.type === 'edit') {
                chunks.push(parseEditBlock(fullBlock, false));
            } else if (firstMatch.type === 'edit_pending') {
                chunks.push(parseEditPendingBlock(fullBlock, false));
            } else if (firstMatch.type === 'plan') {
                chunks.push(parsePlanBlock(fullBlock));
            } else if (firstMatch.type === 'plan_saved') {
                chunks.push(parsePlanSavedBlock(fullBlock));
            } else if (firstMatch.type === 'todos') {
                pushOrReplaceTodos(parseTodosBlock(fullBlock));
            } else if (firstMatch.type === 'terminal_command') {
                const tagFull = text.slice(firstMatch.index, contentStartIndex);
                const statusMatch = tagFull.match(/status="([^"]+)"/);
                const idMatch = tagFull.match(/id="([^"]+)"/);
                const sessionMatch = tagFull.match(/session="(\d+)"/);
                const exitMatch = tagFull.match(/exit="(-?\d+)"/);
                const lines = content.split('\n').filter(Boolean);
                const cmd = lines[0]?.trim() || '';
                const reasonLine = lines.find(l => l.includes('Awaiting approval:') || l.includes('Blocked:'));
                const reason = reasonLine?.replace(/^.*?(Awaiting approval:|Blocked:)\s*/, '').trim();
                chunks.push({
                    type: 'terminal_command',
                    content,
                    command: cmd,
                    commandId: idMatch ? idMatch[1] : undefined,
                    commandStatus: statusMatch ? statusMatch[1] : 'completed',
                    commandReason: reason,
                    sessionId: sessionMatch ? Number(sessionMatch[1]) : undefined,
                    exitCode: exitMatch ? Number(exitMatch[1]) : undefined,
                    isGenerating: false,
                });
            } else if (firstMatch.type === 'git_operation') {
                const tagFull = text.slice(firstMatch.index, contentStartIndex);
                chunks.push(parseGitOperationBlock(tagFull, content, false));
            } else if (firstMatch.type === 'cat') {
                const tagFull = text.slice(firstMatch.index, contentStartIndex);
                chunks.push(parseCatBlock(tagFull, content, false));
            } else if (firstMatch.type === 'subagent_ref') {
                const tagFull = text.slice(firstMatch.index, endIndex + firstMatch.endTag.length);
                chunks.push(parseSubagentRefBlock(tagFull, false));
            } else if (firstMatch.type === 'design_previews') {
                chunks.push(parseDesignPreviewsBlock(fullBlock));
            } else if (firstMatch.type === 'review_debate') {
                chunks.push(parseReviewDebateBlock(fullBlock));
            } else if (firstMatch.type === 'question') {
                chunks.push(parseQuestionBlock(fullBlock));
            } else if (firstMatch.type === 'run') {
                chunks.push({
                    type: 'run',
                    content,
                    command: content.trim(),
                    isGenerating: false,
                });
            } else if (firstMatch.type === 'web_result' || firstMatch.type === 'search_result') {
                const tagFull = text.slice(firstMatch.index, contentStartIndex);
                const queryMatch = tagFull.match(/query="([^"]+)"/);
                chunks.push({
                    type: firstMatch.type as Chunk['type'],
                    content,
                    query: queryMatch ? queryMatch[1] : undefined,
                    isGenerating: false
                });
            } else if (firstMatch.type === 'web_visit') {
                const tagFull = text.slice(firstMatch.index, contentStartIndex);
                chunks.push(parseWebVisitBlock(tagFull, false));
            } else {
                chunks.push({
                    type: firstMatch.type as Chunk['type'],
                    content,
                    isGenerating: false,
                    command: firstMatch.type === 'terminal_command' ? content : undefined
                });
            }
            currentIndex = endIndex + firstMatch.endTag.length;
        }
    }

    return dedupeTerminalChunks(chunks);
}

/** Merge consecutive plain-text segments so markdown renders as one block. */
function mergeAdjacentTextChunks(chunks: Chunk[]): Chunk[] {
    const merged: Chunk[] = [];
    for (const chunk of chunks) {
        const prev = merged[merged.length - 1];
        if (chunk.type === "text" && prev?.type === "text") {
            prev.content = `${prev.content || ""}${chunk.content || ""}`;
            if (chunk.isGenerating) prev.isGenerating = true;
        } else {
            merged.push({ ...chunk });
        }
    }
    return merged;
}

export type WebSearchResultItem = { title: string; url: string; snippet: string };

function parseWebResults(blockContent: string): WebSearchResultItem[] {
    const results: WebSearchResultItem[] = [];
    const blocks = blockContent.split('---').filter(Boolean);
    blocks.forEach(block => {
        const titleMatch = block.match(/### (.*)/);
        const urlMatch = block.match(/URL: (.*)/);
        const text = block.replace(/### .*/, '').replace(/URL: .*/, '').trim();
        if (titleMatch || urlMatch) {
            results.push({
                title: titleMatch ? titleMatch[1].trim() : 'Result',
                url: urlMatch ? urlMatch[1].trim() : '',
                snippet: text
            });
        }
    });
    return results;
}

/** Collect unique web search/visit hit URLs from a message for the footer sources menu. */
export function extractWebSearchResults(content: string): WebSearchResultItem[] {
    const chunks = parseMessageContent(content);
    const results: WebSearchResultItem[] = [];
    const seen = new Set<string>();
    for (const item of chunks) {
        if (item.type === "web_visit") {
            const url = item.visitUrl || "";
            const key = url || item.visitHost || "";
            if (!key || seen.has(key)) continue;
            seen.add(key);
            results.push({
                title: item.visitTitle || item.visitHost || "Visited",
                url,
                snippet: item.visitHost ? `Visited ${item.visitHost}` : "Visited page",
            });
            continue;
        }
        if (item.type !== 'web_result' && item.type !== 'web_search') continue;
        if (item.type !== 'web_result') continue;
        for (const hit of parseWebResults(item.content || '')) {
            const key = hit.url || `${hit.title}:${hit.snippet}`;
            if (seen.has(key)) continue;
            seen.add(key);
            results.push(hit);
        }
    }
    return results;
}

/**
 * A message is rendered as a chronological sequence of segments: prose text,
 * runs of consecutive tool actions, plans, images. Tool runs stay in place
 * between the prose that surrounds them (like Cursor) instead of being hoisted
 * into one condensed dropdown at the top of the message.
 */
type Segment =
    | { kind: 'workflow'; blocks: Chunk[] }
    | { kind: 'chunk'; chunk: Chunk };

function buildSegments(chunks: Chunk[]): Segment[] {
    const segments: Segment[] = [];
    for (const chunk of chunks) {
        if (WORKFLOW_CHUNK_TYPES.has(chunk.type)) {
            const prev = segments[segments.length - 1];
            if (prev?.kind === 'workflow') {
                prev.blocks.push(chunk);
            } else {
                segments.push({ kind: 'workflow', blocks: [chunk] });
            }
        } else {
            segments.push({ kind: 'chunk', chunk });
        }
    }
    return segments;
}

export function MessageRenderer({
    content,
    isGenerating,
    activityLabel,
    isFileEditResolved,
    durationMs,
}: {
    content: string;
    isGenerating?: boolean;
    activityLabel?: string | null;
    isFileEditResolved?: (file: string, replacement?: string) => boolean;
    durationMs?: number;
}) {
    const chunks = useMemo(() => parseMessageContent(content), [content]);

    // Legacy <subagent_ref> / <subagent> tags are stripped from display.
    const contentChunks = useMemo(() => mergeAdjacentTextChunks(
        chunks.filter((c) => c.type !== 'subagent_ref' && c.type !== 'subagent'),
    ), [chunks]);

    const workflowBlocks = useMemo(
        () => contentChunks.filter(
            (c) => WORKFLOW_CHUNK_TYPES.has(c.type) && isRenderableWorkflowBlock(c, isGenerating),
        ),
        [contentChunks, isGenerating],
    );

    const proseChunks = useMemo(
        () => contentChunks.filter(
            (c) => !WORKFLOW_CHUNK_TYPES.has(c.type) || !isRenderableWorkflowBlock(c, isGenerating),
        ),
        [contentChunks, isGenerating],
    );

    const segments = useMemo(() => buildSegments(proseChunks), [proseChunks]);

    const lastSegment = segments[segments.length - 1];
    const proseIsStreaming =
        lastSegment?.kind === 'chunk'
        && lastSegment.chunk.type === 'text'
        && !!lastSegment.chunk.content?.trim();
    const hasPendingApproval = workflowBlocks.some(
        (b) =>
            (b.type === 'terminal_command' || b.type === 'edit_pending')
            && b.commandStatus === 'pending',
    );
    const showStatusLine =
        !!isGenerating
        && (
            hasPendingApproval
            || !!activityLabel?.trim()
            || (!proseIsStreaming && workflowBlocks.length === 0)
        );

    const lastWorkflowBlock = workflowBlocks[workflowBlocks.length - 1];
    const isThinking = !!isGenerating
        && (lastWorkflowBlock?.type === 'think' || lastWorkflowBlock?.type === 'thought')
        && !!lastWorkflowBlock.isGenerating;
    const statusLabel = hasPendingApproval
        ? "Waiting for approval"
        : (activityLabel ?? (isThinking ? "Thinking" : undefined));

    const renderedSegments = segments.map((segment, index) => {
        const isLastSegment = index === segments.length - 1;

        if (segment.kind === 'workflow') {
            return null;
        }

        const chunk = segment.chunk;
        if (chunk.type === 'text') {
            const text = chunk.content;
            if (!text?.trim()) return null;
            return (
                <div
                    key={`text-${index}`}
                    className={cn(
                        "text-sm font-normal text-text-primary leading-[var(--conversation-line-height)] mb-0 w-full overflow-hidden prose-compact chat-markdown",
                        isGenerating && isLastSegment && "animate-in fade-in duration-300",
                    )}
                >
                    <ChatMarkdown content={text} isGenerating={isGenerating} isLast={isLastSegment} />
                </div>
            );
        }
        if (chunk.type === 'plan_saved') {
            return (
                <PlanSavedBlock
                    key={`plan-saved-${index}`}
                    title={chunk.content || 'Implementation Plan'}
                    path={chunk.file || ''}
                />
            );
        }
        if (chunk.type === 'plan') {
            const blockContent = chunk.content || '';
            const title = chunk.file || 'Plan';
            const stepMatches = [...blockContent.matchAll(/<step\s+status="([^"]*)">([\s\S]*?)<\/step>/g)];
            const steps = stepMatches.map((m) => ({
                status: m[1] as "done" | "active" | "pending" | "cancelled",
                label: m[2].trim(),
            }));
            const completedCount = steps.filter((s) => s.status === 'done').length;
            return (
                <PlanningBlock
                    key={`plan-${index}`}
                    title={title}
                    steps={steps}
                    completedCount={completedCount}
                    totalCount={steps.length}
                    isGenerating={isGenerating}
                />
            );
        }
        if (chunk.type === 'todos' && chunk.todos?.length) {
            const steps = chunk.todos.map((t) => ({
                status: t.status,
                label: t.label,
            }));
            const completedCount = steps.filter((s) => s.status === 'done').length;
            return (
                <PlanningBlock
                    key={`todos-${index}`}
                    title={chunk.content || 'Todos'}
                    steps={steps}
                    completedCount={completedCount}
                    totalCount={steps.length}
                    isGenerating={isGenerating}
                />
            );
        }
        if (chunk.type === 'attached_image') {
            const src = chunk.content?.trim() || "";
            return (
                <button
                    key={`image-${index}`}
                    type="button"
                    className="my-2 block w-fit max-w-[240px] overflow-hidden rounded-lg border border-border-subtle"
                    onClick={() => {
                        if (!src) return;
                        window.dispatchEvent(
                            new CustomEvent("shape-open-media", {
                                detail: { src, kind: "image", title: "Attached" },
                            }),
                        );
                    }}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={src}
                        alt="Attached"
                        className="max-h-[160px] w-auto max-w-full object-contain block"
                        draggable={false}
                    />
                </button>
            );
        }
        if (chunk.type === 'design_previews' && chunk.designPreviews?.length) {
            return (
                <DesignPreviewGallery
                    key={`design-previews-${index}`}
                    previews={chunk.designPreviews}
                    selectedId={chunk.selectedConcept}
                />
            );
        }
        if (chunk.type === 'review_debate') {
            return (
                <ReviewDebatePanel
                    key={`review-debate-${index}`}
                    content={chunk.content || ''}
                />
            );
        }
        if (chunk.type === 'question') {
            return (
                <QuestionBlock
                    key={`question-${index}`}
                    question={chunk.content || ''}
                    options={chunk.questionOptions || []}
                    onAnswer={(answer) => {
                        window.dispatchEvent(
                            new CustomEvent("shape-question-answer", { detail: { answer } }),
                        );
                    }}
                />
            );
        }
        return null;
    });

    const answerContent = <>{renderedSegments}</>;

    return (
        <div className="flex flex-col gap-0 overflow-hidden">
            {workflowBlocks.length > 0 ? (
                <TurnWorkflowSummary
                    blocks={workflowBlocks}
                    isActive={isGenerating}
                    durationMs={durationMs}
                >
                    {answerContent}
                </TurnWorkflowSummary>
            ) : (
                answerContent
            )}

            {showStatusLine && (
                <GeneratingIndicator label={statusLabel} />
            )}
        </div>
    );
}

export { ChatMarkdown as StreamingMarkdown } from "./view";
