import { createHash } from "node:crypto";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { SystemMessage } from "@langchain/core/messages";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import { ChatOpenRouter } from "@langchain/openrouter";
import { createDeepAgent, GENERAL_PURPOSE_SUBAGENT, LocalShellBackend, } from "deepagents";
import { loadOpenWikiEnv } from "../env.js";
import { createSystemPrompt, createUserPrompt } from "./prompt.js";
import { ANTHROPIC_API_KEY_ENV_KEY, ANTHROPIC_AUTH_TOKEN_ENV_KEY, ANTHROPIC_BASE_URL_ENV_KEY, ANTHROPIC_OAUTH_BETA_HEADER, BASETEN_API_KEY_ENV_KEY, CLAUDE_CODE_OAUTH_BILLING_SYSTEM_TEXT, CLAUDE_CODE_OAUTH_TOKEN_ENV_KEY, FIREWORKS_API_KEY_ENV_KEY, getDefaultModelId, getProviderBaseUrlEnvKey, createProviderCredentialConfigurationError, getProviderCredentialRequirement, getProviderLabel, isValidModelId, normalizeModelId, OPENAI_API_KEY_ENV_KEY, OPENAI_COMPATIBLE_API_KEY_ENV_KEY, OPENAI_COMPATIBLE_BASE_URL_ENV_KEY, OPENROUTER_API_KEY_ENV_KEY, OPENROUTER_BASE_URL, OPENROUTER_FALLBACK_MODEL_IDS, OPENWIKI_MODEL_ID_ENV_KEY, OPENWIKI_PROVIDER_ENV_KEY, providerRequiresBaseUrl, resolveConfiguredProvider, resolveProviderCredential, resolveProviderBaseUrl, } from "../constants.js";
import { createOpenWikiContentSnapshot, getUpdateNoopStatus, createRunContext, shouldCheckUpdateNoop, writeLastUpdateMetadata, } from "./utils.js";
import { createWriteTodosInputNormalizerMiddleware } from "./todo-normalizer.js";
const DEFAULT_STREAM_INACTIVITY_TIMEOUT_MS = 600_000;
const STREAM_INACTIVITY_TIMEOUT_ENV_KEY = "OPENWIKI_STREAM_INACTIVITY_TIMEOUT_MS";
export async function runOpenWikiAgent(command, cwd = process.cwd(), options = {}) {
    emitDebug(options, `command=${command}`);
    emitDebug(options, `cwd=${cwd}`);
    emitDebug(options, `userMessage=${options.userMessage ? "provided" : "not-provided"}`);
    emitDebug(options, `userMessage.followup=${options.isFollowup === true}`);
    emitDebug(options, `env.beforeLoad ${formatEnvironmentDebug()}`);
    await loadOpenWikiEnv();
    emitDebug(options, "env=loaded ~/.openwiki/.env");
    emitDebug(options, `env.afterLoad ${formatEnvironmentDebug()}`);
    if (command === "update" && shouldCheckUpdateNoop(options)) {
        const noopStatus = await getUpdateNoopStatus(cwd);
        if (noopStatus.shouldSkip) {
            const message = "No repository changes detected since the last OpenWiki update; skipping agent run.";
            emitDebug(options, `update.noop gitHead=${noopStatus.gitHead}`);
            options.onEvent?.({ type: "text", text: message });
            return {
                command,
                model: noopStatus.model,
                skipped: true,
            };
        }
        emitDebug(options, `update.noop=false reason=${noopStatus.reason}`);
    }
    else if (command === "update") {
        emitDebug(options, "update.noop=false reason=user message provided");
    }
    const provider = resolveConfiguredProvider();
    const providerBaseUrl = resolveProviderBaseUrl(provider);
    emitDebug(options, `provider=${provider}`);
    if (providerBaseUrl) {
        emitDebug(options, `provider.baseUrl=${JSON.stringify(providerBaseUrl)}`);
    }
    const providerCredential = ensureProviderKey(provider);
    emitDebug(options, `credentials=${provider} env=${providerCredential.envKey} type=${providerCredential.type}`);
    ensureProviderBaseUrl(provider);
    const modelId = resolveModelId(options, provider);
    emitDebug(options, `model=${modelId}`);
    const debugFetchCapture = installOpenRouterDebugFetch(options);
    try {
        return await runOpenWikiAgentWithModelFallbacks(command, cwd, options, provider, modelId, debugFetchCapture);
    }
    catch (error) {
        attachOpenRouterDebugInfo(error, debugFetchCapture.getLastFailure());
        throw error;
    }
    finally {
        debugFetchCapture.restore();
    }
}
async function runOpenWikiAgentWithModelFallbacks(command, cwd, options, provider, modelId, debugFetchCapture) {
    const modelAttempts = createModelRoute(provider, modelId);
    let lastError = null;
    for (const [attemptIndex, attemptModelId] of modelAttempts.entries()) {
        const attemptOptions = createAttemptOptions(options, attemptIndex);
        debugFetchCapture.clearLastFailure();
        if (attemptIndex > 0) {
            emitDebug(options, `model.retry attempt=${attemptIndex + 1} model=${attemptModelId}`);
        }
        try {
            return await runOpenWikiAgentCore(command, cwd, attemptOptions, provider, attemptModelId);
        }
        catch (error) {
            const failure = debugFetchCapture.getLastFailure();
            attachOpenRouterDebugInfo(error, failure);
            lastError = error;
            if (!shouldRetryOpenRouterServerError(failure, attemptIndex, modelAttempts.length)) {
                throw error;
            }
            emitDebug(options, `model.retrying status=${failure?.response?.status ?? "unknown"} next=${modelAttempts[attemptIndex + 1]}`);
        }
    }
    throw lastError instanceof Error
        ? lastError
        : new Error("OpenWiki run failed after model fallback attempts.");
}
async function runOpenWikiAgentCore(command, cwd, options, provider, modelId) {
    const context = await createRunContext(command, cwd);
    emitDebug(options, "context=created");
    const openWikiSnapshotBefore = command === "chat" ? null : await createOpenWikiContentSnapshot(cwd);
    emitDebug(options, "openwiki.snapshot=created");
    const model = await createModel(provider, modelId);
    emitDebug(options, `model.provider=${provider}`);
    if (provider === "openrouter") {
        emitDebug(options, `openrouter.route=fallback models=${JSON.stringify(createModelRoute(provider, modelId))}`);
    }
    emitDebug(options, "model=initialized");
    emitDebug(options, "checkpointer=disabled");
    const threadId = options.threadId ?? createThreadId(cwd, createRunThreadId());
    emitDebug(options, `thread=${threadId}`);
    const todoNormalizer = createWriteTodosInputNormalizerMiddleware();
    const agent = createDeepAgent({
        model,
        tools: [],
        middleware: [todoNormalizer],
        subagents: [
            {
                ...GENERAL_PURPOSE_SUBAGENT,
                model,
                middleware: [todoNormalizer],
            },
        ],
        backend: new LocalShellBackend({
            maxOutputBytes: 100_000,
            rootDir: cwd,
            timeout: 120,
            virtualMode: true,
        }),
        systemPrompt: createSystemPrompt(command),
    });
    emitDebug(options, "agent=created");
    const input = {
        messages: [
            {
                role: "user",
                content: createRunUserMessage(command, cwd, context, options),
            },
        ],
    };
    emitDebug(options, "stream=opening modes=messages,tools subgraphs=true");
    const stream = await agent.stream(input, {
        configurable: {
            thread_id: threadId,
        },
        streamMode: ["messages", "tools"],
        subgraphs: true,
    });
    emitDebug(options, "stream=started modes=messages,tools subgraphs=true");
    const streamInactivityTimeoutMs = resolveStreamInactivityTimeoutMs(options);
    emitDebug(options, `stream.inactivityTimeoutMs=${streamInactivityTimeoutMs}`);
    await consumeOpenWikiAgentStream(stream, options, {
        command,
        modelId,
        provider,
        timeoutMs: streamInactivityTimeoutMs,
    });
    emitDebug(options, "stream=completed");
    if (command !== "chat" &&
        openWikiSnapshotBefore !== (await createOpenWikiContentSnapshot(cwd))) {
        await writeLastUpdateMetadata(command, cwd, modelId);
        emitDebug(options, "metadata=written");
    }
    else {
        emitDebug(options, command === "chat"
            ? "metadata=skipped command=chat"
            : "metadata=skipped openwiki=unchanged");
    }
    return {
        command,
        model: modelId,
    };
}
function createAttemptOptions(options, attemptIndex) {
    if (attemptIndex === 0) {
        return options;
    }
    return {
        ...options,
        threadId: options.threadId
            ? `${options.threadId}-retry-${attemptIndex}`
            : undefined,
    };
}
function createRunUserMessage(command, cwd, context, options) {
    if (options.isFollowup === true && options.userMessage?.trim()) {
        return options.userMessage.trim();
    }
    return `
${createUserPrompt(command, context, options.userMessage ?? null)}

Repository root:
${cwd}

Runtime note:
- Treat the repository root above as the only project you are documenting.
- Filesystem tools use a virtual root: / means ${cwd}.
- For ls, read_file, write_file, edit_file, glob, and grep, use virtual paths such as /README.md, /agent/agents/main.py, and /openwiki/quickstart.md.
- Do not pass host absolute paths to filesystem tools. A host absolute path will be treated as a virtual path and will write to the wrong location.
- Shell execute commands run on the host. For execute, use cd ${cwd} before repository commands.
- Do not search parent directories or unrelated repositories.
`.trim();
}
export function createOpenWikiThreadId(cwd = process.cwd()) {
    return createThreadId(cwd, createRunThreadId());
}
function createThreadId(cwd, runId) {
    const digest = createHash("sha256").update(path.resolve(cwd)).digest("hex");
    return `openwiki-${digest.slice(0, 32)}-${runId}`;
}
function createRunThreadId() {
    return `${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;
}
export async function consumeOpenWikiAgentStream(stream, options, context) {
    const iterator = stream[Symbol.asyncIterator]();
    let unhandledChunkCount = 0;
    let lastActivity = "stream start";
    try {
        while (true) {
            const next = await nextStreamChunkWithInactivityTimeout(iterator, context, lastActivity);
            if (next.done) {
                return;
            }
            const event = parseStreamEvent(next.value);
            if (event) {
                lastActivity = formatStreamActivity(event);
                options.onEvent?.(event);
            }
            else {
                lastActivity = `unhandled chunk: ${describeStreamChunkShape(next.value)}`;
                if (options.debug && unhandledChunkCount < 3) {
                    emitDebug(options, `stream.unhandledChunk ${lastActivity}`);
                    unhandledChunkCount += 1;
                }
            }
        }
    }
    catch (error) {
        if (error instanceof StreamInactivityTimeoutError) {
            void iterator.return?.().catch(() => {
                // The timeout error is the actionable failure; cleanup errors add noise.
            });
        }
        throw error;
    }
}
async function nextStreamChunkWithInactivityTimeout(iterator, context, lastActivity) {
    if (context.timeoutMs <= 0) {
        return iterator.next();
    }
    let timeout = null;
    try {
        return await Promise.race([
            iterator.next(),
            new Promise((_, reject) => {
                timeout = setTimeout(() => {
                    reject(createStreamInactivityTimeoutError(context, lastActivity));
                }, context.timeoutMs);
            }),
        ]);
    }
    finally {
        if (timeout) {
            clearTimeout(timeout);
        }
    }
}
class StreamInactivityTimeoutError extends Error {
    constructor(message) {
        super(message);
        this.name = "OpenWikiStreamInactivityTimeoutError";
    }
}
function createStreamInactivityTimeoutError(context, lastActivity) {
    return new StreamInactivityTimeoutError([
        `OpenWiki agent stream produced no events for ${context.timeoutMs} ms.`,
        `command=${context.command}`,
        `provider=${context.provider}`,
        `model=${context.modelId}`,
        `lastActivity=${lastActivity}`,
        "The run was aborted instead of waiting indefinitely. Re-run with OPENWIKI_DEBUG=1 for stream/tool diagnostics, or increase OPENWIKI_STREAM_INACTIVITY_TIMEOUT_MS if the model is legitimately taking longer.",
    ].join("\n"));
}
function formatStreamActivity(event) {
    if (event.type === "tool_start") {
        return `tool:start ${event.name}`;
    }
    if (event.type === "tool_end") {
        return `tool:${event.status} ${event.name}`;
    }
    if (event.type === "debug") {
        return `debug ${event.message}`;
    }
    return `text ${event.source ?? "main"}`;
}
function resolveStreamInactivityTimeoutMs(options) {
    if (typeof options.streamInactivityTimeoutMs === "number") {
        return normalizeStreamInactivityTimeoutMs(options.streamInactivityTimeoutMs);
    }
    const rawValue = process.env[STREAM_INACTIVITY_TIMEOUT_ENV_KEY];
    if (rawValue) {
        return normalizeStreamInactivityTimeoutMs(Number(rawValue));
    }
    return DEFAULT_STREAM_INACTIVITY_TIMEOUT_MS;
}
function normalizeStreamInactivityTimeoutMs(value) {
    return Number.isFinite(value) && value >= 0
        ? Math.floor(value)
        : DEFAULT_STREAM_INACTIVITY_TIMEOUT_MS;
}
function emitDebug(options, message) {
    if (!options.debug) {
        return;
    }
    options.onEvent?.({
        type: "debug",
        message,
    });
}
function ensureProviderKey(provider) {
    const credentialError = createProviderCredentialConfigurationError(provider);
    if (credentialError !== null) {
        throw new Error(credentialError);
    }
    const credential = resolveProviderCredential(provider);
    if (credential === null) {
        throw new Error(`${getProviderCredentialRequirement(provider)} is required to run OpenWiki with ${getProviderLabel(provider)}.`);
    }
    return credential;
}
function ensureProviderBaseUrl(provider) {
    if (!providerRequiresBaseUrl(provider)) {
        return;
    }
    if (!resolveProviderBaseUrl(provider)) {
        const baseUrlEnvKey = getProviderBaseUrlEnvKey(provider) ?? "base URL";
        throw new Error(`${baseUrlEnvKey} is required to run OpenWiki with ${getProviderLabel(provider)}.`);
    }
}
function resolveModelId(options, provider) {
    const rawModelId = options.modelId ??
        process.env[OPENWIKI_MODEL_ID_ENV_KEY] ??
        getDefaultModelId(provider);
    const modelId = normalizeModelId(rawModelId);
    if (!isValidModelId(modelId)) {
        throw new Error(`Invalid model ID configured in ${OPENWIKI_MODEL_ID_ENV_KEY}.`);
    }
    return modelId;
}
export async function createModel(provider, modelId) {
    const credentialError = createProviderCredentialConfigurationError(provider);
    if (credentialError !== null) {
        throw new Error(credentialError);
    }
    const credential = resolveProviderCredential(provider);
    if (credential === null) {
        throw new Error(`${getProviderCredentialRequirement(provider)} is required.`);
    }
    if (provider === "anthropic") {
        const baseURL = resolveProviderBaseUrl(provider);
        if (credential.type === "auth-token") {
            const AnthropicChatModel = credential.envKey === CLAUDE_CODE_OAUTH_TOKEN_ENV_KEY
                ? ChatAnthropicWithClaudeCodeOAuthBilling
                : ChatAnthropic;
            return new AnthropicChatModel(modelId, {
                createClient: (options) => new Anthropic({
                    ...options,
                    apiKey: null,
                    authToken: credential.value,
                    defaultHeaders: appendAnthropicOAuthBetaHeader(options.defaultHeaders),
                }),
                ...(baseURL ? { anthropicApiUrl: baseURL } : {}),
            });
        }
        return new ChatAnthropic(modelId, {
            apiKey: credential.value,
            ...(baseURL ? { anthropicApiUrl: baseURL } : {}),
        });
    }
    if (provider === "openrouter") {
        const models = createModelRoute(provider, modelId);
        return new ChatOpenRouter({
            apiKey: credential.value,
            baseURL: OPENROUTER_BASE_URL,
            model: modelId,
            models,
            route: "fallback",
            siteName: "OpenWiki",
        });
    }
    const baseURL = resolveProviderBaseUrl(provider);
    return new ChatOpenAI({
        apiKey: credential.value,
        configuration: baseURL
            ? {
                baseURL,
            }
            : undefined,
        model: modelId,
    });
}
class ChatAnthropicWithClaudeCodeOAuthBilling extends ChatAnthropic {
    async _generate(messages, options, runManager) {
        return super._generate(prependClaudeCodeOAuthBillingSystemMessage(messages), options, runManager);
    }
    async *_streamResponseChunks(messages, options, runManager) {
        yield* super._streamResponseChunks(prependClaudeCodeOAuthBillingSystemMessage(messages), options, runManager);
    }
    async *_streamChatModelEvents(messages, options, runManager) {
        yield* super._streamChatModelEvents(prependClaudeCodeOAuthBillingSystemMessage(messages), options, runManager);
    }
}
function prependClaudeCodeOAuthBillingSystemMessage(messages) {
    if (messages[0]?._getType() === "system") {
        if (systemContentIncludesClaudeCodeOAuthBilling(messages[0].content)) {
            return messages;
        }
        const [systemMessage, ...rest] = messages;
        const content = typeof systemMessage.content === "string"
            ? [
                {
                    type: "text",
                    text: systemMessage.content,
                },
            ]
            : systemMessage.content;
        return [
            new SystemMessage({
                id: systemMessage.id,
                name: systemMessage.name,
                additional_kwargs: systemMessage.additional_kwargs,
                response_metadata: systemMessage.response_metadata,
                content: [createClaudeCodeOAuthBillingBlock(), ...content],
            }),
            ...rest,
        ];
    }
    return [
        new SystemMessage({
            content: [createClaudeCodeOAuthBillingBlock()],
        }),
        ...messages,
    ];
}
function systemContentIncludesClaudeCodeOAuthBilling(content) {
    if (typeof content === "string") {
        return content.includes(CLAUDE_CODE_OAUTH_BILLING_SYSTEM_TEXT);
    }
    return content.some((block) => {
        if (block.type !== "text") {
            return false;
        }
        return ("text" in block && block.text === CLAUDE_CODE_OAUTH_BILLING_SYSTEM_TEXT);
    });
}
function createClaudeCodeOAuthBillingBlock() {
    return {
        type: "text",
        text: CLAUDE_CODE_OAUTH_BILLING_SYSTEM_TEXT,
    };
}
function appendAnthropicOAuthBetaHeader(defaultHeaders) {
    const headers = new Headers((defaultHeaders ?? undefined));
    const existingBetaHeaders = headers
        .get("anthropic-beta")
        ?.split(",")
        .map((value) => value.trim());
    if (!existingBetaHeaders?.includes(ANTHROPIC_OAUTH_BETA_HEADER)) {
        headers.append("anthropic-beta", ANTHROPIC_OAUTH_BETA_HEADER);
    }
    return headers;
}
function createModelRoute(provider, modelId) {
    if (provider !== "openrouter") {
        return [modelId];
    }
    return Array.from(new Set([modelId, ...OPENROUTER_FALLBACK_MODEL_IDS]));
}
function shouldRetryOpenRouterServerError(failure, attemptIndex, attemptCount) {
    const status = failure?.response?.status;
    return (attemptIndex < attemptCount - 1 &&
        typeof status === "number" &&
        status >= 500 &&
        status < 600);
}
function parseStreamEvent(chunk) {
    const streamEvent = normalizeStreamEvent(chunk);
    if (!streamEvent) {
        return null;
    }
    if (streamEvent.mode === "messages") {
        const text = extractMessageText(streamEvent.payload);
        return text.length > 0
            ? {
                source: streamEvent.isSubgraph ? "subgraph" : "main",
                type: "text",
                text,
            }
            : null;
    }
    if (streamEvent.mode === "tools") {
        return parseToolStreamEvent(streamEvent.payload);
    }
    return null;
}
function normalizeStreamEvent(chunk) {
    if (Array.isArray(chunk)) {
        if (chunk.length < 2) {
            return null;
        }
        const [mode, payload] = normalizeStreamChunk(chunk);
        return typeof mode === "string"
            ? {
                isSubgraph: isSubgraphStreamChunk(chunk),
                mode,
                payload,
            }
            : null;
    }
    if (!isRecord(chunk)) {
        return null;
    }
    const toolEvent = getStringRecordValue(chunk, "event");
    if (toolEvent?.startsWith("on_tool_")) {
        return {
            isSubgraph: false,
            mode: "tools",
            payload: chunk,
        };
    }
    const method = getStringRecordValue(chunk, "method");
    if (!method) {
        return null;
    }
    return {
        isSubgraph: false,
        mode: method,
        payload: getProtocolEventPayload(chunk),
    };
}
function normalizeStreamChunk(chunk) {
    if (Array.isArray(chunk[0]) && chunk.length >= 3) {
        return [chunk[1], chunk[2]];
    }
    return [chunk[0], chunk[1]];
}
function isSubgraphStreamChunk(chunk) {
    if (!Array.isArray(chunk[0]) || chunk.length < 3) {
        return false;
    }
    return chunk[0].length > 1;
}
function extractMessageText(payload) {
    return extractMessageTextValue(payload, new Set());
}
function extractMessageTextValue(payload, seen) {
    if (typeof payload === "string") {
        return payload;
    }
    if (Array.isArray(payload)) {
        if (payload.length === 2 && isStreamMessageTuplePayload(payload)) {
            return extractMessageTextValue(payload[0], seen);
        }
        for (const item of payload) {
            const text = extractMessageTextValue(item, seen);
            if (text.length > 0) {
                return text;
            }
        }
        return payload.map((item) => extractContentBlockText(item, seen)).join("");
    }
    if (!isRecord(payload) || seen.has(payload)) {
        return "";
    }
    seen.add(payload);
    const protocolText = extractProtocolMessageText(payload, seen);
    if (protocolText !== null) {
        return protocolText;
    }
    if (isRecord(payload.chunk)) {
        const text = extractMessageTextValue(payload.chunk, seen);
        if (text.length > 0) {
            return text;
        }
    }
    if (isRecord(payload.message)) {
        const text = extractMessageTextValue(payload.message, seen);
        if (text.length > 0) {
            return text;
        }
    }
    if (!shouldReadMessageRecord(payload)) {
        return "";
    }
    const contentText = extractContentText(payload.content, seen);
    if (contentText.length > 0) {
        return contentText;
    }
    for (const key of [
        "text",
        "output",
        "generations",
        "messages",
        "kwargs",
        "lc_kwargs",
    ]) {
        const text = extractMessageTextValue(payload[key], seen);
        if (text.length > 0) {
            return text;
        }
    }
    return "";
}
function isStreamMessageTuplePayload(payload) {
    const [message, metadata] = payload;
    if (!isRecord(metadata) || !isMessageLikeRecord(message)) {
        return false;
    }
    if ("langgraph_node" in metadata ||
        "run_id" in metadata ||
        "tags" in metadata ||
        "metadata" in metadata) {
        return true;
    }
    return ("langgraph_node" in message ||
        "checkpoint_ns" in message ||
        "thread_id" in message);
}
function isMessageLikeRecord(value) {
    if (!isRecord(value)) {
        return false;
    }
    return ("content" in value ||
        "text" in value ||
        "kwargs" in value ||
        "lc_kwargs" in value ||
        typeof value._getType === "function" ||
        getMessageRole(value) !== null ||
        hasSerializedMessageId(value));
}
function extractProtocolMessageText(payload, seen) {
    const event = getStringRecordValue(payload, "event");
    if (!event) {
        return null;
    }
    if (event === "content-block-delta") {
        return extractContentDeltaText(payload.delta, seen);
    }
    if (event === "content-block-start") {
        return extractContentText(payload.content, seen);
    }
    if (event === "message-start" ||
        event === "message-finish" ||
        event === "content-block-finish" ||
        event === "error") {
        return "";
    }
    return null;
}
function extractContentText(content, seen) {
    if (typeof content === "string") {
        return content;
    }
    if (Array.isArray(content)) {
        return content
            .map((block) => extractContentBlockText(block, seen))
            .join("");
    }
    if (isRecord(content)) {
        return extractContentBlockText(content, seen);
    }
    return "";
}
function extractContentDeltaText(delta, seen) {
    if (typeof delta === "string") {
        return delta;
    }
    if (!isRecord(delta)) {
        return "";
    }
    const type = getStringRecordValue(delta, "type");
    if (type === "text-delta") {
        return typeof delta.text === "string" ? delta.text : "";
    }
    if (type === "block-delta") {
        return extractContentBlockText(delta.fields, seen);
    }
    if (typeof delta.text === "string") {
        return delta.text;
    }
    if (typeof delta.delta === "string") {
        return delta.delta;
    }
    return "";
}
function extractContentBlockText(block, seen) {
    if (typeof block === "string") {
        return block;
    }
    if (!isRecord(block)) {
        return "";
    }
    const type = getStringRecordValue(block, "type");
    if (type?.includes("tool") || type?.includes("reasoning")) {
        return "";
    }
    for (const key of ["text", "content", "output_text"]) {
        const text = block[key];
        if (typeof text === "string") {
            return text;
        }
    }
    if (isRecord(block.fields)) {
        return extractContentBlockText(block.fields, seen);
    }
    if (isRecord(block.delta)) {
        return extractContentDeltaText(block.delta, seen);
    }
    return "";
}
function shouldReadMessageRecord(value) {
    const role = getMessageRole(value);
    return role === null || role === "ai" || role === "assistant";
}
function getMessageRole(value) {
    for (const key of ["role", "type"]) {
        const role = getStringRecordValue(value, key);
        if (isMessageRole(role)) {
            return role;
        }
    }
    const serializedType = getSerializedMessageType(value);
    if (serializedType === "AIMessage" || serializedType === "AIMessageChunk") {
        return "ai";
    }
    if (serializedType === "HumanMessage" ||
        serializedType === "SystemMessage" ||
        serializedType === "ToolMessage") {
        return serializedType.replace("Message", "").toLowerCase();
    }
    const getType = value._getType;
    if (typeof getType !== "function") {
        return null;
    }
    try {
        const role = getType.call(value);
        return isMessageRole(role) ? role : null;
    }
    catch {
        return null;
    }
}
function hasSerializedMessageId(value) {
    return getSerializedMessageType(value) !== null;
}
function getSerializedMessageType(value) {
    if (!Array.isArray(value.id)) {
        return null;
    }
    return (value.id
        .filter((part) => typeof part === "string")
        .at(-1) ?? null);
}
function isMessageRole(value) {
    return (value === "ai" ||
        value === "assistant" ||
        value === "human" ||
        value === "system" ||
        value === "tool");
}
function getProtocolEventPayload(event) {
    const params = event.params;
    if (isRecord(params) && "data" in params) {
        return params.data;
    }
    if ("data" in event) {
        return event.data;
    }
    if ("payload" in event) {
        return event.payload;
    }
    return event;
}
function parseToolStreamEvent(payload) {
    if (!isRecord(payload)) {
        return null;
    }
    const event = getStringRecordValue(payload, "event");
    if (event === "on_tool_start" || event === "tool-started") {
        const name = getStringRecordValue(payload, "name") ??
            getStringRecordValue(payload, "tool_name") ??
            "tool";
        const id = getStringRecordValue(payload, "toolCallId") ??
            getStringRecordValue(payload, "tool_call_id") ??
            createSyntheticToolCallId(name, payload.input);
        return {
            type: "tool_start",
            call: `${formatToolCallName(name)}(${formatToolArgs(payload.input)})`,
            id,
            input: payload.input,
            name,
        };
    }
    if (event === "on_tool_end" ||
        event === "tool-finished" ||
        event === "on_tool_error" ||
        event === "tool-error") {
        const name = getStringRecordValue(payload, "name") ??
            getStringRecordValue(payload, "tool_name") ??
            "tool";
        const id = getStringRecordValue(payload, "toolCallId") ??
            getStringRecordValue(payload, "tool_call_id") ??
            createSyntheticToolCallId(name, payload.input);
        return {
            type: "tool_end",
            id,
            name,
            status: event === "on_tool_error" || event === "tool-error"
                ? "error"
                : "finished",
        };
    }
    return null;
}
function formatToolCallName(name) {
    return name === "execute" ? "Execute" : name;
}
function formatToolArgs(input) {
    const value = parseStringifiedJson(input);
    if (isRecord(value)) {
        return Object.entries(value)
            .map(([key, argValue]) => `${key}=${formatToolValue(argValue)}`)
            .join(", ");
    }
    if (Array.isArray(value)) {
        return value.map(formatToolValue).join(", ");
    }
    if (value === undefined || value === null) {
        return "";
    }
    return formatToolValue(value);
}
function formatToolValue(value) {
    if (typeof value === "string") {
        return JSON.stringify(value);
    }
    return JSON.stringify(value) ?? String(value);
}
function parseStringifiedJson(value) {
    if (typeof value !== "string") {
        return value;
    }
    try {
        return JSON.parse(value);
    }
    catch {
        return value;
    }
}
function createSyntheticToolCallId(name, input) {
    return `${name}:${formatToolValue(input)}`;
}
function getStringRecordValue(value, key) {
    return typeof value[key] === "string" ? value[key] : null;
}
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
function describeStreamChunkShape(chunk) {
    if (Array.isArray(chunk)) {
        return `array(length=${chunk.length}, items=${chunk
            .slice(0, 3)
            .map(describeValueShape)
            .join(",")})`;
    }
    return describeValueShape(chunk);
}
function describeValueShape(value) {
    if (Array.isArray(value)) {
        return `array(length=${value.length})`;
    }
    if (isRecord(value)) {
        const keys = Object.keys(value);
        const suffix = keys.length > 8 ? ",..." : "";
        return `object(keys=${keys.slice(0, 8).join(",")}${suffix})`;
    }
    return typeof value;
}
const OPENROUTER_DEBUG_PROPERTY = "openRouterDebug";
const OPENROUTER_DEBUG_BODY_LIMIT = 4_000;
function installOpenRouterDebugFetch(options) {
    const originalFetch = globalThis.fetch;
    let lastFailure = null;
    globalThis.fetch = (async (input, init) => {
        if (!isOpenRouterFetchInput(input)) {
            return originalFetch(input, init);
        }
        const request = summarizeOpenRouterRequest(input, init);
        try {
            const response = await originalFetch(input, init);
            if (!response.ok) {
                lastFailure = {
                    request,
                    response: {
                        bodyPreview: await readResponseBodyPreview(response),
                        headers: getSafeResponseHeaders(response.headers),
                        status: response.status,
                        statusText: response.statusText,
                    },
                };
                emitDebug(options, `openrouter.http status=${response.status} statusText=${JSON.stringify(response.statusText)}`);
            }
            return response;
        }
        catch (error) {
            lastFailure = {
                fetchError: error instanceof Error ? error.message : String(error),
                request,
            };
            throw error;
        }
    });
    return {
        clearLastFailure: () => {
            lastFailure = null;
        },
        getLastFailure: () => lastFailure,
        restore: () => {
            globalThis.fetch = originalFetch;
        },
    };
}
function attachOpenRouterDebugInfo(error, failure) {
    if (!failure || !isRecord(error)) {
        return;
    }
    error[OPENROUTER_DEBUG_PROPERTY] = failure;
}
function isOpenRouterFetchInput(input) {
    const url = getFetchInputUrl(input);
    return (url !== null &&
        url.startsWith(OPENROUTER_BASE_URL) &&
        url.includes("/chat/completions"));
}
function getFetchInputUrl(input) {
    if (typeof input === "string") {
        return input;
    }
    if (input instanceof URL) {
        return input.toString();
    }
    return "url" in input && typeof input.url === "string" ? input.url : null;
}
function summarizeOpenRouterRequest(input, init) {
    const body = typeof init?.body === "string" ? init.body : null;
    const parsedBody = parseJsonRecord(body);
    const toolNames = getOpenRouterToolNames(parsedBody?.tools);
    return {
        bodyBytes: body === null ? undefined : Buffer.byteLength(body, "utf8"),
        messageChars: getOpenRouterMessageChars(parsedBody?.messages),
        messageCount: Array.isArray(parsedBody?.messages)
            ? parsedBody.messages.length
            : undefined,
        method: init?.method ?? "GET",
        model: typeof parsedBody?.model === "string" ? parsedBody.model : undefined,
        stream: typeof parsedBody?.stream === "boolean" ? parsedBody.stream : undefined,
        toolCount: toolNames.length,
        toolNames: toolNames.slice(0, 20),
        url: formatOpenRouterDebugUrl(getFetchInputUrl(input) ?? "unknown"),
    };
}
function parseJsonRecord(value) {
    if (value === null) {
        return null;
    }
    try {
        const parsed = JSON.parse(value);
        return isRecord(parsed) ? parsed : null;
    }
    catch {
        return null;
    }
}
function getOpenRouterToolNames(tools) {
    if (!Array.isArray(tools)) {
        return [];
    }
    return tools
        .map((tool) => {
        if (!isRecord(tool) || !isRecord(tool.function)) {
            return null;
        }
        return typeof tool.function.name === "string" ? tool.function.name : null;
    })
        .filter((name) => name !== null);
}
function getOpenRouterMessageChars(messages) {
    if (!Array.isArray(messages)) {
        return undefined;
    }
    return messages.reduce((total, message) => {
        if (!isRecord(message)) {
            return total;
        }
        return total + countMessageContentChars(message.content);
    }, 0);
}
function countMessageContentChars(content) {
    if (typeof content === "string") {
        return content.length;
    }
    if (Array.isArray(content)) {
        return content.reduce((total, block) => total + countMessageContentChars(block), 0);
    }
    if (!isRecord(content)) {
        return 0;
    }
    return Object.entries(content).reduce((total, [key, value]) => {
        if (key === "text" || key === "content") {
            return total + countMessageContentChars(value);
        }
        return total;
    }, 0);
}
async function readResponseBodyPreview(response) {
    try {
        const body = await response.clone().text();
        const sanitizedBody = sanitizeOpenRouterResponseBody(body);
        return sanitizedBody.length <= OPENROUTER_DEBUG_BODY_LIMIT
            ? sanitizedBody
            : `${sanitizedBody.slice(0, OPENROUTER_DEBUG_BODY_LIMIT - 3)}...`;
    }
    catch (error) {
        return `Unable to read response body: ${error instanceof Error ? error.message : String(error)}`;
    }
}
function sanitizeOpenRouterResponseBody(body) {
    return body.replace(/"([^"]*(?:api[-_]?key|authorization|bearer|password|secret|token|user_id)[^"]*)"\s*:\s*"[^"]*"/giu, (_, key) => `${JSON.stringify(key)}:"[REDACTED]"`);
}
function getSafeResponseHeaders(headers) {
    const safeHeaders = {};
    for (const key of ["cf-ray", "content-type", "request-id", "x-request-id"]) {
        const value = headers.get(key);
        if (value) {
            safeHeaders[key] = value;
        }
    }
    return safeHeaders;
}
function formatOpenRouterDebugUrl(value) {
    try {
        const url = new URL(value);
        url.username = "";
        url.password = "";
        url.search = "";
        url.hash = "";
        return url.toString();
    }
    catch {
        return value;
    }
}
function formatEnvironmentDebug() {
    const keys = [
        OPENWIKI_PROVIDER_ENV_KEY,
        BASETEN_API_KEY_ENV_KEY,
        FIREWORKS_API_KEY_ENV_KEY,
        OPENAI_API_KEY_ENV_KEY,
        OPENAI_COMPATIBLE_API_KEY_ENV_KEY,
        OPENAI_COMPATIBLE_BASE_URL_ENV_KEY,
        ANTHROPIC_AUTH_TOKEN_ENV_KEY,
        ANTHROPIC_API_KEY_ENV_KEY,
        ANTHROPIC_BASE_URL_ENV_KEY,
        CLAUDE_CODE_OAUTH_TOKEN_ENV_KEY,
        OPENROUTER_API_KEY_ENV_KEY,
        OPENWIKI_MODEL_ID_ENV_KEY,
        "LANGCHAIN_TRACING_V2",
        "LANGCHAIN_PROJECT",
        "LANGCHAIN_ENDPOINT",
    ];
    return keys
        .map((key) => `${key}:${formatDebugValue(key, process.env[key])}`)
        .join(" ");
}
function formatDebugValue(key, value) {
    if (value === undefined) {
        return "unset";
    }
    if (key === "LANGCHAIN_ENDPOINT" ||
        key === ANTHROPIC_BASE_URL_ENV_KEY ||
        key === OPENAI_COMPATIBLE_BASE_URL_ENV_KEY) {
        return formatUrlDebugValue(value);
    }
    if (isSecretDebugKey(key)) {
        return `set(length=${value.length})`;
    }
    if (key === OPENWIKI_MODEL_ID_ENV_KEY || key === OPENWIKI_PROVIDER_ENV_KEY) {
        return `set(value=${JSON.stringify(value)})`;
    }
    if (value.length <= 10) {
        return `set(length=${value.length})`;
    }
    return `set(length=${value.length}, preview=${JSON.stringify(`${value.slice(0, 6)}...${value.slice(-4)}`)})`;
}
function isSecretDebugKey(key) {
    return (key.endsWith("_API_KEY") ||
        key === ANTHROPIC_AUTH_TOKEN_ENV_KEY ||
        key === CLAUDE_CODE_OAUTH_TOKEN_ENV_KEY);
}
function formatUrlDebugValue(value) {
    try {
        const url = new URL(value);
        const redacted = [];
        if (url.username || url.password) {
            redacted.push("auth");
            url.username = "";
            url.password = "";
        }
        if (url.search) {
            redacted.push("query");
            url.search = "";
        }
        if (url.hash) {
            redacted.push("hash");
            url.hash = "";
        }
        const redactionSuffix = redacted.length > 0 ? `, redacted=${redacted.join("+")}` : "";
        return `set(url=${JSON.stringify(url.toString())}${redactionSuffix})`;
    }
    catch {
        return `set(length=${value.length}, preview=${JSON.stringify(`${value.slice(0, 6)}...${value.slice(-4)}`)})`;
    }
}
