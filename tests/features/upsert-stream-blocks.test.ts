import { describe, expect, it } from "vitest";
import { upsertTaggedBlockInContent } from "@/features/chat/lib/upsert-stream-blocks";

describe("upsertTaggedBlockInContent", () => {
  it("replaces an existing todos block instead of appending a duplicate", () => {
    const content =
      "Working.\n<todos>\n- [ ] One\n</todos>\nMore text.";
    const chunk = "<todos>\n- [x] One\n- [ ] Two\n</todos>";
    const out = upsertTaggedBlockInContent(content, chunk);
    expect(out.match(/<todos/g)?.length).toBe(1);
    expect(out).toContain("- [x] One");
    expect(out).toContain("- [ ] Two");
    expect(out).toContain("Working.");
    expect(out).toContain("More text.");
  });

  it("appends todos when none exist yet", () => {
    const out = upsertTaggedBlockInContent("Hello.", "<todos>\n- [ ] A\n</todos>");
    expect(out).toBe("Hello.<todos>\n- [ ] A\n</todos>");
  });

  it("replaces terminal_command by id and keeps other commands", () => {
    const content =
      `<terminal_command status="running" id="a">npm test</terminal_command>\n` +
      `<terminal_command status="running" id="b">npm build</terminal_command>`;
    const chunk =
      `<terminal_command status="completed" id="a" exit="0">npm test\nok</terminal_command>`;
    const out = upsertTaggedBlockInContent(content, chunk);
    expect(out.match(/<terminal_command/g)?.length).toBe(2);
    expect(out).toContain('status="completed" id="a"');
    expect(out).toContain('status="running" id="b"');
    expect(out).not.toContain('status="running" id="a"');
  });

  it("appends terminal_command when id is new", () => {
    const content = `<terminal_command status="completed" id="a">done</terminal_command>`;
    const chunk = `<terminal_command status="running" id="b">new</terminal_command>`;
    const out = upsertTaggedBlockInContent(content, chunk);
    expect(out.match(/<terminal_command/g)?.length).toBe(2);
    expect(out.endsWith(chunk)).toBe(true);
  });

  it("appends plain text chunks unchanged", () => {
    expect(upsertTaggedBlockInContent("a", "b")).toBe("ab");
  });
});
