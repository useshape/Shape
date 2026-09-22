export function upsertTaggedBlockInContent(content: string, chunk: string): string {
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

  for (const tag of ["generated_svg", "generated_image"] as const) {
    const open = `<${tag}`;
    const close = `</${tag}>`;
    const start = chunk.indexOf(open);
    const endRel = chunk.indexOf(close);
    if (start < 0 || endRel < 0) continue;
    const block = chunk.slice(start, endRel + close.length);
    const existing = content.lastIndexOf(open);
    if (existing < 0) continue;
    const existingClose = content.indexOf(close, existing);
    const existingEnd = existingClose >= 0 ? existingClose + close.length : content.length;
    return (
      content.slice(0, existing) +
      block +
      content.slice(existingEnd) +
      chunk.slice(0, start) +
      chunk.slice(endRel + close.length)
    );
  }

  return content + chunk;
}
