import postcss, { type AtRule, type Declaration, type Node, type Rule } from "postcss";

export function validateCssSource(css: string): string | null {
    try {
        postcss.parse(css);
        return null;
    } catch (e) {
        return e instanceof Error ? e.message : "CSS parse failed.";
    }
}

function mediaContext(node: Node): string {
    const parts: string[] = [];
    let parent: Node | undefined = node.parent as Node | undefined;
    while (parent) {
        if (parent.type === "atrule" && (parent as AtRule).name === "media") {
            parts.unshift((parent as AtRule).params);
        }
        parent = parent.parent as Node | undefined;
    }
    return parts.join(" and ");
}

function layerContext(node: Node): string {
    const parts: string[] = [];
    let parent: Node | undefined = node.parent as Node | undefined;
    while (parent) {
        if (parent.type === "atrule" && (parent as AtRule).name === "layer") {
            parts.unshift((parent as AtRule).params);
        }
        parent = parent.parent as Node | undefined;
    }
    return parts.join(".");
}

function selectorHitsClass(rule: Rule, local: string): boolean {
    const want = `.${local}`;
    return rule.selectors.some((s) => s.trim() === want);
}

export function patchCssClass(
    css: string,
    local: string,
    decls: { prop: string; value: string }[],
    opts?: { media?: string; layer?: string },
): { css: string } | { error: string } {
    let root;
    try {
        root = postcss.parse(css);
    } catch (e) {
        return { error: e instanceof Error ? e.message : "CSS parse failed." };
    }

    const matches: Rule[] = [];
    root.walkRules((rule) => {
        if (!selectorHitsClass(rule, local)) return;
        if (rule.selectors.length > 1) return;
        if (opts?.media) {
            const media = mediaContext(rule);
            if (media && media !== opts.media && !media.includes(opts.media) && !opts.media.includes(media)) return;
        }
        if (opts?.layer) {
            const layer = layerContext(rule);
            if (layer && layer !== opts.layer) return;
        }
        matches.push(rule);
    });

    if (matches.length > 1 && opts?.media) {
        const scoped = matches.filter((r) => mediaContext(r) === opts.media);
        if (scoped.length === 1) matches.splice(0, matches.length, scoped[0]!);
    }

    if (matches.length > 1) {
        return {
            error: `Multiple .${local} rules match; cannot safely edit without a unique media/layer context.`,
        };
    }

    let target = matches[0];
    if (!target) {
        target = postcss.rule({ selector: `.${local}` });
        for (const d of decls) target.append({ prop: d.prop, value: d.value });
        if (opts?.media) {
            const at = postcss.atRule({ name: "media", params: opts.media });
            at.append(target);
            root.append(at);
        } else {
            root.append(target);
        }
        return { css: root.toResult({ map: false }).css };
    }

    if (target.selectors.length > 1) {
        return { error: `.${local} is grouped with other selectors; cannot safely edit.` };
    }

    for (const d of decls) {
        let found = false;
        target.walkDecls(d.prop, (decl) => {
            decl.value = d.value;
            found = true;
        });
        if (!found) target.append({ prop: d.prop, value: d.value });
    }
    return { css: root.toResult({ map: false }).css };
}

export function patchCustomProperty(
    css: string,
    name: string,
    value: string,
): { css: string } | { error: string } {
    let root;
    try {
        root = postcss.parse(css);
    } catch (e) {
        return { error: e instanceof Error ? e.message : "CSS parse failed." };
    }
    const hits: Declaration[] = [];
    root.walkDecls(name, (decl) => {
        hits.push(decl);
    });
    if (hits.length === 0) return { error: `${name} is not declared in this stylesheet.` };
    if (hits.length > 1) {
        return { error: `${name} is declared ${hits.length} times; cannot safely choose one.` };
    }
    hits[0]!.value = value;
    return { css: root.toResult({ map: false }).css };
}
