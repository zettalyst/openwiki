import { describe, expect, test } from "vitest";
import {
  createModeInstructions,
  createSystemPrompt,
  createUserPrompt,
} from "../src/agent/prompt.ts";

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

  test("writes documentation in Korean by default", () => {
    const prompt = createSystemPrompt("init");

    expect(prompt).toContain(
      "Write all wiki documentation content in Korean (한국어)",
    );
    expect(prompt).toContain("never treat its English wording as stale");
    expect(prompt).toContain(
      "Keep every documentation file name and directory name in English",
    );
    expect(prompt).toContain("overrides the surgical-update restrictions");
  });

  test("supports an explicit documentation language", () => {
    const prompt = createSystemPrompt("init", { language: "en" });

    expect(prompt).toContain("Write all wiki documentation content in English");
    expect(prompt).not.toContain("Korean (한국어):");
  });
});

describe("language migration mode", () => {
  const migrationOptions = { language: "ko", isLanguageMigration: true };

  test("replaces the surgical update instructions for update runs", () => {
    const instructions = createModeInstructions("update", migrationOptions);

    expect(instructions).toContain("documentation language migration run");
    expect(instructions).toContain(
      "rewrite every wiki page in Korean (한국어)",
    );
    expect(instructions).toContain("every wiki page must be converted");
    expect(instructions).not.toContain("maintenance update run");
  });

  test("keeps normal update instructions when no migration is needed", () => {
    const instructions = createModeInstructions("update", {
      language: "ko",
      isLanguageMigration: false,
    });

    expect(instructions).toContain("maintenance update run");
    expect(instructions).not.toContain("language migration run");
  });

  test("uses a migration user prompt for update runs", () => {
    const context = { lastUpdate: null, gitSummary: "(no output)" };
    const userPrompt = createUserPrompt(
      "update",
      context,
      null,
      migrationOptions,
    );

    expect(userPrompt).toContain(
      "Migrate the existing OpenWiki documentation for this repository to Korean (한국어)",
    );
    expect(userPrompt).not.toContain("Keep edits surgical");
  });
});
