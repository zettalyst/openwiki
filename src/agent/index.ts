import { createHash } from "node:crypto";
import path from "node:path";
import Anthropic, { type ClientOptions } from "@anthropic-ai/sdk";
import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import type { ChatModelStreamEvent } from "@langchain/core/language_models/event";
import { type BaseMessage, SystemMessage } from "@langchain/core/messages";
import type { ChatGenerationChunk, ChatResult } from "@langchain/core/outputs";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import { ChatOpenRouter } from "@langchain/openrouter";
import { chmod, mkdir } from "node:fs/promises";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import type { Event as ProtocolEvent } from "@langchain/protocol";
import {
  createDeepAgent,
  GENERAL_PURPOSE_SUBAGENT,
  type SubAgent,
} from "deepagents";
import { createOpenWikiConnectorTools } from "../connectors/tools.js";
import { ensureWriteConnectorSkill } from "../connectors/write-connector-skill.js";
import {
  DEBUG_ENV_KEYS,
  loadOpenWikiEnv,
  openWikiEnvDir,
  saveOpenWikiEnv,
} from "../env.js";
import { isFileNotFoundError } from "../fs-errors.js";
import { openWikiLocalWikiDir } from "../openwiki-home.js";
import { OpenWikiLocalShellBackend } from "./docs-only-backend.js";
import {
  CODEX_ORIGINATOR,
  CODEX_RESPONSES_BASE_URL,
  codexTokensToEnv,
  createCodexFetch,
  isChatGptTokenExpired,
  readCodexTokensFromEnv,
  refreshChatGptTokens,
} from "./openai-chatgpt-oauth.js";
import {
  createSystemPrompt,
  createUserPrompt,
  type PromptOptions,
} from "./prompt.js";
import type {
  OpenWikiCommand,
  OpenWikiOutputMode,
  OpenWikiRunEvent,
  OpenWikiRunOptions,
  OpenWikiRunResult,
  UpdateMetadata,
} from "./types.js";
import {
  ANTHROPIC_AUTH_TOKEN_ENV_KEY,
  ANTHROPIC_BASE_URL_ENV_KEY,
  ANTHROPIC_OAUTH_BETA_HEADER,
  anthropicModelSupportsAdaptiveReasoning,
  CLAUDE_CODE_OAUTH_BILLING_SYSTEM_TEXT,
  CLAUDE_CODE_OAUTH_TOKEN_ENV_KEY,
  DEFAULT_ANTHROPIC_EFFORT_MAX_OUTPUT_TOKENS,
  DEFAULT_WIKI_LANGUAGE,
  getDefaultModelId,
  getProviderBaseUrlEnvKey,
  createProviderCredentialConfigurationError,
  getProviderCredentialRequirement,
  getProviderLabel,
  isValidLanguage,
  isValidModelId,
  normalizeLanguage,
  normalizeModelId,
  OPENAI_COMPATIBLE_BASE_URL_ENV_KEY,
  OPENROUTER_BASE_URL,
  OPENWIKI_LANGUAGE_ENV_KEY,
  OPENWIKI_MODEL_EFFORT_ENV_KEY,
  OPENWIKI_MODEL_ID_ENV_KEY,
  OPENWIKI_PROVIDER_ENV_KEY,
  OPENWIKI_PROVIDER_RETRY_ATTEMPTS_ENV_KEY,
  providerRequiresBaseUrl,
  resolveAnthropicModelEffort,
  resolveConfiguredProvider,
  resolveProviderCredential,
  resolveProviderBaseUrl,
  resolveProviderRetryAttempts,
  type AnthropicModelEffort,
  type OpenWikiProvider,
  type ProviderCredential,
} from "../constants.js";
import {
  createOpenWikiContentSnapshot,
  getUpdateNoopStatus,
  createRunContext,
  isLanguageMigrationRequired,
  readLastUpdateMetadata,
  recordedWikiLanguage,
  shouldCheckUpdateNoop,
  writeLastUpdateMetadata,
} from "./utils.js";
import { createWriteTodosInputNormalizerMiddleware } from "./todo-normalizer.js";

const DEFAULT_STREAM_INACTIVITY_TIMEOUT_MS = 600_000;
const STREAM_INACTIVITY_TIMEOUT_ENV_KEY =
  "OPENWIKI_STREAM_INACTIVITY_TIMEOUT_MS";

