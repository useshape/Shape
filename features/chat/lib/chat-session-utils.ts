import type { ChatMessage } from "@/lib/backend";
import { parseMessageContent, type Chunk } from "../ui/md/renderer";
import {
    clearAllProposedEdits,
    editContentHash,
    getResolvedContentHash,
    isFileResolved,
    setProposedEdit,
} from "./proposed-edits";

export function resolveChatFilePath(filePath: string, projectPath: string | null): string {
    if (/^[a-zA-Z]:[\\\/]/.test(filePath) || filePath.startsWith("/")) return filePath;
    if (!projectPath) return filePath;
    return `${projectPath.replace(/\\/g, "/")}/${filePath.replace(/\\/g, "/")}`.replace(/\/+/g, "/");
}

export function syncProposedEditsFromMessages(history: ChatMessage[], convId: string | null) {
    clearAllProposedEdits();
    if (!convId) return;

    type Step = { id: string; file: string; original: string; replacement: string };
    const stepsByFile = new Map<string, Step[]>();

    history.forEach((m, msgIdx) => {
        if (m.role !== "assistant") return;
        const chunks = parseMessageContent(m.content);
        chunks
            .filter((c): c is Chunk & { file: string } => c.type === "edit" && !!c.file)
            .forEach((e, editIdx) => {
                const list = stepsByFile.get(e.file) || [];
                list.push({
                    id: `msg-${msgIdx}-${editIdx}-${e.file}`,
                    file: e.file,
                    original: e.original || "",
                    replacement: e.replacement || "",
                });
                stepsByFile.set(e.file, list);
            });
    });

    stepsByFile.forEach((steps, file) => {
        const resolvedHash = getResolvedContentHash(convId, file);
        let startIdx = 0;
        if (resolvedHash) {
            let lastResolved = -1;
            for (let i = 0; i < steps.length; i++) {
                if (editContentHash(steps[i].replacement) === resolvedHash) {
                    lastResolved = i;
                }
            }
            if (lastResolved >= 0) {
                if (lastResolved === steps.length - 1) return;
                startIdx = lastResolved + 1;
            } else if (isFileResolved(convId, file, steps[steps.length - 1]?.replacement)) {
                return;
            } else if (isFileResolved(convId, file)) {
                startIdx = Math.max(0, steps.length - 1);
            }
        } else if (isFileResolved(convId, file, steps[steps.length - 1]?.replacement)) {
            return;
        }

        const chain = steps.slice(startIdx);
        if (chain.length === 0) return;
        const latest = chain[chain.length - 1];
        setProposedEdit(file, {
            original: latest.original,
            replacement: latest.replacement,
            baseline: chain[0].original,
            id: latest.id,
        });
    });
}

export function groupChatMessages(messages: ChatMessage[]) {
    return messages.reduce((groups, msg, msgIdx) => {
        if (msg.role === "user" || groups.length === 0) {
            groups.push([{ msg, msgIdx }]);
        } else {
            groups[groups.length - 1].push({ msg, msgIdx });
        }
        return groups;
    }, [] as { msg: ChatMessage; msgIdx: number }[][]);
}
