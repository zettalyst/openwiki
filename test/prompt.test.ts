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
});
