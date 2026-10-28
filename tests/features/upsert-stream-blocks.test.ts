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

    it("keeps each generated image and only replaces the same media id", () => {
        const first = '<generated_image media_id="a" model="klein">https://cdn/a.png</generated_image>';
        const second = '<generated_image media_id="b" model="klein">https://cdn/b.png</generated_image>';
        const both = upsertTaggedBlockInContent(first, second);
        expect(both.match(/<generated_image/g)).toHaveLength(2);
        expect(both).toContain("https://cdn/a.png");
        expect(both).toContain("https://cdn/b.png");
        const revised = '<generated_image media_id="b" model="klein">https://cdn/b2.png</generated_image>';
        const updated = upsertTaggedBlockInContent(both, revised);
        expect(updated.match(/<generated_image/g)).toHaveLength(2);
        expect(updated).toContain("https://cdn/a.png");
        expect(updated).toContain("https://cdn/b2.png");
        expect(updated).not.toContain("https://cdn/b.png");
    });

    it("replaces a running adversarial review instead of stacking a second one", () => {
        const running = '<review_debate model="auto" status="running"></review_debate>';
        const done = '<review_debate model="auto" status="done">\n**Confirmed issues**\n- auth check missing\n</review_debate>';
        const out = upsertTaggedBlockInContent(`Notes\n${running}\n`, `\n${done}\n`);
        expect(out.match(/<review_debate/g)).toHaveLength(1);
        expect(out).toContain('status="done"');
        expect(out).not.toContain('status="running"');
        expect(out).toContain("auth check missing");
        expect(out.startsWith("Notes")).toBe(true);
    });

    it("appends plain text chunks unchanged", () => {
    expect(upsertTaggedBlockInContent("a", "b")).toBe("ab");

    const first = '<browse_session id="live" status="controlling" url="https://a.test" title="A"></browse_session>';
    const second = '<browse_session id="live" status="controlling" url="https://b.test" title="B"></browse_session>';
    const replaced = upsertTaggedBlockInContent(`Hello\n${first}\n`, `\n${second}\n`);
    expect(replaced.match(/<browse_session/g)).toHaveLength(1);
    expect(replaced).toContain("https://b.test");
    expect(replaced).not.toContain("https://a.test");
  });
});
