const TALK_MEDIA_RE = /<(generated_(?:image|svg|audio)|plugin_connect|sent_file)\b[\s\S]*?<\/\1>/gi;

/**
 * Split only on a line the model marked as a new text.
 * Photos and cards are peeled out so they are not trapped inside a text bubble,
 * and consecutive photos stay one burst.
 */
export function talkSegments(content: string): string[] {
    const out: string[] = [];
    for (const chunk of content.split(/\n\s*---\s*\n/)) {
        const media = new RegExp(TALK_MEDIA_RE.source, "gi");
        let last = 0;
        let match: RegExpExecArray | null;
        while ((match = media.exec(chunk))) {
            const before = chunk.slice(last, match.index).trim();
            if (before) out.push(before);
            out.push(match[0].trim());
            last = match.index + match[0].length;
        }
        const rest = chunk.slice(last).trim();
        if (rest) out.push(rest);
    }
    const coalesced: string[] = [];
    let images: string[] = [];
    const flush = () => {
        if (images.length === 0) return;
        coalesced.push(images.join("\n"));
        images = [];
    };
    for (const part of out) {
        if (/^<generated_image\b/i.test(part)) images.push(part);
        else {
            flush();
            coalesced.push(part);
        }
    }
    flush();
    return coalesced.length > 0 ? coalesced : [content.trim()].filter(Boolean);
}

export function isLooseTalkBubble(text: string) {
    const withoutImages = text.replace(/<generated_image\b[\s\S]*?<\/generated_image>/gi, "").trim();
    if (!withoutImages && /<generated_image\b/i.test(text)) return true;
    return /^<(generated_(?:svg|audio)|plugin_connect|sent_file)\b/i.test(text.trim());
}
