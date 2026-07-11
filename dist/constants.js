export const OPEN_WIKI_DIR = "openwiki";
export const UPDATE_METADATA_PATH = `${OPEN_WIKI_DIR}/.last-update.json`;
export const BASETEN_API_KEY_ENV_KEY = "BASETEN_API_KEY";
export const FIREWORKS_API_KEY_ENV_KEY = "FIREWORKS_API_KEY";
export const OPENAI_API_KEY_ENV_KEY = "OPENAI_API_KEY";
export const OPENAI_COMPATIBLE_API_KEY_ENV_KEY = "OPENAI_COMPATIBLE_API_KEY";
export const OPENAI_COMPATIBLE_BASE_URL_ENV_KEY = "OPENAI_COMPATIBLE_BASE_URL";
export const OPENAI_CHATGPT_ACCESS_TOKEN_ENV_KEY = "OPENAI_CHATGPT_ACCESS_TOKEN";
export const OPENAI_CHATGPT_REFRESH_TOKEN_ENV_KEY = "OPENAI_CHATGPT_REFRESH_TOKEN";
export const OPENAI_CHATGPT_EXPIRES_AT_ENV_KEY = "OPENAI_CHATGPT_EXPIRES_AT";
export const OPENAI_CHATGPT_ACCOUNT_ID_ENV_KEY = "OPENAI_CHATGPT_ACCOUNT_ID";
export const OPENAI_CHATGPT_EMAIL_ENV_KEY = "OPENAI_CHATGPT_EMAIL";
export const OPENAI_CHATGPT_PLAN_ENV_KEY = "OPENAI_CHATGPT_PLAN";
export const ANTHROPIC_API_KEY_ENV_KEY = "ANTHROPIC_API_KEY";
export const ANTHROPIC_AUTH_TOKEN_ENV_KEY = "ANTHROPIC_AUTH_TOKEN";
export const ANTHROPIC_BASE_URL_ENV_KEY = "ANTHROPIC_BASE_URL";
export const CLAUDE_CODE_OAUTH_TOKEN_ENV_KEY = "CLAUDE_CODE_OAUTH_TOKEN";
export const ANTHROPIC_OAUTH_BETA_HEADER = "oauth-2025-04-20";
export const CLAUDE_CODE_OAUTH_BILLING_SYSTEM_TEXT = "x-anthropic-billing-header: cc_version=openwiki; cc_entrypoint=openwiki;";
const ANTHROPIC_OAUTH_TOKEN_PREFIX = "sk-ant-oat";
export const OPENROUTER_API_KEY_ENV_KEY = "OPENROUTER_API_KEY";
export const OPENWIKI_PROVIDER_ENV_KEY = "OPENWIKI_PROVIDER";
export const OPENWIKI_MODEL_ID_ENV_KEY = "OPENWIKI_MODEL_ID";
export const OPENWIKI_MODEL_EFFORT_ENV_KEY = "OPENWIKI_MODEL_EFFORT";
export const OPENWIKI_LANGUAGE_ENV_KEY = "OPENWIKI_LANGUAGE";
export const DEFAULT_WIKI_LANGUAGE = "ko";
export const OPENWIKI_PROVIDER_RETRY_ATTEMPTS_ENV_KEY = "OPENWIKI_PROVIDER_RETRY_ATTEMPTS";
export const DEFAULT_PROVIDER_RETRY_ATTEMPTS = 3;
export const OPENWIKI_GOOGLE_ACCESS_TOKEN_ENV_KEY = "OPENWIKI_GOOGLE_ACCESS_TOKEN";
export const OPENWIKI_GOOGLE_CLIENT_ID_ENV_KEY = "OPENWIKI_GOOGLE_CLIENT_ID";
export const OPENWIKI_GOOGLE_CLIENT_SECRET_ENV_KEY = "OPENWIKI_GOOGLE_CLIENT_SECRET";
export const OPENWIKI_GOOGLE_REFRESH_TOKEN_ENV_KEY = "OPENWIKI_GOOGLE_REFRESH_TOKEN";
export const OPENWIKI_GMAIL_ACCESS_TOKEN_ENV_KEY = "OPENWIKI_GMAIL_ACCESS_TOKEN";
export const OPENWIKI_GMAIL_REFRESH_TOKEN_ENV_KEY = "OPENWIKI_GMAIL_REFRESH_TOKEN";
export const OPENWIKI_NOTION_MCP_ACCESS_TOKEN_ENV_KEY = "OPENWIKI_NOTION_MCP_ACCESS_TOKEN";
export const OPENWIKI_NOTION_MCP_CLIENT_ID_ENV_KEY = "OPENWIKI_NOTION_MCP_CLIENT_ID";
export const OPENWIKI_NOTION_MCP_REFRESH_TOKEN_ENV_KEY = "OPENWIKI_NOTION_MCP_REFRESH_TOKEN";
export const OPENWIKI_NOTION_TOKEN_ENV_KEY = "OPENWIKI_NOTION_TOKEN";
export const OPENWIKI_SLACK_BOT_TOKEN_ENV_KEY = "OPENWIKI_SLACK_BOT_TOKEN";
export const OPENWIKI_SLACK_CLIENT_ID_ENV_KEY = "OPENWIKI_SLACK_CLIENT_ID";
export const OPENWIKI_SLACK_CLIENT_SECRET_ENV_KEY = "OPENWIKI_SLACK_CLIENT_SECRET";
export const OPENWIKI_SLACK_USER_TOKEN_ENV_KEY = "OPENWIKI_SLACK_USER_TOKEN";
export const OPENWIKI_X_ACCESS_TOKEN_ENV_KEY = "OPENWIKI_X_ACCESS_TOKEN";
export const OPENWIKI_X_CLIENT_ID_ENV_KEY = "OPENWIKI_X_CLIENT_ID";
export const OPENWIKI_X_CLIENT_SECRET_ENV_KEY = "OPENWIKI_X_CLIENT_SECRET";
export const OPENWIKI_X_REFRESH_TOKEN_ENV_KEY = "OPENWIKI_X_REFRESH_TOKEN";
export const OPENWIKI_TAVILY_API_KEY_ENV_KEY = "TAVILY_API_KEY";
export const DEFAULT_PROVIDER = "openai";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
/**
 * Model options offered by OpenAI. Shared by the `openai` (API key) and
 * `openai-chatgpt` (OAuth login) providers so the two always expose an
 * identical model list.
 */
