/** Horizontal drag used by the copied Chrome tab strip. Matches the calls in chrome-tabs.ts. */

type DragHandler = (event: PointerEvent, pointer: PointerEvent, moveVector: { x: number; y: number }) => void;

export class TabDrag {
    element: HTMLElement;
    isDragging = false;
    positionDrag: (x: number) => void;
    private handle: HTMLElement;
    private listeners = new Map<string, Set<DragHandler>>();
    private origin = 0;
    private downX = 0;
    private pointerId = -1;
    private tracking = false;

    constructor(element: HTMLElement, options: { handle?: string; axis?: string; containment?: boolean }) {
        this.element = element;
        this.positionDrag = (x) => {
            this.element.style.transform = "none";
            this.element.style.left = `${x}px`;
        };
        const handle = options.handle ? element.querySelector(options.handle) : element;
        this.handle = (handle as HTMLElement | null) ?? element;
        this.handle.addEventListener("pointerdown", this.onDown);
    }

    on(name: string, handler: DragHandler) {
        const set = this.listeners.get(name) ?? new Set();
        set.add(handler);
        this.listeners.set(name, set);
    }

    off(name: string, handler: DragHandler) {
        this.listeners.get(name)?.delete(handler);
    }

    /** Called by the tab strip to pin the tab when it hits the edges. */
    _dragMove(_event: PointerEvent, _pointer: PointerEvent, vector: { x: number; y: number }) {
        this.positionDrag(this.origin + vector.x);
    }

    dragEnd() {
        this.finish();
    }

    destroy() {
        this.handle.removeEventListener("pointerdown", this.onDown);
        this.stopTracking();
        this.listeners.clear();
    }

    private emit(name: string, event: PointerEvent) {
        const move = { x: event.clientX - this.downX, y: 0 };
        this.listeners.get(name)?.forEach((handler) => handler(event, event, move));
    }

    private onDown = (event: PointerEvent) => {
        if (event.button !== 0) return;
        const target = event.target as HTMLElement | null;
        if (target?.closest(".chrome-tab-close")) return;
        this.downX = event.clientX;
        this.pointerId = event.pointerId;
        const parent = this.element.offsetParent as HTMLElement | null;
        const parentLeft = parent?.getBoundingClientRect().left ?? 0;
        this.origin = this.element.getBoundingClientRect().left - parentLeft;
        this.tracking = true;
        this.isDragging = false;
        window.addEventListener("pointermove", this.onMove);
        window.addEventListener("pointerup", this.onUp);
        window.addEventListener("pointercancel", this.onUp);
        this.emit("pointerDown", event);
    };

    private onMove = (event: PointerEvent) => {
        if (!this.tracking || event.pointerId !== this.pointerId) return;
        const dx = event.clientX - this.downX;
        if (!this.isDragging) {
            if (Math.abs(dx) < 4) return;
            this.isDragging = true;
            this.emit("dragStart", event);
        }
        this.positionDrag(this.origin + dx);
        this.emit("dragMove", event);
    };

    private onUp = (event: PointerEvent) => {
        if (event.pointerId !== this.pointerId) return;
        if (this.isDragging) this.emit("dragEnd", event);
        this.finish();
    };

    private finish() {
        this.isDragging = false;
        this.stopTracking();
    }

    private stopTracking() {
        if (!this.tracking && this.pointerId < 0) return;
        this.tracking = false;
        this.pointerId = -1;
        window.removeEventListener("pointermove", this.onMove);
        window.removeEventListener("pointerup", this.onUp);
        window.removeEventListener("pointercancel", this.onUp);
    }
}