export async function runOpenWikiAgent(
  command: OpenWikiCommand,
  cwd = openWikiLocalWikiDir,
  options: OpenWikiRunOptions = {},
): Promise<OpenWikiRunResult> {
  const runtimeCwd = options.outputMode ? cwd : openWikiLocalWikiDir;

  emitDebug(options, `command=${command}`);
  emitDebug(options, `cwd=${runtimeCwd}`);
  emitDebug(
    options,
    `userMessage=${options.userMessage ? "provided" : "not-provided"}`,
  );
  emitDebug(options, `userMessage.followup=${options.isFollowup === true}`);
  emitDebug(options, `env.beforeLoad ${formatEnvironmentDebug()}`);

  await loadOpenWikiEnv();
  await ensureWriteConnectorSkill();
  emitDebug(options, "env=loaded ~/.openwiki/.env");
  emitDebug(options, `env.afterLoad ${formatEnvironmentDebug()}`);

  const lastUpdate = await readLastUpdateMetadata(
    runtimeCwd,
    options.outputMode ?? "local-wiki",
  );
  const language = resolveLanguage(options, lastUpdate);
  const isLanguageMigration =
    command === "update" && isLanguageMigrationRequired(lastUpdate, language);
  emitDebug(options, `language=${language} migration=${isLanguageMigration}`);
  const promptOptions: PromptOptions = { language, isLanguageMigration };

  if (command === "update" && isLanguageMigration) {
    emitDebug(
      options,
      "update.noop=false reason=documentation language changed",
    );
  } else if (command === "update" && shouldCheckUpdateNoop(options)) {
    const noopStatus = await getUpdateNoopStatus(cwd);

    if (noopStatus.shouldSkip) {
      const message =
        "No repository changes detected since the last OpenWiki update; skipping agent run.";
      emitDebug(options, `update.noop gitHead=${noopStatus.gitHead}`);
      options.onEvent?.({ type: "text", text: message });

      return {
        command,
        model: noopStatus.model,
        skipped: true,
      };
    }

    emitDebug(options, `update.noop=false reason=${noopStatus.reason}`);
  } else if (command === "update") {
    emitDebug(options, "update.noop=false reason=user message provided");
  }

  const provider = resolveConfiguredProvider();
  const providerBaseUrl = resolveProviderBaseUrl(provider);
  emitDebug(options, `provider=${provider}`);
  if (providerBaseUrl) {
    emitDebug(options, `provider.baseUrl=${JSON.stringify(providerBaseUrl)}`);
  }
  const providerCredential = ensureProviderKey(provider);
  emitDebug(
    options,
    `credentials=${provider} env=${providerCredential.envKey} type=${providerCredential.type}`,
  );
  ensureProviderBaseUrl(provider);

  if (provider === "openai-chatgpt") {
    // Refresh before the model is built, so `createModel` stays synchronous.
    await ensureFreshChatGptTokens();
    emitDebug(options, "chatgpt.token=fresh");
  }

  const modelId = resolveModelId(options, provider);
  emitDebug(options, `model=${modelId}`);
  const providerRetryAttempts = resolveProviderRetryAttempts();
  emitDebug(options, `provider.retryAttempts=${providerRetryAttempts}`);

  if (provider === "anthropic") {
    const effort = resolveAnthropicModelEffort(modelId);

    emitDebug(
      options,
      `model.effort=${effort ?? "api-default"} adaptiveThinking=${anthropicModelSupportsAdaptiveReasoning(modelId)}`,
    );
  }

  const debugFetchCapture = installOpenRouterDebugFetch(options);

  try {
    return await runOpenWikiAgentCore(
      command,
      runtimeCwd,
      options,
      provider,
      modelId,
      providerRetryAttempts,
      promptOptions,
    );
  } catch (error) {
    attachOpenRouterDebugInfo(error, debugFetchCapture.getLastFailure());
    throw error;
  } finally {
    debugFetchCapture.restore();
  }
}

async function runOpenWikiAgentCore(
  command: OpenWikiCommand,
  cwd: string,
  options: OpenWikiRunOptions,
  provider: OpenWikiProvider,
  modelId: string,
  providerRetryAttempts: number,
  promptOptions: PromptOptions,
): Promise<OpenWikiRunResult> {
  const outputMode = options.outputMode ?? "local-wiki";
  const context = await createRunContext(command, cwd, outputMode);
  emitDebug(options, "context=created");
  const openWikiSnapshotBefore =
    command === "chat"
      ? null
      : await createOpenWikiContentSnapshot(cwd, outputMode);
  emitDebug(options, "openwiki.snapshot=created");
  const model = createModel(provider, modelId, providerRetryAttempts);
  emitDebug(options, `model.provider=${provider}`);
  emitDebug(options, "model=initialized");
  const threadId = options.threadId ?? createThreadId(cwd, createRunThreadId());
  emitDebug(options, `thread=${threadId}`);
  const checkpointTarget = resolveCheckpointTarget(command);
  const checkpointer = await createCheckpointer(checkpointTarget);
  emitDebug(
    options,
    checkpointTarget.persistent
      ? `checkpointer=${formatUrlDebugValue(checkpointTarget.connString)}`
      : "checkpointer=memory",
  );
  const todoNormalizer = createWriteTodosInputNormalizerMiddleware();
  const agent = createDeepAgent({
    model,
    tools: createOpenWikiConnectorTools(),
    checkpointer,
    middleware: [todoNormalizer],
    subagents: [
      {
        ...GENERAL_PURPOSE_SUBAGENT,
        model,
        middleware: [todoNormalizer],
      } satisfies SubAgent,
    ],
    backend: new OpenWikiLocalShellBackend({
      docsOnly: command !== "chat",
      maxOutputBytes: 100_000,
      outputMode,
      rootDir: cwd,
      timeout: 120,
      virtualMode: true,
    }),
    systemPrompt: createSystemPrompt(command, outputMode, promptOptions),
  });
  emitDebug(options, "agent=created");

  const input = {
    messages: [
      {
        role: "user",
        content: createRunUserMessage(
          command,
          cwd,
          context,
          options,
          promptOptions,
        ),
      },
    ],
  };

  emitDebug(options, "stream=opening protocol=events version=v3");
  const stream = await agent.streamEvents(input, {
    configurable: {
      thread_id: threadId,
    },
    version: "v3",
  });
  emitDebug(options, "stream=started protocol=events version=v3");

  const streamInactivityTimeoutMs = resolveStreamInactivityTimeoutMs(options);
  emitDebug(options, `stream.inactivityTimeoutMs=${streamInactivityTimeoutMs}`);

  await consumeOpenWikiAgentStream(stream, options, {
    command,
    modelId,
    provider,
    timeoutMs: streamInactivityTimeoutMs,
  });
  emitDebug(options, "stream=completed");
  if (checkpointTarget.persistent) {
    await chmodIfExists(checkpointTarget.connString, 0o600);
  }

  const language = promptOptions.language ?? DEFAULT_WIKI_LANGUAGE;
  const openWikiChanged =
    command !== "chat" &&
    openWikiSnapshotBefore !==
      (await createOpenWikiContentSnapshot(cwd, outputMode));
  // Record a changed language even when the wiki content is untouched, so the
  // next update run does not re-enter migration mode forever.
  const languageOutdated =
    command !== "chat" &&
    isLanguageMigrationRequired(context.lastUpdate, language);

  if (openWikiChanged || languageOutdated) {
    if (languageOutdated && !openWikiChanged) {
      // The agent finished a language change without touching any wiki file —
      // either the wiki already matched the new language or the conversion was
      // skipped. Surface it, because the language is recorded as done either
      // way and a plain update will not retry the conversion.
      options.onEvent?.({
        type: "text",
        text: `Recorded wiki language ${language} without content changes. If pages are still in the previous language, run openwiki --update with a message asking to convert the remaining pages.`,
      });
      emitDebug(options, "metadata.language=stamped openwiki=unchanged");
    }

    await writeLastUpdateMetadata(command, cwd, modelId, language, outputMode);
    emitDebug(options, "metadata=written");
  } else {
    emitDebug(
      options,
      command === "chat"
        ? "metadata=skipped command=chat"
        : "metadata=skipped openwiki=unchanged",
    );
  }

  return {
    command,
    model: modelId,
  };
}