const OPENAI_MODEL_OPTIONS = [
    { id: "gpt-5.6-terra", label: "5.6 Terra" },
    { id: "gpt-5.6-luna", label: "5.6 Luna" },
    { id: "gpt-5.6-sol", label: "5.6 Sol" },
    { id: "gpt-5.5", label: "5.5" },
    { id: "gpt-5.4-mini", label: "5.4 mini" },
];
export const SELECTABLE_OPENWIKI_PROVIDERS = [
    "openai",
    "openai-chatgpt",
    "anthropic",
    "openrouter",
    "openai-compatible",
    "fireworks",
    "baseten",
];
export const PROVIDER_CONFIGS = {
    baseten: {
        apiKeyEnvKey: BASETEN_API_KEY_ENV_KEY,
        baseURL: "https://inference.baseten.co/v1",
        label: "Baseten",
        modelOptions: [
            { id: "zai-org/GLM-5.2", label: "GLM 5.2" },
            { id: "moonshotai/Kimi-K2.7-Code", label: "Kimi K2.7 Code" },
        ],
    },
    fireworks: {
        apiKeyEnvKey: FIREWORKS_API_KEY_ENV_KEY,
        baseURL: "https://api.fireworks.ai/inference/v1",
        label: "Fireworks",
        modelOptions: [
            { id: "accounts/fireworks/models/glm-5p2", label: "GLM 5.2" },
            {
                id: "accounts/fireworks/models/kimi-k2p7-code",
                label: "Kimi K2.7 Code",
            },
        ],
    },
    openai: {
        apiKeyEnvKey: OPENAI_API_KEY_ENV_KEY,
        label: "OpenAI",
        modelOptions: OPENAI_MODEL_OPTIONS,
    },
    "openai-chatgpt": {
        apiKeyEnvKey: OPENAI_CHATGPT_ACCESS_TOKEN_ENV_KEY,
        authMethod: "oauth",
        label: "OpenAI (ChatGPT login)",
        modelOptions: OPENAI_MODEL_OPTIONS,
    },
    "openai-compatible": {
        apiKeyEnvKey: OPENAI_COMPATIBLE_API_KEY_ENV_KEY,
        baseUrlEnvKey: OPENAI_COMPATIBLE_BASE_URL_ENV_KEY,
        requiresBaseUrl: true,
        label: "OpenAI-compatible",
        modelOptions: [],
    },
    anthropic: {
        apiKeyEnvKey: ANTHROPIC_API_KEY_ENV_KEY,
        baseUrlEnvKey: ANTHROPIC_BASE_URL_ENV_KEY,
        label: "Anthropic",
        modelOptions: [
            { id: "claude-opus-4-8", label: "Opus" },
            { id: "claude-sonnet-5", label: "Sonnet" },
            { id: "claude-haiku-4-5", label: "Haiku" },
        ],
    },
    openrouter: {
        apiKeyEnvKey: OPENROUTER_API_KEY_ENV_KEY,
        baseURL: OPENROUTER_BASE_URL,
        label: "OpenRouter",
        modelOptions: [
            { id: "z-ai/glm-5.2", label: "GLM 5.2" },
            { id: "openrouter/fusion", label: "OpenRouter Fusion" },
            { id: "moonshotai/kimi-k2.7-code", label: "Kimi K2.7 Code" },
            { id: "anthropic/claude-opus-4-8", label: "Claude Opus" },
            { id: "anthropic/claude-sonnet-5", label: "Claude Sonnet" },
            { id: "openai/gpt-5.4-mini", label: "GPT 5.4 mini" },
            { id: "openai/gpt-5.5", label: "GPT 5.5" },
        ],
    },
};
export const DEFAULT_MODEL_ID = PROVIDER_CONFIGS[DEFAULT_PROVIDER].modelOptions[0]?.id ?? "gpt-5.6-terra";
export const SUGGESTED_MODEL_IDS = PROVIDER_CONFIGS[DEFAULT_PROVIDER].modelOptions.map((model) => model.id);
export function getProviderConfig(provider) {
    return PROVIDER_CONFIGS[provider];
}
export function getProviderLabel(provider) {
    return getProviderConfig(provider).label;
}
export function getProviderApiKeyEnvKey(provider) {
    return getProviderConfig(provider).apiKeyEnvKey;
}
export function getProviderCredentialEnvKeys(provider) {
    if (provider === "anthropic") {
        return [
            ANTHROPIC_AUTH_TOKEN_ENV_KEY,
            ANTHROPIC_API_KEY_ENV_KEY,
            CLAUDE_CODE_OAUTH_TOKEN_ENV_KEY,
        ];
    }
    return [getProviderApiKeyEnvKey(provider)];
}
export function getProviderCredentialRequirement(provider) {
    const keys = getProviderCredentialEnvKeys(provider);
    if (keys.length === 1) {
        return keys[0];
    }
    return `${keys.slice(0, -1).join(", ")}, or ${keys[keys.length - 1]}`;
}
export function createProviderCredentialRequiredMessage(provider, mode) {
    const requirement = getProviderCredentialRequirement(provider);
    if (mode === "non-interactive") {
        return `${requirement} is required for non-interactive runs. Run openwiki in an interactive terminal to save credentials.`;
    }
    return `${requirement} is required. Run openwiki in an interactive terminal to save credentials.`;
}
export function createProviderCredentialConfigurationError(provider, env = process.env) {
    if (provider !== "anthropic") {
        return null;
    }
    if (getNonEmptyEnvValue(env, ANTHROPIC_AUTH_TOKEN_ENV_KEY) !== null) {
        return null;
    }
    const apiKey = getNonEmptyEnvValue(env, ANTHROPIC_API_KEY_ENV_KEY);
    if (apiKey === null || !isAnthropicOAuthToken(apiKey)) {
        return null;
    }
    return `${ANTHROPIC_API_KEY_ENV_KEY} appears to contain an Anthropic OAuth token. Move it to ${ANTHROPIC_AUTH_TOKEN_ENV_KEY} or ${CLAUDE_CODE_OAUTH_TOKEN_ENV_KEY}, or replace ${ANTHROPIC_API_KEY_ENV_KEY} with an Anthropic Console API key.`;
}
export function resolveProviderCredential(provider, env = process.env) {
    if (provider === "anthropic") {
        const authToken = getNonEmptyEnvValue(env, ANTHROPIC_AUTH_TOKEN_ENV_KEY);
        if (authToken !== null) {
            return {
                envKey: ANTHROPIC_AUTH_TOKEN_ENV_KEY,
                type: "auth-token",
                value: authToken,
            };
        }
        const apiKey = getNonEmptyEnvValue(env, ANTHROPIC_API_KEY_ENV_KEY);
        if (apiKey !== null) {
            return {
                envKey: ANTHROPIC_API_KEY_ENV_KEY,
                type: "api-key",
                value: apiKey,
            };
        }
        const claudeCodeOAuthToken = getNonEmptyEnvValue(env, CLAUDE_CODE_OAUTH_TOKEN_ENV_KEY);
        if (claudeCodeOAuthToken !== null) {
            return {
                envKey: CLAUDE_CODE_OAUTH_TOKEN_ENV_KEY,
                type: "auth-token",
                value: claudeCodeOAuthToken,
            };
        }
        return null;
    }
    const apiKeyEnvKey = getProviderApiKeyEnvKey(provider);
    const apiKey = getNonEmptyEnvValue(env, apiKeyEnvKey);
    if (apiKey === null) {
        return null;
    }
    return {
        envKey: apiKeyEnvKey,
        type: "api-key",
        value: apiKey,
    };
}
export function getProviderAuthMethod(provider) {
    return getProviderConfig(provider).authMethod ?? "api-key";
}
export function providerUsesOAuth(provider) {
    return getProviderAuthMethod(provider) === "oauth";
}
/**
 * Resolves the base URL for a provider, preferring an alternative base URL from
 * the provider's configured environment variable over the built-in default.
 * Returns `undefined` when neither is set, so callers fall back to the SDK's
 * own default endpoint.
 */
