import { describe, expect, test } from "vitest";
import { consumeOpenWikiAgentStream } from "../src/agent/index.ts";

async function* hangingStreamAfterFirstChunk(): AsyncGenerator<unknown> {
  yield ["messages", "hello"];
  await new Promise(() => {
    // Intentionally never resolves.
  });
}

describe("consumeOpenWikiAgentStream", () => {
  test("fails explicitly when the stream stops producing events", async () => {
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
    ).rejects.toThrow("OpenWiki agent stream produced no events for 5 ms.");

    expect(events).toEqual(["hello"]);
  });
});
