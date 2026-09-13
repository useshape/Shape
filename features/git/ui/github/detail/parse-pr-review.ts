export type PrFindingSeverity = "blocker" | "should-fix" | "nit" | "info";

export type PrFinding = {
    severity: PrFindingSeverity;
    path: string | null;
    text: string;
};

export type ParsedPrReview = {
    walkthrough: string;
    findings: PrFinding[];
};

function extractSection(md: string, heading: string): string {
    const re = new RegExp(
        `###\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n###\\s+|$)`,
        "i",
    );
    const m = md.match(re);
    return m?.[1]?.trim() ?? "";
}

function parseSeverity(raw: string): PrFindingSeverity {
    const s = raw.toLowerCase();
    if (s.includes("blocker")) return "blocker";
    if (s.includes("should-fix") || s.includes("should fix")) return "should-fix";
    if (s.includes("nit")) return "nit";
    return "info";
}

/** Pull path-like tokens from a finding line when the model cited one. */
function guessPath(line: string, knownFiles: string[]): string | null {
    for (const f of knownFiles) {
        if (f && line.includes(f)) return f;
    }
    const m = line.match(
        /(?:^|[\s`*(])((?:[\w.-]+\/)+[\w.-]+\.[a-zA-Z0-9]+)(?:$|[\s`*):,])/,
    );
    return m?.[1] ?? null;
}

function parseFindingLine(line: string, knownFiles: string[]): PrFinding | null {
    const cleaned = line.replace(/^[-*]\s+/, "").trim();
    if (!cleaned) return null;
    if (/^no material issues/i.test(cleaned.replace(/[*_`]/g, ""))) {
        return { severity: "info", path: null, text: cleaned.replace(/[*_`]/g, "") };
    }
    const severityMatch = cleaned.match(
        /\*\*(blocker|should-fix|should fix|nit)\*\*/i,
    );
    const severity = severityMatch
        ? parseSeverity(severityMatch[1])
        : parseSeverity(cleaned);
    const path = guessPath(cleaned, knownFiles);
    return { severity, path, text: cleaned };
}

/**
 * Split a PR_REVIEW.MD-shaped reply into Conversation walkthrough + Files findings.
 */
export function parsePrReview(md: string, knownFiles: string[] = []): ParsedPrReview {
    const text = md.trim();
    if (!text) return { walkthrough: "", findings: [] };

    const findingsBody = extractSection(text, "Findings");
    const checks = extractSection(text, "Checks");
    const merge = extractSection(text, "Merge readiness");

    const findings: PrFinding[] = [];
    if (findingsBody) {
        for (const line of findingsBody.split("\n")) {
            const t = line.trim();
            if (!t.startsWith("-") && !t.startsWith("*")) continue;
            const f = parseFindingLine(t, knownFiles);
            if (f) findings.push(f);
        }
    }

    const walkParts: string[] = [];
    if (checks) walkParts.push(`### Checks\n${checks}`);
    if (merge) walkParts.push(`### Merge readiness\n${merge}`);
    // If the model didn't use headings, fall back to everything except Findings.
    let walkthrough = walkParts.join("\n\n").trim();
    if (!walkthrough) {
        walkthrough = text
            .replace(/###\s+Findings\s*\n[\s\S]*?(?=\n###\s+|$)/i, "")
            .trim();
    }

    return { walkthrough, findings };
}
