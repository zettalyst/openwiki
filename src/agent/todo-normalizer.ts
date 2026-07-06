import { createMiddleware } from "langchain";
import { ToolMessage } from "@langchain/core/messages";

type JsonRecord = Record<string, unknown>;

const WRITE_TODOS_TOOL_NAME = "write_todos";
const DEFAULT_TODO_STATUS = "pending";
const TOOL_SCHEMA_ERROR_MESSAGE =
  "Received tool input did not match expected schema";
const TOOL_ERROR_MESSAGE_LIMIT = 2_000;

export function normalizeWriteTodosToolArgs(args: unknown): unknown {
  if (!isRecord(args) || !Array.isArray(args.todos)) {
    return args;
  }

  let changed = false;
  const todos = args.todos.map((todo) => {
    if (!isRecord(todo) || hasOwn(todo, "status")) {
      return todo;
    }

    changed = true;
    return {
      ...todo,
      status: DEFAULT_TODO_STATUS,
    };
  });

  if (!changed) {
    return args;
  }

  return {
    ...args,
    todos,
  };
}

export function createWriteTodosInputNormalizerMiddleware() {
  return createMiddleware({
    name: "openWikiWriteTodosInputNormalizer",
    wrapToolCall: async (request, handler) => {
      const normalizedRequest =
        request.toolCall.name === WRITE_TODOS_TOOL_NAME
          ? {
              ...request,
              toolCall: {
                ...request.toolCall,
                args: normalizeWriteTodosToolArgs(
                  request.toolCall.args,
                ) as JsonRecord,
              },
            }
          : request;

      try {
        const result = await handler(normalizedRequest);

        if (ToolMessage.isInstance(result)) {
          return sanitizeUnsupportedToolMessageContent(
            result,
            normalizedRequest.toolCall,
          );
        }

        return result;
      } catch (error) {
        if (!isToolSchemaValidationError(error)) {
          throw error;
        }

        return createToolSchemaErrorMessage(normalizedRequest.toolCall, error);
      }
    },
  });
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(record: JsonRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isToolSchemaValidationError(error: unknown): boolean {
  return (
    error instanceof Error && error.message.includes(TOOL_SCHEMA_ERROR_MESSAGE)
  );
}

function createToolSchemaErrorMessage(
  toolCall: { id?: string; name: string },
  error: unknown,
): ToolMessage {
  const message =
    error instanceof Error ? error.message : "Unknown tool schema error.";
  const guidance =
    toolCall.name === "edit_file"
      ? "If you are creating or replacing a full documentation file, retry with write_file instead of edit_file."
      : "Retry the tool call with every required field in the schema.";

  return new ToolMessage({
    name: toolCall.name,
    tool_call_id: toolCall.id ?? toolCall.name,
    content: truncateToolErrorMessage(
      `Tool input failed schema validation: ${message}\n\n${guidance}`,
    ),
  });
}

function sanitizeUnsupportedToolMessageContent(
  message: ToolMessage,
  toolCall: { args?: unknown; id?: string; name: string },
): ToolMessage {
  const unsupportedBlocks = getUnsupportedContentBlocks(message.content);

  if (unsupportedBlocks.length === 0) {
    return message;
  }

  const filePath = getToolCallFilePath(toolCall.args);
  const mediaTypes = [
    ...new Set(
      unsupportedBlocks
        .map((block) => getContentBlockMediaType(block))
        .filter((mediaType): mediaType is string => Boolean(mediaType)),
    ),
  ];

  return new ToolMessage({
    name: message.name ?? toolCall.name,
    tool_call_id: message.tool_call_id ?? toolCall.id ?? toolCall.name,
    content: [
      "OpenWiki omitted a non-text tool result that cannot be sent back to the selected model.",
      filePath ? `File: ${filePath}` : null,
      mediaTypes.length > 0 ? `Media type: ${mediaTypes.join(", ")}` : null,
      "Do not use read_file for binary files. If metadata is needed, use a shell command that prints text.",
    ]
      .filter((line): line is string => line !== null)
      .join("\n"),
  });
}

function getUnsupportedContentBlocks(content: unknown): JsonRecord[] {
  if (!Array.isArray(content)) {
    return [];
  }

  return content.filter(isUnsupportedContentBlock);
}

function isUnsupportedContentBlock(block: unknown): block is JsonRecord {
  if (!isRecord(block)) {
    return false;
  }

  const type = block.type;

  return (
    type === "file" ||
    type === "document" ||
    type === "image" ||
    type === "audio" ||
    type === "video"
  );
}

function getContentBlockMediaType(block: JsonRecord): string | null {
  const mimeType = block.mimeType ?? block.media_type;

  return typeof mimeType === "string" ? mimeType : null;
}

function getToolCallFilePath(args: unknown): string | null {
  if (!isRecord(args)) {
    return null;
  }

  return typeof args.file_path === "string" ? args.file_path : null;
}

function truncateToolErrorMessage(message: string): string {
  if (message.length <= TOOL_ERROR_MESSAGE_LIMIT) {
    return message;
  }

  return `${message.slice(0, TOOL_ERROR_MESSAGE_LIMIT - 3)}...`;
}
