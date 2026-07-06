import type { ClientOptions } from "@anthropic-ai/sdk";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { beforeEach, afterEach, describe, expect, test } from "vitest";
import { createModel } from "../src/agent/index.ts";
import {
  CLAUDE_CODE_OAUTH_BILLING_SYSTEM_TEXT,
  DEFAULT_ANTHROPIC_EFFORT_MAX_OUTPUT_TOKENS,
  getDefaultModelId,
  resolveAnthropicModelEffort,
} from "../src/constants.ts";

const credentialEnvKeys = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "OPENWIKI_MODEL_EFFORT",
] as const;

type AnthropicClientForTest = {
  apiKey: string | null;
  authToken: string | null;
  _options: {
    defaultHeaders: Headers;
  };
};

type ClientFactoryModel = {
  createClient: (options: ClientOptions) => AnthropicClientForTest;
};

const originalEnv = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of credentialEnvKeys) {
    originalEnv.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of credentialEnvKeys) {
    const originalValue = originalEnv.get(key);

    if (originalValue === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalValue;
    }
  }

  originalEnv.clear();
});

describe("createModel Anthropic credentials", () => {
  test("uses API key credentials on the existing ChatAnthropic path", async () => {
    process.env.ANTHROPIC_API_KEY = "anthropic-api-key";

    const model = await createModel("anthropic", "claude-sonnet-5");

    expect((model as { apiKey?: string }).apiKey).toBe("anthropic-api-key");
  });

  test("fails before model creation when an OAuth token is placed in ANTHROPIC_API_KEY", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-oat01-misplaced-oauth-token";

    await expect(createModel("anthropic", "claude-sonnet-5")).rejects.toThrow(
      "ANTHROPIC_API_KEY appears to contain an Anthropic OAuth token.",
    );
  });

  test("injects bearer auth client with OAuth beta header for ANTHROPIC_AUTH_TOKEN", async () => {
    process.env.ANTHROPIC_AUTH_TOKEN = "anthropic-auth-token";
    process.env.ANTHROPIC_API_KEY = "anthropic-api-key";

    const model = await createModel("anthropic", "claude-sonnet-5");
    const client = (model as ClientFactoryModel).createClient({
      apiKey: "langchain-api-key",
      defaultHeaders: {
        "anthropic-beta": "existing-beta",
      },
    });

    expect(client.apiKey).toBeNull();
    expect(client.authToken).toBe("anthropic-auth-token");
    expect(client._options.defaultHeaders.get("anthropic-beta")).toBe(
      "existing-beta, oauth-2025-04-20",
    );
  });

  test("uses CLAUDE_CODE_OAUTH_TOKEN as bearer auth fallback", async () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "claude-code-oauth-token";

    const model = await createModel("anthropic", "claude-sonnet-5");
    const client = (model as ClientFactoryModel).createClient({});

    expect(client.apiKey).toBeNull();
    expect(client.authToken).toBe("claude-code-oauth-token");
    expect(client._options.defaultHeaders.get("anthropic-beta")).toBe(
      "oauth-2025-04-20",
    );
  });

  test("prepends Claude Code OAuth billing system block for CLAUDE_CODE_OAUTH_TOKEN", async () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "claude-code-oauth-token";

    const model = await createModel("anthropic", "claude-sonnet-5");
    let capturedRequest: unknown;

    (
      model as {
        completionWithRetry: (request: unknown) => Promise<unknown>;
      }
    ).completionWithRetry = async (request) => {
      capturedRequest = request;

      return {
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-5",
        content: [{ type: "text", text: "OK" }],
        stop_reason: "end_turn",
        stop_sequence: null,
        stop_details: null,
        usage: {
          input_tokens: 1,
          output_tokens: 1,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      };
    };

    await (
      model as {
        _generate: (
          messages: [SystemMessage, HumanMessage],
          options: Record<string, never>,
        ) => Promise<unknown>;
      }
    )._generate(
      [new SystemMessage("Existing system."), new HumanMessage("Hi.")],
      {},
    );

    expect(capturedRequest).toMatchObject({
      system: [
        {
          type: "text",
          text: CLAUDE_CODE_OAUTH_BILLING_SYSTEM_TEXT,
        },
        {
          type: "text",
          text: "Existing system.",
        },
      ],
    });
  });
});

describe("Anthropic default model and effort", () => {
  test("defaults the Anthropic provider to Opus 4.8", () => {
    expect(getDefaultModelId("anthropic")).toBe("claude-opus-4-8");
  });

  test("defaults xhigh-capable models to xhigh effort", () => {
    expect(resolveAnthropicModelEffort("claude-opus-4-8", {})).toBe("xhigh");
    expect(resolveAnthropicModelEffort("claude-sonnet-5", {})).toBe("xhigh");
  });

  test("sends no effort for models without adaptive reasoning", () => {
    expect(resolveAnthropicModelEffort("claude-haiku-4-5", {})).toBeNull();
    expect(
      resolveAnthropicModelEffort("claude-haiku-4-5", {
        OPENWIKI_MODEL_EFFORT: "xhigh",
      }),
    ).toBeNull();
  });

  test("leaves 4.6-family models on the API default effort", () => {
    expect(resolveAnthropicModelEffort("claude-opus-4-6", {})).toBeNull();
    expect(
      resolveAnthropicModelEffort("claude-opus-4-6", {
        OPENWIKI_MODEL_EFFORT: "max",
      }),
    ).toBe("max");
  });

  test("honors OPENWIKI_MODEL_EFFORT overrides and disable values", () => {
    expect(
      resolveAnthropicModelEffort("claude-opus-4-8", {
        OPENWIKI_MODEL_EFFORT: "medium",
      }),
    ).toBe("medium");
    expect(
      resolveAnthropicModelEffort("claude-opus-4-8", {
        OPENWIKI_MODEL_EFFORT: "none",
      }),
    ).toBeNull();
    expect(
      resolveAnthropicModelEffort("claude-opus-4-8", {
        OPENWIKI_MODEL_EFFORT: "bogus",
      }),
    ).toBe("xhigh");
  });

  test("configures Opus 4.8 with adaptive thinking, xhigh effort, and output headroom", async () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "claude-code-oauth-token";

    const model = (await createModel("anthropic", "claude-opus-4-8")) as {
      maxTokens: number;
      outputConfig?: { effort?: string };
      thinking?: { type?: string };
    };

    expect(model.thinking).toMatchObject({ type: "adaptive" });
    expect(model.outputConfig).toMatchObject({ effort: "xhigh" });
    expect(model.maxTokens).toBe(DEFAULT_ANTHROPIC_EFFORT_MAX_OUTPUT_TOKENS);
  });

  test("keeps Haiku on plain API defaults", async () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "claude-code-oauth-token";

    const model = (await createModel("anthropic", "claude-haiku-4-5")) as {
      outputConfig?: { effort?: string };
      thinking?: { type?: string };
    };

    expect(model.outputConfig?.effort).toBeUndefined();
    expect(model.thinking?.type ?? "disabled").not.toBe("adaptive");
  });
});