const checkpointPath = path.join(openWikiEnvDir, "openwiki.sqlite");

export type CheckpointTarget = {
  connString: string;
  persistent: boolean;
};

function createRunUserMessage(
  command: OpenWikiCommand,
  cwd: string,
  context: Awaited<ReturnType<typeof createRunContext>>,
  options: OpenWikiRunOptions,
  promptOptions: PromptOptions,
): string {
  if (options.isFollowup === true && options.userMessage?.trim()) {
    return options.userMessage.trim();
  }

  return `
${createUserPrompt(
  command,
  context,
  options.userMessage ?? null,
  options.outputMode ?? "local-wiki",
  promptOptions,
)}

${formatRuntimeRootLabel(options.outputMode ?? "local-wiki")}:
${cwd}

Runtime note:
- ${formatRuntimeRootInstruction(options.outputMode ?? "local-wiki")}
- Do not pass host absolute paths to filesystem tools. A host absolute path will be treated as a virtual path and will write to the wrong location.
- Shell execute commands run on the host. For execute, use cd ${cwd} before commands that should run against this root.
- Do not search parent directories or unrelated directories.
`.trim();
}

function formatRuntimeRootLabel(outputMode: OpenWikiOutputMode): string {
  return outputMode === "local-wiki" ? "Local wiki root" : "Repository root";
}

function formatRuntimeRootInstruction(outputMode: OpenWikiOutputMode): string {
  if (outputMode === "local-wiki") {
    return "Filesystem tools use a virtual root: / means the local wiki directory above. Write wiki pages directly under /, for example /quickstart.md, /sources/gmail.md, and /_plan.md. Do not create a nested /openwiki directory.";
  }

  return "Treat the repository root above as source evidence only. The canonical generated wiki is ~/.openwiki/wiki, not a repository-local openwiki/ directory. Filesystem tools use a virtual root: / means the repository root for source inspection paths such as /README.md, /agent/agents/main.py, and /package.json.";
}

async function createCheckpointer(
  target: CheckpointTarget,
): Promise<SqliteSaver> {
  if (target.persistent) {
    await prepareCheckpointDirectory(target.connString);
  }

  return SqliteSaver.fromConnString(target.connString);
}

async function prepareCheckpointDirectory(filePath: string): Promise<void> {
  const checkpointDir = path.dirname(filePath);
  await mkdir(checkpointDir, {
    recursive: true,
    mode: 0o700,
  });
  await chmodIfExists(checkpointDir, 0o700);
}

export function resolveCheckpointTarget(
  command: OpenWikiCommand,
): CheckpointTarget {
  if (command === "chat") {
    return {
      connString: checkpointPath,
      persistent: true,
    };
  }

  return {
    connString: ":memory:",
    persistent: false,
  };
}

async function chmodIfExists(filePath: string, mode: number): Promise<void> {
  try {
    await chmod(filePath, mode);
  } catch (error) {
    if (!isFileNotFoundError(error)) {
      throw error;
    }
  }
}

export function createOpenWikiThreadId(cwd = process.cwd()): string {
  return createThreadId(cwd, createRunThreadId());
}

function createThreadId(cwd: string, runId: string): string {
  const digest = createHash("sha256").update(path.resolve(cwd)).digest("hex");

  return `openwiki-${digest.slice(0, 32)}-${runId}`;
}

