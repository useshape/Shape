function upsertReviewDebate(content: string, chunk: string): string | null {
  const start = chunk.indexOf("<review_debate");
  if (start < 0) return null;
  const close = "</review_debate>";
  const end = chunk.indexOf(close, start);
  if (end < 0) return null;
  const block = chunk.slice(start, end + close.length);
  const existing = content.lastIndexOf("<review_debate");
  if (existing < 0) return content + chunk;
  const existingEnd = content.indexOf(close, existing);
  if (existingEnd < 0) return content.slice(0, existing) + block;
  return content.slice(0, existing) + block + content.slice(existingEnd + close.length);
}

export function upsertTaggedBlockInContent(content: string, chunk: string): string {
  const review = upsertReviewDebate(content, chunk);
  if (review !== null) return review;

  const todosStart = chunk.indexOf("<todos");
  if (todosStart >= 0) {
    const todosEnd = chunk.indexOf("</todos>");
    if (todosEnd >= 0) {
      const block = chunk.slice(todosStart, todosEnd + "</todos>".length);
      const existing = content.lastIndexOf("<todos");
      if (existing >= 0) {
        const existingEnd = content.indexOf("</todos>", existing);
        if (existingEnd >= 0) {
          return (
            content.slice(0, existing) +
            block +
            content.slice(existingEnd + "</todos>".length) +
            chunk.slice(0, todosStart) +
            chunk.slice(todosEnd + "</todos>".length)
          );
        }
      }
    }
  }

  const termStart = chunk.indexOf("<terminal_command");
  if (termStart >= 0) {
    const idMatch = chunk.match(/<terminal_command\b[^>]*\bid="([^"]+)"/);
    const termEnd = chunk.indexOf("</terminal_command>");
    if (idMatch && termEnd >= 0) {
      const id = idMatch[1];
      const block = chunk.slice(termStart, termEnd + "</terminal_command>".length);
      const marker = `id="${id}"`;
      const markerPos = content.lastIndexOf(marker);
      if (markerPos >= 0) {
        const start = content.lastIndexOf("<terminal_command", markerPos);
        const existingEnd = content.indexOf("</terminal_command>", markerPos);
        if (start >= 0 && existingEnd >= 0) {
          return (
            content.slice(0, start) +
            block +
            content.slice(existingEnd + "</terminal_command>".length) +
            chunk.slice(0, termStart) +
            chunk.slice(termEnd + "</terminal_command>".length)
          );
        }
      }
    }
  }

  const askStart = chunk.indexOf("<questions");
  if (askStart >= 0) {
    const idMatch = chunk.match(/<questions\b[^>]*\bid="([^"]+)"/);
    const askEnd = chunk.indexOf("</questions>");
    if (idMatch && askEnd >= 0) {
      const id = idMatch[1];
      const block = chunk.slice(askStart, askEnd + "</questions>".length);
      const marker = `id="${id}"`;
      const markerPos = content.lastIndexOf(marker);
      if (markerPos >= 0) {
        const start = content.lastIndexOf("<questions", markerPos);
        const existingEnd = content.indexOf("</questions>", markerPos);
        if (start >= 0 && existingEnd >= 0) {
          return (
            content.slice(0, start) +
            block +
            content.slice(existingEnd + "</questions>".length) +
            chunk.slice(0, askStart) +
            chunk.slice(askEnd + "</questions>".length)
          );
        }
      }
    }
  }

  const previewStart = chunk.indexOf("<design_previews");
  if (previewStart >= 0) {
    const idMatch = chunk.match(/<design_previews\b[^>]*\bid="([^"]+)"/);
    const previewEnd = chunk.indexOf("</design_previews>");
    if (idMatch && previewEnd >= 0) {
      const id = idMatch[1];
      const block = chunk.slice(previewStart, previewEnd + "</design_previews>".length);
      const marker = `id="${id}"`;
      const markerPos = content.lastIndexOf(marker);
      if (markerPos >= 0) {
        const start = content.lastIndexOf("<design_previews", markerPos);
        const existingEnd = content.indexOf("</design_previews>", markerPos);
        if (start >= 0 && existingEnd >= 0) {
          return (
            content.slice(0, start) +
            block +
            content.slice(existingEnd + "</design_previews>".length) +
            chunk.slice(0, previewStart) +
            chunk.slice(previewEnd + "</design_previews>".length)
          );
        }
      }
    }
  }

  const browseOpen = "<browse_session";
  const browseClose = "</browse_session>";
  const browseStart = chunk.indexOf(browseOpen);
  const browseEnd = chunk.indexOf(browseClose);
  if (browseStart >= 0 && browseEnd >= 0) {
    const block = chunk.slice(browseStart, browseEnd + browseClose.length);
    const existing = content.lastIndexOf(browseOpen);
    if (existing >= 0) {
      const existingClose = content.indexOf(browseClose, existing);
      const existingEnd = existingClose >= 0 ? existingClose + browseClose.length : content.length;
      return (
        content.slice(0, existing) +
        block +
        content.slice(existingEnd) +
        chunk.slice(0, browseStart) +
        chunk.slice(browseEnd + browseClose.length)
      );
    }
  }

  for (const tag of ["generated_svg", "generated_image", "generated_audio"] as const) {
    const open = `<${tag}`;
    const close = `</${tag}>`;
    const start = chunk.indexOf(open);
    const endRel = chunk.indexOf(close);
    if (start < 0 || endRel < 0) continue;
    const block = chunk.slice(start, endRel + close.length);
    const mediaId = block.match(/\bmedia_id="([^"]*)"/)?.[1];
    if (!mediaId) continue;
    const marker = `media_id="${mediaId}"`;
    const markerPos = content.lastIndexOf(marker);
    if (markerPos < 0) continue;
    const existing = content.lastIndexOf(open, markerPos);
    const existingClose = content.indexOf(close, markerPos);
    if (existing < 0 || existingClose < 0) continue;
    return (
      content.slice(0, existing) +
      block +
      content.slice(existingClose + close.length) +
      chunk.slice(0, start) +
      chunk.slice(endRel + close.length)
    );
  }

  return content + chunk;
}
