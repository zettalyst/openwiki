import { describe, expect, test } from "vitest";
import { parseCommand } from "../src/commands.ts";

describe("parseCommand --language", () => {
  test("defaults to no explicit language", () => {
    const command = parseCommand(["--init"]);

    expect(command).toMatchObject({
      kind: "run",
      command: "init",
      language: null,
    });
  });

  test("parses a space-separated language", () => {
    const command = parseCommand(["--init", "--language", "ko"]);

    expect(command).toMatchObject({ kind: "run", language: "ko" });
  });

  test("parses an equals-separated language", () => {
    const command = parseCommand(["--update", "--language=en"]);

    expect(command).toMatchObject({
      kind: "run",
      command: "update",
      language: "en",
    });
  });

  test("normalizes language aliases", () => {
    expect(parseCommand(["--init", "--language", "Korean"])).toMatchObject({
      language: "ko",
    });
    expect(parseCommand(["--init", "--language", "한국어"])).toMatchObject({
      language: "ko",
    });
    expect(parseCommand(["--init", "--lang", "English"])).toMatchObject({
      language: "en",
    });
  });

  test("rejects a missing language value", () => {
    expect(parseCommand(["--init", "--language"])).toMatchObject({
      kind: "error",
      exitCode: 1,
    });
    expect(parseCommand(["--init", "--language", "--print"])).toMatchObject({
      kind: "error",
      exitCode: 1,
    });
  });

  test("rejects an invalid language value", () => {
    expect(parseCommand(["--init", "--language=ko;rm"])).toMatchObject({
      kind: "error",
      exitCode: 1,
    });
    expect(parseCommand(["--init", "--language="])).toMatchObject({
      kind: "error",
      exitCode: 1,
    });
  });

  test("keeps the language out of the user message", () => {
    const command = parseCommand([
      "--update",
      "--language",
      "ko",
      "Document",
      "the",
      "API",
    ]);

    expect(command).toMatchObject({
      kind: "run",
      language: "ko",
      userMessage: "Document the API",
    });
  });
});
