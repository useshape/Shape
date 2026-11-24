"use client";

import { useSyncExternalStore } from "react";
import type { ChatMessage, Conversation } from "@/lib/backend/types";

const STORAGE_KEY = "shape:mock-chats";
const CHANGE_EVENT = "shape-mock-chats";
const MOCK_PREFIX = "mock-chat-";

const UNREAD_IDS = new Set(["mock-chat-reset"]);

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
        chat("mock-chat-tax", "Checkout is taxing the plan twice", path, 0.4, [
            msg("user", "The total on checkout is charging tax twice. I just paid $86 on the $79 Plus plan, and the receipt shows tax on top of a price that already had tax in it.", 0.6),
            msg(
                "assistant",
                [
                    "<cat path=\"lib/billing/checkout.ts\" start=\"40\" end=\"88\"></cat>",
                    "<edit file=\"lib/billing/checkout.ts\">",
                    "<original>const total = priceWithTax(plan.amount) + taxFor(plan.amount);</original>",
                    "<replacement>const total = priceWithTax(plan.amount);</replacement>",
                    "</edit>",
                    "<terminal_command status=\"completed\" id=\"mock-tax\">bun run test tests/billing/checkout.test.ts</terminal_command>",
                    "",
                    "Tax was applied in `priceWithTax`, then added again when the line items were summed. Plus monthly now checks out at $86.06, which is the $79 plan plus tax once. Annual was already storing the taxed amount, so that path is unchanged.",
                ].join("\n"),
                0.4,
            ),
            msg("user", "Good. Leave the annual price alone, I already emailed a customer about that one.", 0.35),
            msg("assistant", "Left it. Only the monthly Plus total changed, and the checkout test for that plan is green.", 0.3),
        ]),
        chat("mock-chat-hero", "Hero title wraps on a 13 inch", path, 2, [
            msg("user", "On my 13 inch the hero reads \"Build software\" on one line and \"development with AI.\" on the next. It looks like the sentence gave up.", 2.2),
            msg(
                "assistant",
                [
                    "<cat path=\"app/(marketing)/_components/hero/index.tsx\" start=\"14\" end=\"22\"></cat>",
                    "<edit file=\"app/(marketing)/_components/hero/index.tsx\">",
                    "<original>w-150 mx-auto text-[3.70rem]</original>",
                    "<replacement>mx-auto max-w-[18ch] text-[3.25rem] sm:text-[3.70rem]</replacement>",
                    "</edit>",
                    "",
                    "The heading was locked to one width, so the second half dropped as soon as the window got narrower than the line. It now wraps on the word \"with\", which is where you'd pause if you were saying it out loud.",
                ].join("\n"),
                2,
            ),
        ]),
        chat("mock-chat-scroll", "Sidebar jumps when a reply lands", path, 5, [
            msg("user", "Every time a reply finishes, the session list jumps to the top. I lose my place if I'm looking at an older chat.", 5.4),
            msg(
                "assistant",
                [
                    "<edit file=\"features/agent/sidebar/chats.tsx\">",
                    "<original>key={c.id + \"-\" + c.timestamp}</original>",
                    "<replacement>key={c.id}</replacement>",
                    "</edit>",
                    "",
                    "The list was remounting because every refresh minted new row keys. The scroll position now stays put when a chat updates in place. A brand new session still appears at the top.",
                ].join("\n"),
                5,
            ),
        ]),
        chat("mock-chat-intel", "Intel Mac download points at the wrong file", path, 8, [
            msg("user", "Someone on an Intel MacBook clicked Download and got the Apple Silicon dmg. They wrote in saying it would not open.", 8.5),
            msg(
                "assistant",
                [
                    "<cat path=\"lib/releases/github.ts\" start=\"44\" end=\"70\"></cat>",
                    "<edit file=\"components/download/detect-os.ts\">",
                    "<original>if (/mac|iphone|ipad|macintosh|darwin/.test(haystack)) return \"macos\";</original>",
                    "<replacement>if (/mac|iphone|ipad|macintosh|darwin/.test(haystack)) return macDownloadPlatform(ua, uaData()?.architecture);</replacement>",
                    "</edit>",
                    "",
                    "Mac was one button, and it always linked the arm64 dmg. Intel Macs now get `Shape-macos-x86_64.dmg`. If the browser does not say which chip it is, we still offer Apple Silicon and leave Intel in the menu.",
                ].join("\n"),
                8,
            ),
        ]),
        chat("mock-chat-reset", "Reset email is going to spam", path, 26, [
            msg("user", "I tried the forgot-password flow from a Gmail account and the code landed in spam. The From address still says onboarding@resend.dev.", 27),
            msg(
                "assistant",
                "That From address is the Resend test sender. Production mail needs `Shape <noreply@useshape.org>` once the domain's DKIM record is verified. I would not change the copy of the email until that sender is the one Gmail actually receives.",
                26,
            ),
            msg("user", "DKIM is verified as of this morning. Can you switch the sender?", 26.2),
            msg("assistant", "Switched the production sender to noreply@useshape.org. Local dev still logs the code in the terminal, so you can keep using any inbox there.", 26),
        ]),
        chat("mock-chat-radius", "Pricing cards still use the old radius", path, 30, [
            msg("user", "The pricing cards are the only place still on the sharp corner. Everything else moved to the softer radius last week.", 31),
            msg(
                "assistant",
                [
                    "<edit file=\"app/pricing/_components/plans.tsx\">",
                    "<original>rounded-sm border border-border</original>",
                    "<replacement>squircle-2xl bg-card</replacement>",
                    "</edit>",
                    "",
                    "The four plan cards now use the same corner as the settings cards. The \"Coming soon\" credit block was the odd one out, and it is gone.",
                ].join("\n"),
                30,
            ),
        ]),
        chat("mock-chat-index", "Docs search is a day behind", path, 50, [
            msg("user", "I published the Intel download note to the docs this morning and search still answers as if it does not exist.", 51),
            msg(
                "assistant",
                "Search is reading the index that shipped with the last website deploy, not the docs repo. The site revalidates that index about once a minute, so a new `search-index.json` on main should show up without another deploy. I checked just now and the Intel note is in the results.",
                50,
            ),
        ]),
    ];
}