export function resolveProviderBaseUrl(provider, env = process.env) {
    const config = getProviderConfig(provider);
    const override = config.baseUrlEnvKey ? env[config.baseUrlEnvKey] : undefined;
    const trimmedOverride = override?.trim();
    if (trimmedOverride) {
        return trimmedOverride;
    }
    return config.baseURL;
}
export function getProviderBaseUrlEnvKey(provider) {
    return getProviderConfig(provider).baseUrlEnvKey;
}
export function providerRequiresBaseUrl(provider) {
    return getProviderConfig(provider).requiresBaseUrl === true;
}
export function isValidBaseUrl(value) {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
        return false;
    }
    try {
        const url = new URL(trimmed);
        return url.protocol === "http:" || url.protocol === "https:";
    }
    catch {
        return false;
    }
}
export function getProviderModelOptions(provider) {
    return getProviderConfig(provider).modelOptions;
}
export function getDefaultModelId(provider) {
    return getProviderModelOptions(provider)[0]?.id ?? DEFAULT_MODEL_ID;
}
export function normalizeProvider(value) {
    if (value === undefined || value === null) {
        return null;
    }
    const provider = value.trim().toLowerCase();
    return isValidProvider(provider) ? provider : null;
}
export function isValidProvider(value) {
    return Object.hasOwn(PROVIDER_CONFIGS, value);
}
export function resolveConfiguredProvider(env = process.env) {
    const configuredProvider = normalizeProvider(env[OPENWIKI_PROVIDER_ENV_KEY]);
    if (configuredProvider !== null) {
        return configuredProvider;
    }
    // Without an explicit provider setting, fall back to the first selectable
    // provider whose credentials are already present, so single-credential
    // environments (e.g. only CLAUDE_CODE_OAUTH_TOKEN) work without extra setup.
    for (const provider of SELECTABLE_OPENWIKI_PROVIDERS) {
        if (resolveProviderCredential(provider, env) === null) {
            continue;
        }
        if (createProviderCredentialConfigurationError(provider, env) !== null) {
            continue;
        }
        if (providerRequiresBaseUrl(provider) &&
            resolveProviderBaseUrl(provider, env) === undefined) {
            continue;
        }
        return provider;
    }
    return DEFAULT_PROVIDER;
}
function getNonEmptyEnvValue(env, key) {
    const value = env[key];
    return value !== undefined && value.trim().length > 0 ? value : null;
}
function isAnthropicOAuthToken(value) {
    return value.trim().startsWith(ANTHROPIC_OAUTH_TOKEN_PREFIX);
}
export const DEFAULT_ANTHROPIC_MODEL_EFFORT = "xhigh";
/**
 * Output-token ceiling for Anthropic models running with adaptive thinking and
 * an effort setting. Thinking tokens count against max_tokens, and high effort
 * levels need generous headroom; the SDK default for unknown model IDs is only
 * 4096, which truncates documentation writes mid-thought.
 */
