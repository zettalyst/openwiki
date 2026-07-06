import { describe, expect, test } from "vitest";
import { createSystemPrompt } from "../src/agent/prompt.ts";

describe("createSystemPrompt", () => {
  test("requires full documentation pages to be written with write_file", () => {
    const prompt = createSystemPrompt("init");

    expect(prompt).toContain(
      "use write_file with the complete final Markdown content",
    );
    expect(prompt).toContain("Do not create placeholder files");
    expect(prompt).toContain("Do not use edit_file to fill an empty file");
  });

  test("keeps the initial wiki focused", () => {
    const prompt = createSystemPrompt("init");

    expect(prompt).toContain("Use at most 4 documentation pages");
    expect(prompt).toContain("quickstart.md plus 2-3 broad, canonical pages");
    expect(prompt).toContain("do not start more than 2 subagents");
    expect(prompt).toContain("Target 600-1000 words per page");
  });
});
