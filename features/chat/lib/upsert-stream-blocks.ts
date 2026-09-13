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

  return content + chunk;
}