export const DEFAULT_ANTHROPIC_EFFORT_MAX_OUTPUT_TOKENS = 64_000;
const ANTHROPIC_MODEL_EFFORT_VALUES = [
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
];
const ANTHROPIC_MODEL_EFFORT_DISABLED_VALUES = ["none", "off", "disabled"];
// Claude 4.6+ model families that accept adaptive thinking plus
// output_config.effort. Older models (e.g. Haiku 4.5, Opus 4.5) reject
// adaptive thinking, so they run with the API defaults instead.
const ANTHROPIC_ADAPTIVE_REASONING_MODEL_ID_PREFIXES = [
    "claude-opus-4-6",
    "claude-opus-4-7",
    "claude-opus-4-8",
    "claude-sonnet-4-6",
    "claude-sonnet-5",
    "claude-fable-5",
    "claude-mythos-5",
];
// The subset of adaptive-reasoning models that support effort "xhigh"
// (introduced with Opus 4.7). The 4.6 family caps at "high"/"max".
const ANTHROPIC_XHIGH_EFFORT_MODEL_ID_PREFIXES = [
    "claude-opus-4-7",
    "claude-opus-4-8",
    "claude-sonnet-5",
    "claude-fable-5",
    "claude-mythos-5",
];
export function anthropicModelSupportsAdaptiveReasoning(modelId) {
    return matchesAnthropicModelIdPrefix(modelId, ANTHROPIC_ADAPTIVE_REASONING_MODEL_ID_PREFIXES);
}
/**
 * Resolves the effort level for an Anthropic model. OPENWIKI_MODEL_EFFORT wins
 * when set to a valid level ("none"/"off"/"disabled" suppresses the effort
 * parameter entirely); otherwise xhigh-capable models default to
 * {@link DEFAULT_ANTHROPIC_MODEL_EFFORT} and the rest use the API default.
 * Returns null when no effort parameter should be sent.
 */
