export type DesignExportFormat = "png" | "svg" | "pdf" | "webm";

export const DESIGN_EXPORT_FORMAT_OPTIONS: { id: DesignExportFormat; label: string }[] = [
    { id: "png", label: "PNG" },
    { id: "svg", label: "SVG" },
    { id: "pdf", label: "PDF" },
    { id: "webm", label: "WebM" },
];

export const DESIGN_EXPORT_SCALES = [1, 2, 4] as const;

export type DesignExportPayload = {
    format: DesignExportFormat;
    scale: number;
    mime: string;
    dataUrl: string;
    width: number;
    height: number;
    error?: string;
};

function dataUrlToBytes(dataUrl: string): Uint8Array {
    const comma = dataUrl.indexOf(",");
    const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

function jpegToPdf(jpeg: Uint8Array, widthPx: number, heightPx: number): Uint8Array {
    const w = Math.max(1, Math.round((widthPx * 72) / 96));
    const h = Math.max(1, Math.round((heightPx * 72) / 96));
    const encoder = new TextEncoder();
    const objects: Uint8Array[] = [];
    const push = (body: string, binary?: Uint8Array) => {
        const head = encoder.encode(body);
        if (!binary) {
            objects.push(head);
            return;
        }
        const merged = new Uint8Array(head.length + binary.length + 20);
        merged.set(head);
        merged.set(binary, head.length);
        merged.set(encoder.encode("\nendstream\nendobj\n"), head.length + binary.length);
        objects.push(merged.slice(0, head.length + binary.length + 19));
    };
    push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
    push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
    push(
        `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
    );
    const imgHeader = encoder.encode(
        `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    );
    const imgTail = encoder.encode("\nendstream\nendobj\n");
    const imgObj = new Uint8Array(imgHeader.length + jpeg.length + imgTail.length);
    imgObj.set(imgHeader);
    imgObj.set(jpeg, imgHeader.length);
    imgObj.set(imgTail, imgHeader.length + jpeg.length);
    objects.push(imgObj);
    const content = `5 0 obj\n<< /Length ${`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`.length} >>\nstream\nq ${w} 0 0 ${h} 0 0 cm /Im0 Do Q\nendstream\nendobj\n`;
    push(content);

    let offset = "%PDF-1.4\n".length;
    const offsets = [0];
    for (const obj of objects) {
        offsets.push(offset);
        offset += obj.length;
    }
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i < offsets.length; i++) {
        xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    }
    const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
    const head = encoder.encode("%PDF-1.4\n");
    const mid = objects.reduce((n, o) => n + o.length, 0);
    const tail = encoder.encode(xref + trailer);
    const out = new Uint8Array(head.length + mid + tail.length);
    out.set(head);
    let at = head.length;
    for (const obj of objects) {
        out.set(obj, at);
        at += obj.length;
    }
    out.set(tail, at);
    return out;
}

async function pngDataUrlToJpeg(dataUrl: string, width: number, height: number): Promise<Uint8Array> {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not encode the export.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const jpegUrl = canvas.toDataURL("image/jpeg", 0.92);
    return dataUrlToBytes(jpegUrl);
}

async function pngDataUrlToWebm(dataUrl: string, width: number, height: number): Promise<Uint8Array> {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not encode the export.");
    const draw = () => {
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
    };
    draw();
    const stream = canvas.captureStream(15);
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm";
    const rec = new MediaRecorder(stream, { mimeType: mime });
    const chunks: BlobPart[] = [];
    rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
    };
    const done = new Promise<Blob>((resolve, reject) => {
        rec.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
        rec.onerror = () => reject(new Error("WebM encode failed."));
    });
    rec.start();
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    draw();
    await new Promise((r) => setTimeout(r, 120));
    rec.stop();
    stream.getTracks().forEach((t) => t.stop());
    const blob = await done;
    return new Uint8Array(await blob.arrayBuffer());
}

export async function encodeDesignExport(
    payload: DesignExportPayload,
): Promise<{ bytes: Uint8Array; mime: string; ext: string }> {
    if (payload.error) throw new Error(payload.error);
    if (payload.format === "svg") {
        const text = payload.dataUrl.startsWith("data:")
            ? decodeURIComponent(payload.dataUrl.slice(payload.dataUrl.indexOf(",") + 1))
            : payload.dataUrl;
        return { bytes: new TextEncoder().encode(text), mime: "image/svg+xml", ext: "svg" };
    }
    if (payload.format === "png") {
        return { bytes: dataUrlToBytes(payload.dataUrl), mime: "image/png", ext: "png" };
    }
    if (payload.format === "pdf") {
        const jpeg = await pngDataUrlToJpeg(payload.dataUrl, payload.width, payload.height);
        return { bytes: jpegToPdf(jpeg, payload.width, payload.height), mime: "application/pdf", ext: "pdf" };
    }
    return {
        bytes: await pngDataUrlToWebm(payload.dataUrl, payload.width, payload.height),
        mime: "video/webm",
        ext: "webm",
    };
}

export async function saveDesignExport(payload: DesignExportPayload, suggested: string): Promise<string | null> {
    const { bytes, ext } = await encodeDesignExport(payload);
    const { save } = await import("@tauri-apps/plugin-dialog");
    const dest = await save({
        defaultPath: `${suggested}.${ext}`,
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    });
    if (!dest) return null;
    const { commands } = await import("@/lib/backend");
    await commands.saveFileBytes(dest, Array.from(bytes));
    return dest;
}
