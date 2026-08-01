import React, { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

import { getSymbolIconPath } from "@/lib/ui/icons/symbols";
import { cn } from "@/lib/utils";

const HOST_CLASS = "shape-editor-autocomplete-host";

function isEditorUsable(editor: any): boolean {
    try {
        const model = editor?.getModel();
        if (!model || model.isDisposed()) return false;
        const domNode = editor.getDomNode();
        if (!domNode?.isConnected) return false;
        return true;
    } catch {
        return false;
    }
}

function getSuggestController(editor: any): any {
    try {
        return editor.getContribution("editor.contrib.suggestController");
    } catch {
        return null;
    }
}

function getInternalSuggestWidget(suggestController: any): any {
    return (
        suggestController?.widget?.value ||
        suggestController?.widget?.get?.() ||
        suggestController?._widget?.value
    );
}

// Custom UI for Monaco Autocomplete
export function AutocompleteOverlay({ editor, monaco }: { editor: any; monaco: any }) {
    const [visible, setVisible] = useState(false);
    const [items, setItems] = useState<any[]>([]);
    const [focusedIndex, setFocusedIndex] = useState(0);

    const [widgetNode] = useState(() => {
        if (typeof document === "undefined") return null;
        const div = document.createElement("div");
        div.style.zIndex = "500";
        div.onmousedown = (e) => {
            e.preventDefault();
            e.stopPropagation();
        };
        return div;
    });

    const widgetRef = useRef<any>(null);
    const wrappersRef = useRef<any[]>([]);
    const focusedItemRef = useRef<HTMLDivElement | null>(null);
    const stateRef = useRef<{ visible: boolean; items: any[]; focusedIndex: number }>({
        visible: false,
        items: [],
        focusedIndex: 0,
    });

    const updateState = useCallback((newState: Partial<typeof stateRef.current>) => {
        stateRef.current = { ...stateRef.current, ...newState };
        setVisible(stateRef.current.visible);
        setItems(stateRef.current.items);
        setFocusedIndex(stateRef.current.focusedIndex);

        if (widgetRef.current) {
            editor.layoutContentWidget(widgetRef.current.widget);
        }
    }, [editor]);

    const commitSuggestionAt = useCallback((index: number) => {
        if (!isEditorUsable(editor)) return;

        const suggestController = getSuggestController(editor);
        if (!suggestController) return;

        const wrapper = wrappersRef.current[index];
        const internalWidget = getInternalSuggestWidget(suggestController);

        if (internalWidget?.setFocusedIndex) {
            internalWidget.setFocusedIndex(index);
        }

        try {
            if (typeof suggestController.insertSuggestion === "function" && wrapper) {
                suggestController.insertSuggestion(wrapper);
                return;
            }
            if (typeof suggestController.acceptSelectedSuggestion === "function") {
                suggestController.acceptSelectedSuggestion();
                return;
            }
            editor.trigger("autocomplete", "acceptSelectedSuggestion", null);
        } catch {
            try {
                editor.trigger("keyboard", "acceptSelectedSuggestion", null);
            } catch {
                // noop
            }
        }
    }, [editor]);

    useEffect(() => {
        if (!editor || !monaco || !widgetNode) return;

        const container = editor.getContainerDomNode();
        const host = container?.closest?.(".monaco-editor")?.parentElement ?? container?.parentElement;
        host?.classList.add(HOST_CLASS);

        const styleLabel = document.createElement("style");
        styleLabel.innerHTML = `
            .${HOST_CLASS} .monaco-editor .suggest-widget {
                display: none !important;
                visibility: hidden !important;
                pointer-events: none !important;
            }
        `;
        document.head.appendChild(styleLabel);

        let disposeSuggest: { dispose: () => void } | undefined;
        let disposeCancel: { dispose: () => void } | undefined;
        let disposeFocus: { dispose: () => void } | undefined;
        let disposeHide: { dispose: () => void } | undefined;
        let resolveGeneration = 0;

        const resolveVisibleItems = async (completionItems: any[], generation: number) => {
            const slice = completionItems.slice(0, 25);
            await Promise.all(
                slice.map(async (item: any) => {
                    if (!item?.resolve) return;
                    try {
                        await item.resolve(new monaco.CancellationTokenSource().token);
                    } catch {
                        // cancelled
                    }
                }),
            );
            if (generation !== resolveGeneration) return;
            updateState({
                items: completionItems.map((i: any) => i.completion),
            });
        };

        const init = () => {
            if (!isEditorUsable(editor)) return false;
            const suggestController = getSuggestController(editor);
            if (!suggestController) return false;

            try {
                const suggestModel = suggestController?.model || suggestController?._model;
                if (suggestModel) {
                    disposeSuggest = suggestModel.onDidSuggest((e: any) => {
                        const completionItems = e.completionModel?.items || [];
                        wrappersRef.current = completionItems;
                        resolveGeneration += 1;
                        const gen = resolveGeneration;

                        updateState({
                            items: completionItems.map((i: any) => i.completion),
                            visible: completionItems.length > 0,
                            focusedIndex: 0,
                        });

                        void resolveVisibleItems(completionItems, gen);
                    });

                    disposeCancel = suggestModel.onDidCancel(() => {
                        wrappersRef.current = [];
                        resolveGeneration += 1;
                        updateState({ visible: false, items: [] });
                    });
                }

                const internalWidget = getInternalSuggestWidget(suggestController);
                if (internalWidget) {
                    if (internalWidget.onDidFocus) {
                        disposeFocus = internalWidget.onDidFocus((e: any) => {
                            if (e && typeof e.index === "number") {
                                const newItems = [...stateRef.current.items];
                                if (e.item?.completion) {
                                    newItems[e.index] = e.item.completion;
                                }
                                updateState({ focusedIndex: e.index, items: newItems });
                            }
                        });
                    }
                    if (internalWidget.onDidHide) {
                        disposeHide = internalWidget.onDidHide(() => {
                            wrappersRef.current = [];
                            updateState({ visible: false });
                        });
                    }
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                if (message.includes("AbstractContextKeyService has been disposed")) {
                    return false;
                }
                console.error("Monaco custom autocomplete hook failed:", err);
            }
            return true;
        };

        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        let retryCount = 0;
        const tryInit = () => {
            if (init()) return;
            if (retryCount < 20) {
                retryCount += 1;
                retryTimer = setTimeout(tryInit, 100);
            }
        };

        tryInit();

        const disposeModelChange = editor.onDidChangeModel?.(() => {
            disposeSuggest?.dispose();
            disposeCancel?.dispose();
            disposeFocus?.dispose();
            disposeHide?.dispose();
            disposeSuggest = undefined;
            disposeCancel = undefined;
            disposeFocus = undefined;
            disposeHide = undefined;
            wrappersRef.current = [];
            resolveGeneration += 1;
            retryCount = 0;
            tryInit();
        });

        const widget = {
            getId: () => "shape-custom-autocomplete",
            getDomNode: () => widgetNode,
            getPosition: () => {
                if (!stateRef.current.visible || stateRef.current.items.length === 0) return null;
                const pos = editor.getPosition();
                if (!pos) return null;
                return {
                    position: pos,
                    preference: [
                        monaco.editor.ContentWidgetPositionPreference.BELOW,
                        monaco.editor.ContentWidgetPositionPreference.ABOVE,
                    ],
                };
            },
        };

        widgetRef.current = { widget, container: widgetNode };
        editor.addContentWidget(widget);

        return () => {
            if (retryTimer) clearTimeout(retryTimer);
            disposeModelChange?.dispose();
            disposeSuggest?.dispose();
            disposeCancel?.dispose();
            disposeFocus?.dispose();
            disposeHide?.dispose();
            host?.classList.remove(HOST_CLASS);
            if (styleLabel.parentNode) styleLabel.parentNode.removeChild(styleLabel);
            if (widgetRef.current) {
                try {
                    editor.removeContentWidget(widgetRef.current.widget);
                } catch {
                    // disposed
                }
            }
        };
    }, [editor, monaco, widgetNode, updateState]);

    // Keep the keyboard-focused row visible while navigating long lists.
    useEffect(() => {
        focusedItemRef.current?.scrollIntoView({ block: "nearest" });
    }, [focusedIndex, visible]);

    if (!widgetNode || !visible || items.length === 0) return null;

    const kindStringMap: Record<number, string> = {
        1: "Method", 2: "Function", 3: "Constructor", 4: "Field", 5: "Variable",
        6: "Class", 7: "Interface", 8: "Module", 9: "Property", 10: "Event",
        11: "Operator", 13: "Enum", 14: "Keyword", 15: "Snippet", 18: "Reference", 27: "TypeParameter",
    };

    const autocompleteContent = (
        <div className="w-[320px] min-w-[220px] max-h-[220px] overflow-hidden rounded-xl bg-panel-secondary border border-border-subtle shadow-md flex flex-col pointer-events-auto">
            <div className="flex-1 overflow-y-auto custom-scrollbar p-0.5">
                {items.map((item, idx) => {
                    const isFocused = idx === focusedIndex;
                    const kindName = kindStringMap[item.kind] || "Field";
                    const mainLabel = typeof item.label === "string" ? item.label : item.label?.label;
                    const labelDetail = typeof item.label === "object" ? item.label?.detail : "";
                    const labelDescription = typeof item.label === "object" ? item.label?.description : "";
                    const rightDetail = labelDescription || item.detail;

                    return (
                        <div
                            key={`${mainLabel}-${idx}`}
                            ref={isFocused ? (el) => { focusedItemRef.current = el; } : undefined}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                commitSuggestionAt(idx);
                            }}
                            className={cn(
                                "flex flex-row items-center h-[22px] px-md rounded-lg mb-px cursor-pointer transition-colors",
                                isFocused
                                    ? "bg-panel-active text-white"
                                    : "border-[0.5px] border-transparent hover:bg-panel-hover",
                            )}
                        >
                            <div className="flex flex-row items-center gap-1.5 w-full overflow-hidden">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={getSymbolIconPath(kindName)}
                                    alt={kindName}
                                    className="w-[14px] h-[14px] opacity-90 select-none shrink-0"
                                />
                                <div className="text-sm flex items-center min-w-0 flex-1 whitespace-nowrap overflow-hidden gap-x-1">
                                    <span className={cn("shrink-0", isFocused ? "text-white" : "text-text-primary")}>
                                        {mainLabel}
                                    </span>
                                    {labelDetail && (
                                        <span className={cn(
                                            "shrink-0 font-sans",
                                            isFocused ? "text-white/60" : "text-text-muted opacity-60",
                                        )}>
                                            {labelDetail}
                                        </span>
                                    )}
                                </div>
                                {rightDetail && (
                                    <span className={cn(
                                        "text-sm font-sans shrink-0 select-none pointer-events-none pl-2",
                                        isFocused ? "text-white/70 border-white/20" : "text-text-muted border-border-subtle/40",
                                    )}>
                                        {rightDetail}
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-sm text-text-muted shrink-0">
                <span>↵ Insert · Tab Replace · Esc Cancel</span>
            </div>
        </div>
    );

    return createPortal(autocompleteContent, widgetNode);
}