export function resolveAnthropicModelEffort(modelId, env = process.env) {
    if (!anthropicModelSupportsAdaptiveReasoning(modelId)) {
        return null;
    }
    const configured = env[OPENWIKI_MODEL_EFFORT_ENV_KEY]?.trim().toLowerCase();
    if (configured !== undefined && configured.length > 0) {
        if (ANTHROPIC_MODEL_EFFORT_DISABLED_VALUES.includes(configured)) {
            return null;
        }
        if (isAnthropicModelEffort(configured)) {
            return configured;
        }
    }
    return matchesAnthropicModelIdPrefix(modelId, ANTHROPIC_XHIGH_EFFORT_MODEL_ID_PREFIXES)
        ? DEFAULT_ANTHROPIC_MODEL_EFFORT
        : null;
}
export function isAnthropicModelEffort(value) {
    return ANTHROPIC_MODEL_EFFORT_VALUES.includes(value);
}
export function isValidModelEffortSetting(value) {
    const normalized = value.trim().toLowerCase();
    return (isAnthropicModelEffort(normalized) ||
        ANTHROPIC_MODEL_EFFORT_DISABLED_VALUES.includes(normalized));
}
function matchesAnthropicModelIdPrefix(modelId, prefixes) {
    const normalized = modelId.trim().toLowerCase();
    return prefixes.some((prefix) => normalized === prefix ||
        normalized.startsWith(`${prefix}-`) ||
        normalized.startsWith(`${prefix}@`));
}
const LANGUAGE_ALIASES = {
    ko: "ko",
    kor: "ko",
    korean: "ko",
    한국어: "ko",
    한글: "ko",
    en: "en",
    eng: "en",
    english: "en",
    영어: "en",
    ja: "ja",
    jpn: "ja",
    japanese: "ja",
    日本語: "ja",
    일본어: "ja",
    zh: "zh",
    chinese: "zh",
    中文: "zh",
    중국어: "zh",
};
const LANGUAGE_PROMPT_LABELS = {
    ko: "Korean (한국어)",
    en: "English",
    ja: "Japanese (日本語)",
    zh: "Chinese (中文)",
};
/**
 * Canonicalizes language input so "ko", "Korean", and "한국어" compare equal in
 * run options, env configuration, and update metadata.
 */
