export function listenWindowEvent(name: string) {
    const events: Event[] = [];
    const handler = (e: Event) => events.push(e);
    window.addEventListener(name, handler);
    return {
        events,
        off: () => window.removeEventListener(name, handler),
    };
}

export function listenCustomEvent<T = unknown>(name: string) {
    const events: CustomEvent<T>[] = [];
    const handler = (e: Event) => events.push(e as CustomEvent<T>);
    window.addEventListener(name, handler);
    return {
        events,
        off: () => window.removeEventListener(name, handler),
    };
}
