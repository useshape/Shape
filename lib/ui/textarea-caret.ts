/** Mirror-div caret coordinates for a textarea (viewport pixels). */
export function getTextareaCaretViewportRect(
    textarea: HTMLTextAreaElement,
    position: number,
): { top: number; left: number; height: number } {
    const style = window.getComputedStyle(textarea);
    const mirror = document.createElement("div");
    const properties = [
        "boxSizing",
        "width",
        "height",
        "overflowX",
        "overflowY",
        "borderTopWidth",
        "borderRightWidth",
        "borderBottomWidth",
        "borderLeftWidth",
        "paddingTop",
        "paddingRight",
        "paddingBottom",
        "paddingLeft",
        "fontStyle",
        "fontVariant",
        "fontWeight",
        "fontStretch",
        "fontSize",
        "fontSizeAdjust",
        "lineHeight",
        "fontFamily",
        "textAlign",
        "textTransform",
        "textIndent",
        "textDecoration",
        "letterSpacing",
        "wordSpacing",
        "tabSize",
        "whiteSpace",
        "wordBreak",
        "wordWrap",
    ] as const;

    mirror.style.position = "absolute";
    mirror.style.visibility = "hidden";
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.wordWrap = "break-word";
    mirror.style.top = "0";
    mirror.style.left = "-9999px";

    for (const prop of properties) {
        mirror.style[prop] = style[prop];
    }

    mirror.style.width = `${textarea.clientWidth}px`;
    mirror.style.height = "auto";
    mirror.style.overflow = "hidden";

    const value = textarea.value;
    const before = value.slice(0, position);
    mirror.textContent = before;

    const marker = document.createElement("span");
    marker.textContent = value.slice(position, position + 1) || ".";
    mirror.appendChild(marker);
    document.body.appendChild(mirror);

    const textareaRect = textarea.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();

    const top =
        textareaRect.top +
        (markerRect.top - mirrorRect.top) -
        textarea.scrollTop +
        Number.parseFloat(style.borderTopWidth || "0");
    const left =
        textareaRect.left +
        (markerRect.left - mirrorRect.left) -
        textarea.scrollLeft +
        Number.parseFloat(style.borderLeftWidth || "0");
    const height = markerRect.height || Number.parseFloat(style.lineHeight) || 16;

    document.body.removeChild(mirror);
    return { top, left, height };
}
