import { describe, expect, test } from "vitest";
import {
  createProviderCredentialConfigurationError,
  createProviderCredentialRequiredMessage,
  resolveProviderCredential,
} from "../src/constants.ts";

describe("resolveProviderCredential", () => {
  test("prioritizes Anthropic auth token over API key and Claude Code OAuth token", () => {
    const credential = resolveProviderCredential("anthropic", {
      ANTHROPIC_AUTH_TOKEN: "anthropic-auth-token",
      ANTHROPIC_API_KEY: "anthropic-api-key",
      CLAUDE_CODE_OAUTH_TOKEN: "claude-code-oauth-token",
    });

    expect(credential).toEqual({
      envKey: "ANTHROPIC_AUTH_TOKEN",
      type: "auth-token",
      value: "anthropic-auth-token",
    });
  });

  test("uses Anthropic API key before Claude Code OAuth token", () => {
    const credential = resolveProviderCredential("anthropic", {
      ANTHROPIC_API_KEY: "anthropic-api-key",
      CLAUDE_CODE_OAUTH_TOKEN: "claude-code-oauth-token",
    });

    expect(credential).toEqual({
      envKey: "ANTHROPIC_API_KEY",
      type: "api-key",
      value: "anthropic-api-key",
    });
  });

  test("uses Claude Code OAuth token as Anthropic fallback credential", () => {
    const credential = resolveProviderCredential("anthropic", {
      CLAUDE_CODE_OAUTH_TOKEN: "claude-code-oauth-token",
    });

    expect(credential).toEqual({
      envKey: "CLAUDE_CODE_OAUTH_TOKEN",
      type: "auth-token",
      value: "claude-code-oauth-token",
    });
  });

  test("keeps non-Anthropic providers on their existing API key env", () => {
    expect(
      resolveProviderCredential("openai", {
        ANTHROPIC_AUTH_TOKEN: "anthropic-auth-token",
        OPENAI_API_KEY: "openai-api-key",
      }),
    ).toEqual({
      envKey: "OPENAI_API_KEY",
      type: "api-key",
      value: "openai-api-key",
    });

    expect(
      resolveProviderCredential("openai", {
        ANTHROPIC_AUTH_TOKEN: "anthropic-auth-token",
      }),
    ).toBeNull();
  });
});

describe("createProviderCredentialConfigurationError", () => {
  test("rejects OAuth tokens placed in ANTHROPIC_API_KEY", () => {
    expect(
      createProviderCredentialConfigurationError("anthropic", {
        ANTHROPIC_API_KEY: "sk-ant-oat01-misplaced-oauth-token",
      }),
    ).toBe(
      "ANTHROPIC_API_KEY appears to contain an Anthropic OAuth token. Move it to ANTHROPIC_AUTH_TOKEN or CLAUDE_CODE_OAUTH_TOKEN, or replace ANTHROPIC_API_KEY with an Anthropic Console API key.",
    );
  });

  test("allows ANTHROPIC_AUTH_TOKEN to take priority over a misplaced API key value", () => {
    expect(
      createProviderCredentialConfigurationError("anthropic", {
        ANTHROPIC_AUTH_TOKEN: "sk-ant-oat01-valid-auth-token",
        ANTHROPIC_API_KEY: "sk-ant-oat01-misplaced-oauth-token",
      }),
    ).toBeNull();
  });

  test("does not apply Anthropic credential placement checks to other providers", () => {
    expect(
      createProviderCredentialConfigurationError("openai", {
        ANTHROPIC_API_KEY: "sk-ant-oat01-misplaced-oauth-token",
      }),
    ).toBeNull();
  });
});

describe("createProviderCredentialRequiredMessage", () => {
  test("lists all Anthropic credential options for non-interactive runs", () => {
    expect(
      createProviderCredentialRequiredMessage("anthropic", "non-interactive"),
    ).toBe(
      "ANTHROPIC_AUTH_TOKEN, ANTHROPIC_API_KEY, or CLAUDE_CODE_OAUTH_TOKEN is required for non-interactive runs. Run openwiki in an interactive terminal to save credentials.",
    );
  });

  test("keeps other providers on their single API key message", () => {
    expect(
      createProviderCredentialRequiredMessage("openrouter", "non-interactive"),
    ).toBe(
      "OPENROUTER_API_KEY is required for non-interactive runs. Run openwiki in an interactive terminal to save credentials.",
    );
  });
});
