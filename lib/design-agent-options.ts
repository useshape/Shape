export interface DesignAgentOptions {
    visualPreviews: boolean;
    multipleConcepts: boolean;
    hideCodeUntilChosen: boolean;
    useProjectTokens: boolean;
    responsiveFrames: boolean;
    accessibilityPass: boolean;
}

export const DEFAULT_DESIGN_AGENT_OPTIONS: DesignAgentOptions = {
    visualPreviews: true,
    multipleConcepts: true,
    hideCodeUntilChosen: false,
    useProjectTokens: true,
    responsiveFrames: false,
    accessibilityPass: false,
};

const STORAGE_KEY = "shape-design-agent-options";

export function loadDesignAgentOptions(): DesignAgentOptions {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULT_DESIGN_AGENT_OPTIONS };
        return { ...DEFAULT_DESIGN_AGENT_OPTIONS, ...JSON.parse(raw) };
    } catch {
        return { ...DEFAULT_DESIGN_AGENT_OPTIONS };
    }
}

export function saveDesignAgentOptions(options: DesignAgentOptions): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
    } catch {
        // ignore quota errors
    }
}

export function designOptionsPromptBlock(options: DesignAgentOptions): string {
    return JSON.stringify(options);
}
