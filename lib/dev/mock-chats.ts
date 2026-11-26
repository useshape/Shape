"use client";

import { useSyncExternalStore } from "react";
import type { ChatMessage, Conversation } from "@/lib/backend/types";

const STORAGE_KEY = "shape:mock-chats";
const CHANGE_EVENT = "shape-mock-chats";
const MOCK_PREFIX = "mock-chat-";

const UNREAD_IDS = new Set(["mock-chat-export"]);

function devOnly(): boolean {
    return process.env.NODE_ENV !== "production";
}

export function isMockChatId(id: string | null | undefined): id is string {
    return devOnly() && !!id && id.startsWith(MOCK_PREFIX);
}

export function mockChatIsUnread(id: string): boolean {
    return UNREAD_IDS.has(id);
}

export function mockChatsEnabled(): boolean {
    if (!devOnly() || typeof window === "undefined") return false;
    try {
        return window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
        return false;
    }
}

export function subscribeMockChats(listener: () => void) {
    if (typeof window === "undefined") return () => {};
    const onStorage = (event: StorageEvent) => {
        if (event.key === STORAGE_KEY || event.key === null) listener();
    };
    window.addEventListener(CHANGE_EVENT, listener);
    window.addEventListener("storage", onStorage);
    return () => {
        window.removeEventListener(CHANGE_EVENT, listener);
        window.removeEventListener("storage", onStorage);
    };
}

export function useMockChats(): boolean {
    return useSyncExternalStore(subscribeMockChats, mockChatsEnabled, () => false);
}

