/** Keep the mention overlay aligned with the composer textarea. */
export function syncComposerOverlayScroll(
    source: { scrollLeft: number; scrollTop: number },
    overlay: { scrollLeft: number; scrollTop: number } | null | undefined,
) {
    if (!overlay) return;
    overlay.scrollLeft = source.scrollLeft;
    overlay.scrollTop = source.scrollTop;
}

/** If the caret is at the end of a long line, scroll so new characters stay in view. */
export function revealComposerCaret(
    textarea: {
        selectionStart: number | null;
        value: string;
        scrollWidth: number;
        clientWidth: number;
        scrollLeft: number;
    },
) {
    const caret = textarea.selectionStart ?? textarea.value.length;
    if (caret < textarea.value.length) return textarea.scrollLeft;
    const max = Math.max(0, textarea.scrollWidth - textarea.clientWidth);
    textarea.scrollLeft = max;
    return max;
}
