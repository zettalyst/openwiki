import { describe, expect, test, vi } from "vitest";
import { ToolMessage } from "@langchain/core/messages";
import {
  createWriteTodosInputNormalizerMiddleware,
  normalizeWriteTodosToolArgs,
} from "../src/agent/todo-normalizer.ts";

describe("normalizeWriteTodosToolArgs", () => {
  test("adds pending status to todos that omit status", () => {
    expect(
      normalizeWriteTodosToolArgs({
        todos: [
          { content: "Read source", status: "completed" },
          { content: "Write docs" },
        ],
      }),
    ).toEqual({
      todos: [
        { content: "Read source", status: "completed" },
        { content: "Write docs", status: "pending" },
      ],
    });
  });

  test("leaves non-write_todos-shaped input untouched", () => {
    const input = { items: [{ content: "No todos key" }] };

    expect(normalizeWriteTodosToolArgs(input)).toBe(input);
    expect(normalizeWriteTodosToolArgs(null)).toBeNull();
  });

  test("does not hide invalid explicit status values", () => {
    const input = { todos: [{ content: "Bad status", status: "done" }] };

    expect(normalizeWriteTodosToolArgs(input)).toBe(input);
  });
});

describe("createWriteTodosInputNormalizerMiddleware", () => {
  test("rejects write_file calls without non-empty content before backend writes", async () => {
    const middleware = createWriteTodosInputNormalizerMiddleware();
    const handler = vi.fn();

    const result = await middleware.wrapToolCall?.(
      {
        toolCall: {
          id: "call_write_empty",
          name: "write_file",
          args: {
            file_path: "/openwiki/architecture/runtime-layers.md",
            content: "",
          },
        },
        tool: undefined,
        state: { messages: [] },
        runtime: {} as never,
      },
      handler,
    );

    expect(handler).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      content: expect.stringContaining("write_file was called without"),
      name: "write_file",
      status: "error",
      tool_call_id: "call_write_empty",
    });
  });

  test("returns a tool-visible schema error instead of crashing the run", async () => {
    const middleware = createWriteTodosInputNormalizerMiddleware();

    const result = await middleware.wrapToolCall?.(
      {
        toolCall: {
          id: "call_1",
          name: "edit_file",
          args: {
            file_path: "/openwiki/architecture/runtime.md",
            old_string: "",
          },
        },
        tool: undefined,
        state: { messages: [] },
        runtime: {} as never,
      },
      () => {
        throw new Error(
          "Received tool input did not match expected schema\n\nInvalid input: expected string, received undefined at new_string",
        );
      },
    );

    expect(result).toMatchObject({
      content: expect.stringContaining("Tool input failed schema validation"),
      name: "edit_file",
      tool_call_id: "call_1",
    });
  });

  test("sanitizes non-text read_file tool results before the next model call", async () => {
    const middleware = createWriteTodosInputNormalizerMiddleware();

    const result = await middleware.wrapToolCall?.(
      {
        toolCall: {
          id: "call_2",
          name: "read_file",
          args: {
            file_path: "/agentic30/Info.plist",
          },
        },
        tool: undefined,
        state: { messages: [] },
        runtime: {} as never,
      },
      () =>
        new ToolMessage({
          name: "read_file",
          tool_call_id: "call_2",
          content: [
            {
              type: "file",
              mimeType: "application/octet-stream",
              data: "AAAA",
            },
          ] as never,
        }),
    );

    expect(result).toMatchObject({
      content: expect.stringContaining(
        "OpenWiki omitted a non-text tool result",
      ),
      name: "read_file",
      tool_call_id: "call_2",
    });
    expect((result as ToolMessage).content).toContain("/agentic30/Info.plist");
    expect((result as ToolMessage).content).toContain(
      "application/octet-stream",
    );
  });
});