export function setMockChats(on: boolean) {
    if (!devOnly() || typeof window === "undefined") return;
    try {
        if (on) window.localStorage.setItem(STORAGE_KEY, "1");
        else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
        /* ignore */
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function mockConversation(id: string, projectPath = ""): Conversation | null {
    if (!mockChatsEnabled() || !isMockChatId(id)) return null;
    return mockConversations(projectPath).find((chat) => chat.id === id) ?? null;
}

function msg(role: "user" | "assistant", content: string, hoursAgo: number): ChatMessage {
    return { role, content, timestamp: Date.now() - hoursAgo * 60 * 60 * 1000 };
}

function chat(
    id: string,
    title: string,
    projectPath: string,
    hoursAgo: number,
    history: ChatMessage[],
): Conversation {
    return {
        id,
        title,
        project_path: projectPath,
        timestamp: Date.now() - hoursAgo * 60 * 60 * 1000,
        kind: "chat",
        history,
    };
}

/** Sample sessions for screenshots. Built only while the dev toggle is on. */
export function mockConversations(projectPath: string): Conversation[] {
    if (!mockChatsEnabled()) return [];
    const path = projectPath || "";
    return [
        chat("mock-chat-tips", "Card tickets add the tip twice", path, 0.4, [
            msg("user", "A $42 lunch with a 15% tip is ringing up as $54.60. Cash tickets are fine. This is only happening when the customer pays by card.", 0.7),
            msg(
                "assistant",
                [
                    "<cat path=\"src/checkout/totals.ts\" start=\"30\" end=\"72\"></cat>",
                    "<subagent id=\"mock-sub-tips-card\" agent=\"Card totals\" status=\"running\" task=\"Recalculate a $42 ticket with a 15% tip\">",
                    "<cat path=\"src/checkout/card.ts\" start=\"18\" end=\"44\"></cat>",
                    "The card path adds the tip onto a total that already includes it.",
                    "</subagent>",
                    "<edit file=\"src/checkout/card.ts\">",
                    "<original>const charged = withTip(ticket.total) + ticket.tip;</original>",
                    "<replacement>const charged = withTip(ticket.subtotal);</replacement>",
                    "</edit>",
                    "",
                    "The card charge was tipping the already-tipped total. A $42 ticket with 15% now charges $48.30. Cash was already correct, so that path is unchanged.",
                ].join("\n"),
                0.4,
            ),
            msg("user", "Good. Don't touch the cash drawer, we counted it this morning.", 0.3),
            msg("assistant", "Left the cash path as it is. Only the card charge changed.", 0.25),
        ]),
        chat("mock-chat-pins", "Stops pile up on the city map", path, 2, [
            msg("user", "Zoomed into downtown, the delivery stops draw on top of each other. I can't tell which pin is 4th Street and which is the alley behind it.", 2.3),
            msg(
                "assistant",
                [
                    "<subagent id=\"mock-sub-pins-fixture\" agent=\"Downtown fixture\" status=\"error\" task=\"Load the downtown fixture and count overlaps\">",
                    "The fixture file is missing the last three stops, so the overlap count came back short.",
                    "</subagent>",
                    "",
                    "The cluster radius never shrinks as you zoom in, so two stops a block apart share a pin. I'm waiting on a complete downtown fixture before changing the radius.",
                ].join("\n"),
                2,
            ),
        ]),
        chat("mock-chat-empty", "Orders list flashes empty", path, 4, [
            msg("user", "When I open the orders page I see \"No orders yet\" for a second, then the rows pop in. We have 80 orders. It looks broken.", 4.4),
            msg(
                "assistant",
                [
                    "<edit file=\"src/orders/list.tsx\">",
                    "<original>{orders.length === 0 ? <Empty /> : <Rows orders={orders} />}</original>",
                    "<replacement>{loading ? <RowsSkeleton /> : orders.length === 0 ? <Empty /> : <Rows orders={orders} />}</replacement>",
                    "</edit>",
                    "",
                    "The empty state was rendering before the request finished. It now holds a skeleton until the rows arrive, and the empty message only shows when the list really is empty.",
                ].join("\n"),
                4,
            ),
        ]),
        chat("mock-chat-export", "CSV export drops the last order", path, 8, [
            msg("user", "I exported this morning's orders and the spreadsheet is missing the last one. It's the $18 pickup for Mara. Everything before it is there.", 8.4),
            msg(
                "assistant",
                [
                    "<subagent id=\"mock-sub-export-header\" agent=\"Header row\" status=\"done\" task=\"Check the column names against the sheet\">",
                    "The header matches the columns the shop asked for. The missing order is not a column problem.",
                    "</subagent>",
                    "",
                    "The exporter was splitting the file on newlines and throwing away the piece after the last one. Mara's pickup was that piece. The header row was already right.",
                ].join("\n"),
                8,
            ),
        ]),
        chat("mock-chat-reset", "Reset link opens as http", path, 16, [
            msg("user", "The password email looks fine, but the link in it is http. Chrome warns people before they can set a new password.", 16.5),
            msg(
                "assistant",
                [
                    "<edit file=\"src/mail/reset.ts\">",
                    "<original>const link = `http://shop.example.com/reset?token=${token}`;</original>",
                    "<replacement>const link = `https://shop.example.com/reset?token=${token}`;</replacement>",
                    "</edit>",
                    "",
                    "The template had the scheme hardcoded. New emails use https. Links that were already sent still point at the old scheme until they expire.",
                ].join("\n"),
                16,
            ),
        ]),
        chat("mock-chat-search", "Search ignores the second word", path, 24, [
            msg("user", "Searching \"wool socks\" returns every wool item in the shop, including the coats. It should be the socks.", 24.6),
            msg(
                "assistant",
                [
                    "<subagent id=\"mock-sub-search-tokens\" agent=\"Tokenizer\" status=\"pending\" task=\"Review how a two-word query is split\">",
                    "Not started yet.",
                    "</subagent>",
                    "<edit file=\"src/search/query.ts\">",
                    "<original>const term = query.trim().split(\" \")[0];</original>",
                    "<replacement>const terms = query.trim().split(/\\s+/).filter(Boolean);</replacement>",
                    "</edit>",
                    "",
                    "Search was keeping only the first word, so \"wool socks\" meant \"wool\". Both words are queried now. The index rebuild still needs another run before the coats drop out of that search.",
                ].join("\n"),
                24,
            ),
        ]),
        chat("mock-chat-avatar", "Staff photo upload has no size cap", path, 32, [
            msg("user", "Someone uploaded a 40MB photo as their staff picture and the roster page now takes forever to open.", 33),
            msg(
                "assistant",
                [
                    "<edit file=\"src/uploads/avatar.ts\">",
                    "<original>await save(file);</original>",
                    "<replacement>if (file.size > 2 * 1024 * 1024) throw new Error(\"Photo must be under 2MB\");\nawait save(resized(file, 512));</replacement>",
                    "</edit>",
                    "",
                    "Uploads were stored as-is. A staff photo now has to be under 2MB, and we keep a 512px copy for the roster. The oversized one already on the page should be replaced.",
                ].join("\n"),
                32,
            ),
        ]),
        chat("mock-chat-report", "Nightly email still goes to the old shop", path, 40, [
            msg("user", "The 9pm sales email is still arriving at the downtown address. We moved that list to the harbor shop last week.", 41),
            msg(
                "assistant",
                [
                    "<edit file=\"src/reports/nightly.ts\">",
                    "<original>const shopId = \"downtown\";</original>",
                    "<replacement>const shopId = settings.reportShopId;</replacement>",
                    "</edit>",
                    "",
                    "The job had the old shop id written in. It now reads whichever shop the settings page points at. Last night's send already went to downtown, so that one will not be recalled.",
                ].join("\n"),
                40,
            ),
        ]),
        chat("mock-chat-dates", "Picker shows yesterday after 7pm", path, 52, [
            msg("user", "After about 7pm the date picker jumps back a day. If I pick Friday evening it saves Thursday.", 53),
            msg(
                "assistant",
                "The picker was formatting the date in UTC, and the shop is in a timezone behind UTC. Evening selections were landing on the previous calendar day. It now formats in the shop timezone, so Friday evening stays Friday.",
                52,
            ),
        ]),
    ];
}
