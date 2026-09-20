/** Last completed agent turn usage — drives the composer ring delta (not monthly %). */

export type LastTurnUsage = {
    tokens: number;
    creditsCharged: number;
    usedAuto: boolean;
    at: number;
};

let lastTurn: LastTurnUsage | null = null;
const listeners = new Set<() => void>();

function emit() {
    listeners.forEach((l) => l());
}

export function getLastTurnUsage(): LastTurnUsage | null {
    return lastTurn;
}

export function setLastTurnUsage(next: {
    tokens?: number;
    creditsCharged?: number;
    usedAuto?: boolean;
} | null) {
    if (!next) {
        lastTurn = null;
        emit();
        return;
    }
    lastTurn = {
        tokens: next.tokens ?? 0,
        creditsCharged: next.creditsCharged ?? 0,
        usedAuto: Boolean(next.usedAuto),
        at: Date.now(),
    };
    emit();
}

export function subscribeLastTurnUsage(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
