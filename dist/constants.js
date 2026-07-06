export const OPEN_WIKI_DIR = "openwiki";
export const UPDATE_METADATA_PATH = `${OPEN_WIKI_DIR}/.last-update.json`;
export const BASETEN_API_KEY_ENV_KEY = "BASETEN_API_KEY";
export const FIREWORKS_API_KEY_ENV_KEY = "FIREWORKS_API_KEY";
export const OPENAI_API_KEY_ENV_KEY = "OPENAI_API_KEY";
export const OPENAI_COMPATIBLE_API_KEY_ENV_KEY = "OPENAI_COMPATIBLE_API_KEY";
export const OPENAI_COMPATIBLE_BASE_URL_ENV_KEY = "OPENAI_COMPATIBLE_BASE_URL";
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
export const DEFAULT_PROVIDER = "openrouter";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const SELECTABLE_OPENWIKI_PROVIDERS = [
    "openrouter",
    "baseten",
    "fireworks",
    "openai",
    "openai-compatible",
    "anthropic",
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
        modelOptions: [
            { id: "gpt-5.4-mini", label: "5.4 mini" },
            { id: "gpt-5.5", label: "5.5" },
        ],
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
            { id: "claude-haiku-4-5", label: "Haiku" },
            { id: "claude-sonnet-5", label: "Sonnet" },
            { id: "claude-opus-4-8", label: "Opus" },
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
            { id: "anthropic/claude-opus-4.8", label: "Claude Opus" },
            { id: "anthropic/claude-sonnet-5", label: "Claude Sonnet" },
            { id: "openai/gpt-5.4-mini", label: "GPT 5.4 mini" },
            { id: "openai/gpt-5.5", label: "GPT 5.5" },
        ],
    },
};
export const DEFAULT_MODEL_ID = PROVIDER_CONFIGS[DEFAULT_PROVIDER].modelOptions[0]?.id ?? "zai-org/GLM-5.2";
export const OPENROUTER_FALLBACK_MODEL_IDS = [
    "openai/gpt-5.4-mini",
    "anthropic/claude-sonnet-5",
];
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
    return value in PROVIDER_CONFIGS;
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
    return value !== undefined && value.length > 0 ? value : null;
}
function isAnthropicOAuthToken(value) {
    return value.trim().startsWith(ANTHROPIC_OAUTH_TOKEN_PREFIX);
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
export const OPENWIKI_VERSION = "0.0.1";
