import { describe, expect, test } from "vitest";
import { consumeOpenWikiAgentStream } from "../src/agent/index.ts";

async function* hangingStreamAfterFirstChunk(): AsyncGenerator<unknown> {
  yield {
    type: "event",
    method: "messages",
    params: { namespace: [], data: "hello" },
  };
  await new Promise(() => {
    // Intentionally never resolves.
  });
}

async function* unhandledChunksOnly(): AsyncGenerator<unknown> {
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, 1));
    yield ["internal", { heartbeat: true }];
  }
}

describe("consumeOpenWikiAgentStream", () => {
  test("fails explicitly when the stream stops producing progress", async () => {
    const events: string[] = [];

    await expect(
      consumeOpenWikiAgentStream(
        hangingStreamAfterFirstChunk(),
        {
          onEvent: (event) => {
            if (event.type === "text") {
              events.push(event.text);
            }
          },
        },
        {
          command: "init",
          modelId: "claude-sonnet-5",
          provider: "anthropic",
          timeoutMs: 5,
        },
      ),
    ).rejects.toThrow(
      "OpenWiki agent stream produced no user-visible progress for 5 ms.",
    );

    expect(events).toEqual(["hello"]);
  });

  test("does not treat unhandled internal chunks as progress", async () => {
    await expect(
      consumeOpenWikiAgentStream(
        unhandledChunksOnly(),
        {},
        {
          command: "init",
          modelId: "claude-sonnet-5",
          provider: "anthropic",
          timeoutMs: 10,
        },
      ),
    ).rejects.toThrow(
      "OpenWiki agent stream produced no user-visible progress for 10 ms.",
    );
  });
});