export function normalizeLanguage(value) {
    const trimmed = value.trim().toLowerCase();
    return LANGUAGE_ALIASES[trimmed] ?? trimmed;
}
export function isValidLanguage(value) {
    const language = normalizeLanguage(value);
    return (language.length > 0 &&
        language.length <= 60 &&
        /^[\p{L}\p{N}][\p{L}\p{N} _()-]*$/u.test(language));
}
/**
 * Human-readable language name used inside model prompts. Unknown values pass
 * through so free-form languages still work.
 */
export function formatLanguageForPrompt(value) {
    const language = normalizeLanguage(value);
    return LANGUAGE_PROMPT_LABELS[language] ?? language;
}
export function resolveProviderRetryAttempts(env = process.env) {
    const rawRetryAttempts = env[OPENWIKI_PROVIDER_RETRY_ATTEMPTS_ENV_KEY];
    if (rawRetryAttempts === undefined) {
        return DEFAULT_PROVIDER_RETRY_ATTEMPTS;
    }
    const retryAttempts = rawRetryAttempts.trim();
    if (!/^[1-9]\d*$/u.test(retryAttempts)) {
        throw new Error(`Invalid ${OPENWIKI_PROVIDER_RETRY_ATTEMPTS_ENV_KEY}. Expected a positive integer.`);
    }
    const parsedRetryAttempts = Number(retryAttempts);
    if (!Number.isSafeInteger(parsedRetryAttempts)) {
        throw new Error(`Invalid ${OPENWIKI_PROVIDER_RETRY_ATTEMPTS_ENV_KEY}. Expected a positive integer.`);
    }
    return parsedRetryAttempts;
}
export function normalizeModelId(value) {
    return value.trim();
}
export function isValidModelId(value) {
    const modelId = normalizeModelId(value);
    return (modelId.length > 0 &&
        modelId.length <= 120 &&
        /^[A-Za-z0-9][A-Za-z0-9._:/+-]*$/u.test(modelId) &&
        !modelId.includes("://"));
}
export const OPENWIKI_VERSION = "0.1.1";
