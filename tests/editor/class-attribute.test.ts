import { describe, expect, it } from "vitest";
import {
    applyClassEdit,
    applyClassEditInContext,
    contextAtOffset,
    findClassContexts,
    getAllClassTokens,
    getClassPrefixAtOffset,
    getContextAtModelOffset,
    getTokensInContext,
    isInsideClassContext,
    tokenAtOffset,
} from "@/features/editor/lib/class-attribute";

describe("findClassContexts", () => {
    it("finds className double-quoted string", () => {
        const line = '<div className="flex gap-2 p-4">';
        const ctxs = findClassContexts(line);
        expect(ctxs).toHaveLength(1);
        expect(line.slice(ctxs[0].bodyStart, ctxs[0].bodyEnd)).toBe("flex gap-2 p-4");
    });

    it("finds className single-quoted string", () => {
        const line = "<div class='text-sm'>";
        const ctxs = findClassContexts(line);
        expect(ctxs).toHaveLength(1);
        expect(line.slice(ctxs[0].bodyStart, ctxs[0].bodyEnd)).toBe("text-sm");
    });

    it("finds className template literal", () => {
        const line = "className={`flex items-center`}";
        const ctxs = findClassContexts(line);
        expect(ctxs).toHaveLength(1);
        expect(line.slice(ctxs[0].bodyStart, ctxs[0].bodyEnd)).toBe("flex items-center");
    });

    it("finds cn() string argument", () => {
        const line = 'cn("flex-1 justify-between", isActive && "bg-accent")';
        const ctxs = findClassContexts(line);
        expect(ctxs.length).toBeGreaterThanOrEqual(1);
        expect(line.slice(ctxs[0].bodyStart, ctxs[0].bodyEnd)).toBe("flex-1 justify-between");
    });

    it("finds clsx() string arguments", () => {
        const line = 'clsx("rounded-lg", "p-2")';
        const ctxs = findClassContexts(line);
        expect(ctxs.length).toBeGreaterThanOrEqual(1);
        expect(line.slice(ctxs[0].bodyStart, ctxs[0].bodyEnd)).toBe("rounded-lg");
    });

    it("ignores CSS flex property on same line", () => {
        const line = "  flex: 1; /* className=\"hidden\" in comment */";
        const ctxs = findClassContexts(line);
        expect(ctxs).toHaveLength(0);
    });

    it("does not treat flex-1 in CSS as class context", () => {
        const line = ".foo { flex: 1; }";
        expect(isInsideClassContext(line, line.indexOf("flex"))).toBe(false);
    });
});

describe("getTokensInContext", () => {
    it("returns tokens with correct offsets", () => {
        const line = 'className="flex-1 gap-2"';
        const ctx = findClassContexts(line)[0];
        const tokens = getTokensInContext(line, ctx);
        expect(tokens.map((t) => t.value)).toEqual(["flex-1", "gap-2"]);
        expect(line.slice(tokens[0].start, tokens[0].end)).toBe("flex-1");
    });
});

describe("tokenAtOffset", () => {
    it("returns token under cursor", () => {
        const line = 'className="justify-between items-center"';
        const idx = line.indexOf("justify-between") + 5;
        const tok = tokenAtOffset(line, idx);
        expect(tok?.value).toBe("justify-between");
    });

    it("does not return flex-1 from CSS context", () => {
        const line = "  flex: 1;";
        expect(tokenAtOffset(line, line.indexOf("flex"))).toBeNull();
    });
});

describe("applyClassEdit", () => {
    it("adds classes", () => {
        expect(applyClassEdit("flex gap-2", { add: ["p-4"] })).toBe("flex gap-2 p-4");
    });

    it("removes classes", () => {
        expect(applyClassEdit("flex gap-2 p-4", { remove: ["p-4"] })).toBe("flex gap-2");
    });

    it("replaces justify class without touching flex-1", () => {
        const result = applyClassEdit("flex-1 justify-start", {
            remove: ["justify-start"],
            add: ["justify-between"],
        });
        expect(result).toBe("flex-1 justify-between");
        expect(result).not.toContain("flex: 1");
    });

    it("dedupes adds", () => {
        expect(applyClassEdit("flex", { add: ["flex", "gap-2"] })).toBe("flex gap-2");
    });

    it("preserves order of existing tokens when adding", () => {
        expect(applyClassEdit("a b c", { add: ["d"] })).toBe("a b c d");
    });
});

describe("getContextAtModelOffset", () => {
    it("finds class context for a token on a later line of a multi-line className", () => {
        const text = `<button\n  className="flex rounded-md gap-2"\n>`;
        const roundedOffset = text.indexOf("rounded-md") + 3;
        const hit = getContextAtModelOffset(text, roundedOffset);
        expect(hit).not.toBeNull();
        expect(hit!.tokenValues).toContain("rounded-md");
    });
});

describe("applyClassEditInContext", () => {
    it("edits only the class string, not surrounding JSX", () => {
        const line = '<div className="flex-1 justify-start" style={{ flex: 1 }}>';
        const ctx = findClassContexts(line)[0];
        const next = applyClassEditInContext(line, ctx, {
            remove: ["justify-start"],
            add: ["justify-between"],
        });
        expect(next).toBe('<div className="flex-1 justify-between" style={{ flex: 1 }}>');
        expect(next).not.toContain("flex: 1; justify-between");
    });

    it("edits cn() argument without mangling line", () => {
        const line = 'cn("rounded-sm p-2", condition && "hidden")';
        const ctx = findClassContexts(line)[0];
        const next = applyClassEditInContext(line, ctx, {
            remove: ["rounded-sm"],
            add: ["rounded-lg"],
        });
        expect(next).toBe('cn("rounded-lg p-2", condition && "hidden")');
    });

    it("does not delete text when removing rounding class", () => {
        const line = 'className="text-sm rounded-md pr-12"';
        const ctx = findClassContexts(line)[0];
        const next = applyClassEditInContext(line, ctx, {
            remove: ["rounded-md"],
            add: ["rounded-lg"],
        });
        expect(next).toBe('className="text-sm rounded-lg pr-12"');
        expect(next).toContain("text-sm");
        expect(next).toContain("pr-12");
    });
});

describe("getClassPrefixAtOffset", () => {
    it("returns partial token being typed", () => {
        const line = 'className="flex gap-"';
        const offset = line.length - 1;
        expect(getClassPrefixAtOffset(line, offset)).toBe("gap-");
    });

    it("returns null outside class context", () => {
        expect(getClassPrefixAtOffset("flex: 1;", 3)).toBeNull();
    });
});

describe("getAllClassTokens", () => {
    it("collects tokens from multiple contexts on one line", () => {
        const line = 'cn("flex-1", className="gap-2")';
        const values = getAllClassTokens(line).map((t) => t.value);
        expect(values).toContain("flex-1");
    });
});
