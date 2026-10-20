import { isTalkWorkspace, type WorkspaceModeId } from "@/lib/ui/workspace-mode";

/** Disk store for Chat / Cowork / GTM conversations (independent of a coding folder). */
export const TALK_CONVERSATION_STORE = "__shape_talk__";

export function conversationStorePath(
    mode: WorkspaceModeId,
    projectPath: string | null | undefined,
): string | null {
    if (isTalkWorkspace(mode)) return TALK_CONVERSATION_STORE;
    return projectPath ?? null;
}
