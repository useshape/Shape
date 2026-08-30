"use client";

import { MsgBubble, TypingDots, EntityPill, ModelAvatarStack } from "@/features/chat/ui/message/bubble";
import { providerIcon } from "@/lib/ui/provider-icon";
import { Icon } from "@/components/ui/icon";
import { Titlebar } from "@/features/workbench";

/**
 * Demo playground — realistic chat showcasing bubbles, typing, workflow
 * steps, MCP pills, and model avatars without dumping every component.
 */
export default function ChatPlaygroundPage() {
    return (
        <div className="flex h-screen w-full flex-col overflow-hidden bg-background text-text-primary">
            <Titlebar settings title="Chat playground" />
            <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 no-scrollbar">
                <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 pb-24">
                    <p className="mb-2 text-center text-xs text-text-muted">
                        Demo thread — Apple bubbles, workflow rail, MCP pills, typing
                    </p>

                    {/* User */}
                    <div className="flex items-end justify-end gap-2 pl-10">
                        <MsgBubble side="sent" hasTail>
                            <span className="text-sm">
                                Can you check the auth flow and wire up the LinkedIn MCP?
                            </span>
                        </MsgBubble>
                    </div>

                    {/* Assistant — Shape / Auto */}
                    <div className="flex items-end gap-2 pr-8">
                        <span className="mb-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-3">
                            {providerIcon("auto", 16)}
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="pl-1 text-xs text-text-muted">Auto</span>
                            <MsgBubble side="recv" hasTail={false} className="text-sm">
                                On it — I&apos;ll skim the auth module first, then hook the MCP.
                            </MsgBubble>
                        </div>
                    </div>

                    {/* Workflow summary (Grok-like) */}
                    <div className="ml-9 rounded-2xl bg-surface-2/60 px-3 py-2">
                        <button type="button" className="flex items-center gap-1 text-sm text-text-muted">
                            Worked for <span className="text-text-secondary">48s</span>
                            <Icon name="expand_more" size={14} />
                        </button>
                        <div className="mt-1 ml-1 border-l border-border pl-3">
                            <div className="wf-step">
                                <div className="wf-step-rail">
                                    <span className="wf-step-dot">
                                        <Icon name="description" size={12} />
                                    </span>
                                    <span className="wf-step-line" />
                                </div>
                                <details open>
                                    <summary className="cursor-pointer list-none text-sm text-text-muted">
                                        Read 4 files
                                    </summary>
                                    <ul className="mt-1 space-y-0.5 text-xs text-text-secondary">
                                        <li>auth/session.ts</li>
                                        <li>lib/shape-auth/store.ts</li>
                                        <li>mcp/linkedin.ts</li>
                                        <li>features/chat/ui/composer/input.tsx</li>
                                    </ul>
                                </details>
                            </div>
                            <div className="wf-step">
                                <div className="wf-step-rail">
                                    <span className="wf-step-dot">
                                        <Icon name="search" size={12} />
                                    </span>
                                    <span className="wf-step-line" />
                                </div>
                                <details>
                                    <summary className="cursor-pointer list-none text-sm text-text-muted">
                                        Ran 3 searches
                                    </summary>
                                    <ul className="mt-1 space-y-0.5 text-xs text-text-secondary">
                                        <li className="flex items-center gap-1">
                                            <Icon name="public" size={11} /> oauth redirect
                                        </li>
                                        <li className="flex items-center gap-1">
                                            <Icon name="public" size={11} /> LinkedIn MCP schema
                                        </li>
                                    </ul>
                                </details>
                            </div>
                            <div className="wf-step">
                                <div className="wf-step-rail">
                                    <span className="wf-step-dot">
                                        <Icon name="bot" size={12} />
                                    </span>
                                </div>
                                <EntityPill
                                    icon={<Icon name="bot" size={12} />}
                                    label="LinkedIn Operator"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Assistant reply with mention pills */}
                    <div className="flex items-end gap-2 pr-8">
                        <span className="mb-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-3">
                            {providerIcon("anthropic/claude-sonnet-4", 16)}
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="pl-1 text-xs text-text-muted">Claude Sonnet</span>
                            <MsgBubble side="recv" hasTail className="text-sm">
                                <span>
                                    Auth looks solid. Handed the scrape to{" "}
                                    <EntityPill
                                        icon={<Icon name="bot" size={12} />}
                                        label="LinkedIn Operator"
                                    />{" "}
                                    — want me to open a PR next?
                                </span>
                            </MsgBubble>
                        </div>
                    </div>

                    {/* User follow-up */}
                    <div className="flex items-end justify-end gap-2 pl-10">
                        <MsgBubble side="sent" hasTail>
                            <span className="text-sm">Yes — draft the PR summary too.</span>
                        </MsgBubble>
                    </div>

                    {/* Typing */}
                    <div className="flex items-end gap-2 pr-8">
                        <span className="mb-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-3">
                            {providerIcon("openai/gpt-5", 16)}
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="pl-1 text-xs text-text-muted">GPT</span>
                            <MsgBubble side="recv" hasTail>
                                <TypingDots />
                            </MsgBubble>
                        </div>
                    </div>

                    {/* Tab avatar demo */}
                    <div className="mt-6 flex items-center justify-center gap-3 rounded-2xl border border-border-subtle bg-surface-2 px-4 py-3">
                        <span className="text-xs text-text-muted">Tab avatars</span>
                        <ModelAvatarStack models={["auto"]} size={18} />
                        <ModelAvatarStack
                            models={["anthropic/claude-sonnet-4", "openai/gpt-5", "google/gemini"]}
                            size={18}
                        />
                    </div>
                </div>
            </main>

            {/* Composer mock */}
            <div className="shrink-0 px-4 pb-4">
                <div className="mx-auto max-w-2xl rounded-[1.35rem] border border-border-subtle bg-surface-2 px-3 pt-3 pb-2">
                    <p className="px-1 pb-6 text-sm text-text-muted">Ask anything</p>
                    <div className="flex items-center justify-between">
                        <button type="button" className="flex size-8 items-center justify-center text-text-muted" aria-label="Attach">
                            <Icon name="add" size={16} />
                        </button>
                        <div className="flex items-center gap-1">
                            <button type="button" className="flex h-8 items-center gap-1 rounded-full px-2 text-sm text-text-muted">
                                Fast
                                <Icon name="expand_more" size={14} />
                            </button>
                            <button
                                type="button"
                                className="flex size-8 items-center justify-center rounded-full bg-accent text-white"
                                aria-label="Send"
                            >
                                <Icon name="arrow_upward" size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