function createRunThreadId(): string {
  return `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

type StreamInactivityContext = {
  command: OpenWikiCommand;
  modelId: string;
  provider: OpenWikiProvider;
  timeoutMs: number;
};

export async function consumeOpenWikiAgentStream(
  stream: AsyncIterable<unknown>,
  options: OpenWikiRunOptions,
  context: StreamInactivityContext,
): Promise<void> {
  const iterator = stream[Symbol.asyncIterator]();
  let unhandledChunkCount = 0;
  let lastProgressActivity = "stream start";
  let lastRawActivity = "stream start";
  let lastProgressAt = Date.now();

  try {
    while (true) {
      const next = await nextStreamChunkWithInactivityTimeout(
        iterator,
        context,
        lastProgressActivity,
        lastRawActivity,
        lastProgressAt,
      );

      if (next.done) {
        return;
      }

      const event = parseStreamEvent(next.value);

      if (event) {
        lastProgressActivity = formatStreamActivity(event);
        lastRawActivity = lastProgressActivity;
        lastProgressAt = Date.now();
        options.onEvent?.(event);
      } else {
        lastRawActivity = `unhandled chunk: ${describeStreamChunkShape(
          next.value,
        )}`;

        if (options.debug && unhandledChunkCount < 3) {
          emitDebug(options, `stream.unhandledChunk ${lastRawActivity}`);
          unhandledChunkCount += 1;
        }
      }
    }
  } catch (error) {
    if (error instanceof StreamInactivityTimeoutError) {
      void iterator.return?.().catch(() => {
        // The timeout error is the actionable failure; cleanup errors add noise.
      });
    }

    throw error;
  }
}

async function nextStreamChunkWithInactivityTimeout(
  iterator: AsyncIterator<unknown>,
  context: StreamInactivityContext,
  lastProgressActivity: string,
  lastRawActivity: string,
  lastProgressAt: number,
): Promise<IteratorResult<unknown>> {
  if (context.timeoutMs <= 0) {
    return iterator.next();
  }

  const remainingMs =
    context.timeoutMs - Math.max(0, Date.now() - lastProgressAt);

  if (remainingMs <= 0) {
    throw createStreamInactivityTimeoutError(
      context,
      lastProgressActivity,
      lastRawActivity,
    );
  }

  let timeout: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      iterator.next(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(
            createStreamInactivityTimeoutError(
              context,
              lastProgressActivity,
              lastRawActivity,
            ),
          );
        }, remainingMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

class StreamInactivityTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenWikiStreamInactivityTimeoutError";
  }
}

function createStreamInactivityTimeoutError(
  context: StreamInactivityContext,
  lastProgressActivity: string,
  lastRawActivity: string,
): StreamInactivityTimeoutError {
  return new StreamInactivityTimeoutError(
    [
      `OpenWiki agent stream produced no user-visible progress for ${context.timeoutMs} ms.`,
      `command=${context.command}`,
      `provider=${context.provider}`,
      `model=${context.modelId}`,
      `lastProgress=${lastProgressActivity}`,
      `lastRawActivity=${lastRawActivity}`,
      "The run was aborted instead of waiting indefinitely. Re-run with OPENWIKI_DEBUG=1 for stream/tool diagnostics, or increase OPENWIKI_STREAM_INACTIVITY_TIMEOUT_MS if the model is legitimately taking longer.",
    ].join("\n"),
  );
}

function formatStreamActivity(event: OpenWikiRunEvent): string {
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

function resolveStreamInactivityTimeoutMs(options: OpenWikiRunOptions): number {
  if (typeof options.streamInactivityTimeoutMs === "number") {
    return normalizeStreamInactivityTimeoutMs(
      options.streamInactivityTimeoutMs,
    );
  }

  const rawValue = process.env[STREAM_INACTIVITY_TIMEOUT_ENV_KEY];

  if (rawValue) {
    return normalizeStreamInactivityTimeoutMs(Number(rawValue));
  }

  return DEFAULT_STREAM_INACTIVITY_TIMEOUT_MS;
}

function normalizeStreamInactivityTimeoutMs(value: number): number {
  return Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : DEFAULT_STREAM_INACTIVITY_TIMEOUT_MS;
}

function emitDebug(options: OpenWikiRunOptions, message: string): void {
  if (!options.debug) {
    return;
  }

  options.onEvent?.({
    type: "debug",
    message,
  });
}

function ensureProviderKey(provider: OpenWikiProvider): ProviderCredential {
  const credentialError = createProviderCredentialConfigurationError(provider);

  if (credentialError !== null) {
    throw new Error(credentialError);
  }

  const credential = resolveProviderCredential(provider);

  if (credential === null) {
    throw new Error(
      `${getProviderCredentialRequirement(provider)} is required to run OpenWiki with ${getProviderLabel(provider)}.`,
    );
  }

  return credential;
}

function ensureProviderBaseUrl(provider: OpenWikiProvider): void {
  if (!providerRequiresBaseUrl(provider)) {
    return;
  }

  if (!resolveProviderBaseUrl(provider)) {
    const baseUrlEnvKey = getProviderBaseUrlEnvKey(provider) ?? "base URL";

    throw new Error(
      `${baseUrlEnvKey} is required to run OpenWiki with ${getProviderLabel(provider)}.`,
    );
  }
}

export function resolveLanguage(
  options: OpenWikiRunOptions,
  lastUpdate: UpdateMetadata | null,
): string {
  // The repository's recorded language outranks the global env default so an
  // existing wiki keeps its language on plain runs; an explicit flag outranks
  // both. Wikis recorded before the language field existed resolve to English
  // here, so a language migration only starts from an explicit request.
  const languageCandidates: Array<[string, string | null | undefined]> = [
    ["run options", options.language],
    ["repository update metadata", recordedWikiLanguage(lastUpdate)],
    [OPENWIKI_LANGUAGE_ENV_KEY, process.env[OPENWIKI_LANGUAGE_ENV_KEY]],
  ];

  for (const [source, rawLanguage] of languageCandidates) {
    if (rawLanguage === null || rawLanguage === undefined) {
      continue;
    }

    if (rawLanguage.trim().length === 0) {
      continue;
    }

    if (!isValidLanguage(rawLanguage)) {
      throw new Error(
        `Invalid documentation language from ${source}: ${rawLanguage}`,
      );
    }

    return normalizeLanguage(rawLanguage);
  }

  return DEFAULT_WIKI_LANGUAGE;
}

function resolveModelId(
  options: OpenWikiRunOptions,
  provider: OpenWikiProvider,
): string {
  const rawModelId =
    options.modelId ??
    process.env[OPENWIKI_MODEL_ID_ENV_KEY] ??
    getDefaultModelId(provider);
  const modelId = normalizeModelId(rawModelId);

  if (!isValidModelId(modelId)) {
    throw new Error(
      `Invalid model ID configured in ${OPENWIKI_MODEL_ID_ENV_KEY}.`,
    );
  }

  return modelId;
}

export function createModel(
  provider: OpenWikiProvider,
  modelId: string,
  providerRetryAttempts: number,
) {
  const retryOptions = { maxRetries: providerRetryAttempts };
  const credentialError = createProviderCredentialConfigurationError(provider);

  if (credentialError !== null) {
    throw new Error(credentialError);
  }

  const credential = resolveProviderCredential(provider);

  if (credential === null) {
    throw new Error(
      `${getProviderCredentialRequirement(provider)} is required.`,
    );
  }

  if (provider === "anthropic") {
    const baseURL = resolveProviderBaseUrl(provider);
    const reasoningOptions = createAnthropicReasoningOptions(modelId);

    if (credential.type === "auth-token") {
      const AnthropicChatModel =
        credential.envKey === CLAUDE_CODE_OAUTH_TOKEN_ENV_KEY
          ? ChatAnthropicWithClaudeCodeOAuthBilling
          : ChatAnthropic;

      return new AnthropicChatModel(modelId, {
        createClient: (options: ClientOptions) =>
          new Anthropic({
            ...options,
            apiKey: null,
            authToken: credential.value,
            defaultHeaders: appendAnthropicOAuthBetaHeader(
              options.defaultHeaders,
            ),
          }),
        ...(baseURL ? { anthropicApiUrl: baseURL } : {}),
        ...reasoningOptions,
        ...retryOptions,
      });
    }

    return new ChatAnthropic(modelId, {
      apiKey: credential.value,
      ...(baseURL ? { anthropicApiUrl: baseURL } : {}),
      ...reasoningOptions,
      ...retryOptions,
    });
  }

  if (provider === "openai-chatgpt") {
    // Already refreshed by `ensureFreshChatGptTokens()` before the run started.
    const tokens = readCodexTokensFromEnv();

    if (!tokens) {
      throw new Error(CHATGPT_LOGIN_INCOMPLETE_MESSAGE);
    }

    // Reuse LangChain's existing ChatOpenAI Responses-API integration (correct
    // tool-calling + SSE parsing for DeepAgents) pointed at the Codex backend:
    // - useResponsesApi routes to POST {baseURL}/responses
    // - zdrEnabled forces `store: false`, which the Codex backend requires
    // - defaultHeaders carry the account id / originator / beta header
    return new ChatOpenAI({
      apiKey: tokens.access,
      model: modelId,
      useResponsesApi: true,
      zdrEnabled: true,
      // The Codex backend rejects non-streaming requests
      // ("Stream must be set to true"), so force the streaming transport for
      // every generation — including the non-streaming `.invoke()` calls
      // DeepAgents' agent node issues internally.
      streaming: true,
      ...retryOptions,
      configuration: {
        baseURL: CODEX_RESPONSES_BASE_URL,
        defaultHeaders: {
          "chatgpt-account-id": tokens.accountId,
          originator: CODEX_ORIGINATOR,
          "OpenAI-Beta": "responses=experimental",
        },
        fetch: createCodexFetch(modelId),
      },
    });
  }

  if (provider === "openrouter") {
    return new ChatOpenRouter({
      apiKey: credential.value,
      baseURL: OPENROUTER_BASE_URL,
      model: modelId,
      siteName: "OpenWiki",
      ...retryOptions,
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
    useResponsesApi: provider === "openai",
    ...retryOptions,
  });
}

type AnthropicReasoningOptions = {
  maxTokens?: number;
  outputConfig?: { effort: AnthropicModelEffort };
  thinking?: { type: "adaptive" };
};

function createAnthropicReasoningOptions(
  modelId: string,
): AnthropicReasoningOptions {
  if (!anthropicModelSupportsAdaptiveReasoning(modelId)) {
    return {};
  }

  const effort = resolveAnthropicModelEffort(modelId);

  return {
    maxTokens: DEFAULT_ANTHROPIC_EFFORT_MAX_OUTPUT_TOKENS,
    thinking: { type: "adaptive" },
    ...(effort ? { outputConfig: { effort } } : {}),
  };
}

class ChatAnthropicWithClaudeCodeOAuthBilling extends ChatAnthropic {
  async _generate(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    return super._generate(
      prependClaudeCodeOAuthBillingSystemMessage(messages),
      options,
      runManager,
    );
  }

  async *_streamResponseChunks(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    yield* super._streamResponseChunks(
      prependClaudeCodeOAuthBillingSystemMessage(messages),
      options,
      runManager,
    );
  }

  async *_streamChatModelEvents(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatModelStreamEvent> {
    yield* super._streamChatModelEvents(
      prependClaudeCodeOAuthBillingSystemMessage(messages),
      options,
      runManager,
    );
  }
}

function prependClaudeCodeOAuthBillingSystemMessage(
  messages: BaseMessage[],
): BaseMessage[] {
  if (messages[0]?._getType() === "system") {
    if (systemContentIncludesClaudeCodeOAuthBilling(messages[0].content)) {
      return messages;
    }

    const [systemMessage, ...rest] = messages;
    const content =
      typeof systemMessage.content === "string"
        ? [
            {
              type: "text" as const,
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

function systemContentIncludesClaudeCodeOAuthBilling(
  content: BaseMessage["content"],
): boolean {
  if (typeof content === "string") {
    return content.includes(CLAUDE_CODE_OAUTH_BILLING_SYSTEM_TEXT);
  }

  return content.some((block) => {
    if (block.type !== "text") {
      return false;
    }

    return (
      "text" in block && block.text === CLAUDE_CODE_OAUTH_BILLING_SYSTEM_TEXT
    );
  });
}

function createClaudeCodeOAuthBillingBlock(): {
  type: "text";
  text: string;
} {
  return {
    type: "text",
    text: CLAUDE_CODE_OAUTH_BILLING_SYSTEM_TEXT,
  };
}

function appendAnthropicOAuthBetaHeader(
  defaultHeaders: ClientOptions["defaultHeaders"],
): ClientOptions["defaultHeaders"] {
  type HeadersConstructorInput = ConstructorParameters<typeof Headers>[0];
  const headers = new Headers(
    (defaultHeaders ?? undefined) as HeadersConstructorInput,
  );
  const existingBetaHeaders = headers
    .get("anthropic-beta")
    ?.split(",")
    .map((value) => value.trim());

  if (!existingBetaHeaders?.includes(ANTHROPIC_OAUTH_BETA_HEADER)) {
    headers.append("anthropic-beta", ANTHROPIC_OAUTH_BETA_HEADER);
  }

  return headers;
}

const CHATGPT_LOGIN_INCOMPLETE_MESSAGE =
  "ChatGPT login is incomplete. Run `openwiki code --init` or `openwiki personal --init` to sign in with your ChatGPT account.";

/**
 * Refreshes the persisted ChatGPT OAuth tokens once at startup when they are
 * expired/near-expiry, writing the rotated tokens back to `~/.openwiki/.env`
 * (which also updates `process.env`, so `createModel` can stay synchronous).
 * This is a short-lived CLI process, so a single refresh-at-startup is enough:
 * there is no background refresh loop.
 */
async function ensureFreshChatGptTokens(): Promise<void> {
  const tokens = readCodexTokensFromEnv();

  if (!tokens) {
    throw new Error(CHATGPT_LOGIN_INCOMPLETE_MESSAGE);
  }

  if (!isChatGptTokenExpired(tokens.expiresAtMs)) {
    return;
  }

  await saveOpenWikiEnv(
    codexTokensToEnv(await refreshChatGptTokens(tokens.refresh)),
  );
}

function parseStreamEvent(chunk: unknown): OpenWikiRunEvent | null {
  if (!isProtocolStreamEvent(chunk)) {
    return null;
  }

  if (chunk.method === "messages") {
    const text = extractMessageText(chunk.params.data);

    return text.length > 0
      ? {
          source: isSubgraphProtocolEvent(chunk) ? "subgraph" : "main",
          type: "text",
          text,
        }
      : null;
  }

  if (chunk.method === "tools") {
    return parseToolStreamEvent(chunk.params.data);
  }

  return null;
}

function isProtocolStreamEvent(value: unknown): value is ProtocolEvent {
  return (
    isRecord(value) &&
    value.type === "event" &&
    typeof value.method === "string" &&
    isRecord(value.params) &&
    "data" in value.params
  );
}

function isSubgraphProtocolEvent(event: ProtocolEvent): boolean {
  return event.params.namespace.length > 1;
}

function extractMessageText(payload: unknown): string {
  return extractMessageTextValue(payload, new Set());
}

function extractMessageTextValue(payload: unknown, seen: Set<object>): string {
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

function isStreamMessageTuplePayload(payload: unknown[]): boolean {
  const [message, metadata] = payload;

  if (!isRecord(metadata) || !isMessageLikeRecord(message)) {
    return false;
  }

  if (
    "langgraph_node" in metadata ||
    "run_id" in metadata ||
    "tags" in metadata ||
    "metadata" in metadata
  ) {
    return true;
  }

  return (
    "langgraph_node" in message ||
    "checkpoint_ns" in message ||
    "thread_id" in message
  );
}

function isMessageLikeRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }

  return (
    "content" in value ||
    "text" in value ||
    "kwargs" in value ||
    "lc_kwargs" in value ||
    typeof value._getType === "function" ||
    getMessageRole(value) !== null ||
    hasSerializedMessageId(value)
  );
}

function extractProtocolMessageText(
  payload: Record<string, unknown>,
  seen: Set<object>,
): string | null {
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

  if (
    event === "message-start" ||
    event === "message-finish" ||
    event === "content-block-finish" ||
    event === "error"
  ) {
    return "";
  }

  return null;
}

function extractContentText(content: unknown, seen: Set<object>): string {
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

function extractContentDeltaText(delta: unknown, seen: Set<object>): string {
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

function extractContentBlockText(block: unknown, seen: Set<object>): string {
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

function shouldReadMessageRecord(value: Record<string, unknown>): boolean {
  const role = getMessageRole(value);

  return role === null || role === "ai" || role === "assistant";
}

function getMessageRole(value: Record<string, unknown>): string | null {
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

  if (
    serializedType === "HumanMessage" ||
    serializedType === "SystemMessage" ||
    serializedType === "ToolMessage"
  ) {
    return serializedType.replace("Message", "").toLowerCase();
  }

  const getType = value._getType;

  if (typeof getType !== "function") {
    return null;
  }

  try {
    const role: unknown = getType.call(value);

    return isMessageRole(role) ? role : null;
  } catch {
    return null;
  }
}

function hasSerializedMessageId(value: Record<string, unknown>): boolean {
  return getSerializedMessageType(value) !== null;
}

function getSerializedMessageType(
  value: Record<string, unknown>,
): string | null {
  if (!Array.isArray(value.id)) {
    return null;
  }

  return (
    value.id
      .filter((part): part is string => typeof part === "string")
      .at(-1) ?? null
  );
}

function isMessageRole(value: unknown): value is string {
  return (
    value === "ai" ||
    value === "assistant" ||
    value === "human" ||
    value === "system" ||
    value === "tool"
  );
}

function parseToolStreamEvent(payload: unknown): OpenWikiRunEvent | null {
  if (!isRecord(payload)) {
    return null;
  }

  const event = getStringRecordValue(payload, "event");

  if (event === "on_tool_start" || event === "tool-started") {
    const name =
      getStringRecordValue(payload, "name") ??
      getStringRecordValue(payload, "tool_name") ??
      "tool";
    const id =
      getStringRecordValue(payload, "toolCallId") ??
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

  if (
    event === "on_tool_end" ||
    event === "tool-finished" ||
    event === "on_tool_error" ||
    event === "tool-error"
  ) {
    const name =
      getStringRecordValue(payload, "name") ??
      getStringRecordValue(payload, "tool_name") ??
      "tool";
    const id =
      getStringRecordValue(payload, "toolCallId") ??
      getStringRecordValue(payload, "tool_call_id") ??
      createSyntheticToolCallId(name, payload.input);

    return {
      type: "tool_end",
      id,
      name,
      status:
        event === "on_tool_error" || event === "tool-error"
          ? "error"
          : "finished",
    };
  }

  return null;
}

function formatToolCallName(name: string): string {
  return name === "execute" ? "Execute" : name;
}

function formatToolArgs(input: unknown): string {
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

function formatToolValue(value: unknown): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  return JSON.stringify(value) ?? String(value);
}

function parseStringifiedJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function createSyntheticToolCallId(name: string, input: unknown): string {
  return `${name}:${formatToolValue(input)}`;
}

function getStringRecordValue(
  value: Record<string, unknown>,
  key: string,
): string | null {
  return typeof value[key] === "string" ? value[key] : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function describeStreamChunkShape(chunk: unknown): string {
  if (Array.isArray(chunk)) {
    return `array(length=${chunk.length}, items=${chunk
      .slice(0, 3)
      .map(describeValueShape)
      .join(",")})`;
  }

  return describeValueShape(chunk);
}

function describeValueShape(value: unknown): string {
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

type OpenRouterFetchCapture = {
  clearLastFailure: () => void;
  getLastFailure: () => OpenRouterFetchFailure | null;
  restore: () => void;
};

type OpenRouterFetchFailure = {
  fetchError?: string;
  request: OpenRouterRequestSummary;
  response?: OpenRouterResponseSummary;
};

type OpenRouterRequestSummary = {
  bodyBytes?: number;
  messageChars?: number;
  messageCount?: number;
  method: string;
  model?: string;
  stream?: boolean;
  toolCount?: number;
  toolNames?: string[];
  url: string;
};

type OpenRouterResponseSummary = {
  bodyPreview: string;
  headers: Record<string, string>;
  status: number;
  statusText: string;
};

const OPENROUTER_DEBUG_PROPERTY = "openRouterDebug";
const OPENROUTER_DEBUG_BODY_LIMIT = 4_000;

function installOpenRouterDebugFetch(
  options: OpenWikiRunOptions,
): OpenRouterFetchCapture {
  const originalFetch = globalThis.fetch;
  let lastFailure: OpenRouterFetchFailure | null = null;

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
        emitDebug(
          options,
          `openrouter.http status=${response.status} statusText=${JSON.stringify(
            response.statusText,
          )}`,
        );
      }

      return response;
    } catch (error) {
      lastFailure = {
        fetchError: error instanceof Error ? error.message : String(error),
        request,
      };
      throw error;
    }
  }) satisfies typeof fetch;

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

function attachOpenRouterDebugInfo(
  error: unknown,
  failure: OpenRouterFetchFailure | null,
): void {
  if (!failure || !isRecord(error)) {
    return;
  }

  error[OPENROUTER_DEBUG_PROPERTY] = failure;
}

function isOpenRouterFetchInput(input: Parameters<typeof fetch>[0]): boolean {
  const url = getFetchInputUrl(input);

  return (
    url !== null &&
    url.startsWith(OPENROUTER_BASE_URL) &&
    url.includes("/chat/completions")
  );
}

function getFetchInputUrl(input: Parameters<typeof fetch>[0]): string | null {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return "url" in input && typeof input.url === "string" ? input.url : null;
}

function summarizeOpenRouterRequest(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1],
): OpenRouterRequestSummary {
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
    stream:
      typeof parsedBody?.stream === "boolean" ? parsedBody.stream : undefined,
    toolCount: toolNames.length,
    toolNames: toolNames.slice(0, 20),
    url: formatOpenRouterDebugUrl(getFetchInputUrl(input) ?? "unknown"),
  };
}

function parseJsonRecord(value: string | null): Record<string, unknown> | null {
  if (value === null) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getOpenRouterToolNames(tools: unknown): string[] {
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
    .filter((name): name is string => name !== null);
}

function getOpenRouterMessageChars(messages: unknown): number | undefined {
  if (!Array.isArray(messages)) {
    return undefined;
  }

  return messages.reduce<number>((total, message) => {
    if (!isRecord(message)) {
      return total;
    }

    return total + countMessageContentChars(message.content);
  }, 0);
}

function countMessageContentChars(content: unknown): number {
  if (typeof content === "string") {
    return content.length;
  }

  if (Array.isArray(content)) {
    return content.reduce<number>(
      (total, block) => total + countMessageContentChars(block),
      0,
    );
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

async function readResponseBodyPreview(response: Response): Promise<string> {
  try {
    const body = await response.clone().text();
    const sanitizedBody = sanitizeOpenRouterResponseBody(body);

    return sanitizedBody.length <= OPENROUTER_DEBUG_BODY_LIMIT
      ? sanitizedBody
      : `${sanitizedBody.slice(0, OPENROUTER_DEBUG_BODY_LIMIT - 3)}...`;
  } catch (error) {
    return `Unable to read response body: ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
}

