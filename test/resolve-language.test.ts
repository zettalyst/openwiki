import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { resolveLanguage } from "../src/agent/index.ts";
import type { UpdateMetadata } from "../src/agent/types.ts";

const savedLanguageEnv = process.env.OPENWIKI_LANGUAGE;

function metadata(language?: string): UpdateMetadata {
  return {
    updatedAt: new Date().toISOString(),
    command: "update",
    model: "test-model",
    ...(language === undefined ? {} : { language }),
  };
}

describe("resolveLanguage", () => {
  beforeEach(() => {
    delete process.env.OPENWIKI_LANGUAGE;
  });

  afterEach(() => {
    if (savedLanguageEnv === undefined) {
      delete process.env.OPENWIKI_LANGUAGE;
    } else {
      process.env.OPENWIKI_LANGUAGE = savedLanguageEnv;
    }
  });

  test("defaults to Korean for a new repository", () => {
    expect(resolveLanguage({}, null)).toBe("ko");
  });

  test("treats a legacy wiki without a language field as English", () => {
    expect(resolveLanguage({}, metadata())).toBe("en");
  });

  test("keeps the recorded wiki language over the global env default", () => {
    process.env.OPENWIKI_LANGUAGE = "en";

    expect(resolveLanguage({}, metadata("ko"))).toBe("ko");
    expect(resolveLanguage({}, metadata())).toBe("en");
  });

  test("lets an explicit run option outrank the recorded language", () => {
    expect(resolveLanguage({ language: "ko" }, metadata())).toBe("ko");
    expect(resolveLanguage({ language: "english" }, metadata("ko"))).toBe("en");
  });

  test("uses the env language for repositories without metadata", () => {
    process.env.OPENWIKI_LANGUAGE = "japanese";

    expect(resolveLanguage({}, null)).toBe("ja");
  });

  test("treats an empty env value as unset", () => {
    process.env.OPENWIKI_LANGUAGE = "   ";

    expect(resolveLanguage({}, null)).toBe("ko");
  });

  test("names the source of an invalid language", () => {
    process.env.OPENWIKI_LANGUAGE = "ko;rm";

    expect(() => resolveLanguage({}, null)).toThrow(/OPENWIKI_LANGUAGE/);
    expect(() => resolveLanguage({ language: "b@d" }, null)).toThrow(
      /run options/,
    );
  });
});
