import { describe, expect, it } from "vitest";
import { jsxClassExpressionKind } from "@/features/preview/design/apply/locate-jsx";

describe("dynamic className detection", () => {
    it("classifies literal and helper forms as patchable kinds", () => {
        expect(jsxClassExpressionKind(`<div className="flex gap-2">`)).toBe("literal");
        expect(jsxClassExpressionKind(`<div className={'flex'}>`)).toBe("literal");
        expect(jsxClassExpressionKind(`<div className={cn("flex", cond && "hidden")}>`)).toBe("cn");
        expect(jsxClassExpressionKind(`<div className={styles.root}>`)).toBe("module");
    });

    it("flags template, spread, and opaque expressions as unsafe", () => {
        expect(jsxClassExpressionKind(`<div className={\`flex \${x}\`}>`)).toBe("template");
        expect(jsxClassExpressionKind(`<div className={...cls}>`)).toBe("spread");
        expect(jsxClassExpressionKind(`<div className={compute()}>`)).toBe("expression");
        expect(jsxClassExpressionKind(`<div className={condition ? "a" : "b"}>`)).toBe("expression");
    });
});
