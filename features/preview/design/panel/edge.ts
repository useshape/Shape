export function sidebarEdgeOffset(el: HTMLElement | null) {
    if (!el) return 8;
    const aside = el.closest("aside");
    if (!aside) return 8;
    return Math.max(0, Math.round(el.getBoundingClientRect().left - aside.getBoundingClientRect().left));
}