export function sanitizeOpenRouterResponseBody(body: string): string {
  return body.replace(
    /"([^"]*(?:api[-_]?key|authorization|bearer|password|secret|token|user_id)[^"]*)"\s*:\s*"[^"]*"/giu,
    (_, key: string) => `${JSON.stringify(key)}:"[REDACTED]"`,
  );
}

function getSafeResponseHeaders(headers: Headers): Record<string, string> {
  const safeHeaders: Record<string, string> = {};

  for (const key of ["cf-ray", "content-type", "request-id", "x-request-id"]) {
    const value = headers.get(key);

    if (value) {
      safeHeaders[key] = value;
    }
  }

  return safeHeaders;
}

function formatOpenRouterDebugUrl(value: string): string {
  try {
    const url = new URL(value);

    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";

    return url.toString();
  } catch {
    return value;
  }
}

function formatEnvironmentDebug(): string {
  return DEBUG_ENV_KEYS.map(
    (key) => `${key}:${formatDebugValue(key, process.env[key])}`,
  ).join(" ");
}

function formatDebugValue(key: string, value: string | undefined): string {
  if (value === undefined) {
    return "unset";
  }

  if (
    key === "LANGCHAIN_ENDPOINT" ||
    key === ANTHROPIC_BASE_URL_ENV_KEY ||
    key === OPENAI_COMPATIBLE_BASE_URL_ENV_KEY
  ) {
    return formatUrlDebugValue(value);
  }

  if (isSecretDebugKey(key)) {
    return `set(length=${value.length})`;
  }

  if (
    key === OPENWIKI_MODEL_ID_ENV_KEY ||
    key === OPENWIKI_PROVIDER_ENV_KEY ||
    key === OPENWIKI_MODEL_EFFORT_ENV_KEY ||
    key === OPENWIKI_LANGUAGE_ENV_KEY ||
    key === OPENWIKI_PROVIDER_RETRY_ATTEMPTS_ENV_KEY
  ) {
    return `set(value=${JSON.stringify(value)})`;
  }

  if (value.length <= 10) {
    return `set(length=${value.length})`;
  }

  return `set(length=${value.length}, preview=${JSON.stringify(
    `${value.slice(0, 6)}...${value.slice(-4)}`,
  )})`;
}

function isSecretDebugKey(key: string): boolean {
  return (
    key.endsWith("_API_KEY") ||
    key === ANTHROPIC_AUTH_TOKEN_ENV_KEY ||
    key === CLAUDE_CODE_OAUTH_TOKEN_ENV_KEY
  );
}

function formatUrlDebugValue(value: string): string {
  try {
    const url = new URL(value);
    const redacted: string[] = [];

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

    const redactionSuffix =
      redacted.length > 0 ? `, redacted=${redacted.join("+")}` : "";

    return `set(url=${JSON.stringify(url.toString())}${redactionSuffix})`;
  } catch {
    return `set(length=${value.length}, preview=${JSON.stringify(
      `${value.slice(0, 6)}...${value.slice(-4)}`,
    )})`;
  }
}
