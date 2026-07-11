export declare const OPEN_WIKI_DIR = "openwiki";
export declare const UPDATE_METADATA_PATH = "openwiki/.last-update.json";
export declare const BASETEN_API_KEY_ENV_KEY = "BASETEN_API_KEY";
export declare const FIREWORKS_API_KEY_ENV_KEY = "FIREWORKS_API_KEY";
export declare const OPENAI_API_KEY_ENV_KEY = "OPENAI_API_KEY";
export declare const OPENAI_COMPATIBLE_API_KEY_ENV_KEY = "OPENAI_COMPATIBLE_API_KEY";
export declare const OPENAI_COMPATIBLE_BASE_URL_ENV_KEY = "OPENAI_COMPATIBLE_BASE_URL";
export declare const OPENAI_CHATGPT_ACCESS_TOKEN_ENV_KEY = "OPENAI_CHATGPT_ACCESS_TOKEN";
export declare const OPENAI_CHATGPT_REFRESH_TOKEN_ENV_KEY = "OPENAI_CHATGPT_REFRESH_TOKEN";
export declare const OPENAI_CHATGPT_EXPIRES_AT_ENV_KEY = "OPENAI_CHATGPT_EXPIRES_AT";
export declare const OPENAI_CHATGPT_ACCOUNT_ID_ENV_KEY = "OPENAI_CHATGPT_ACCOUNT_ID";
export declare const OPENAI_CHATGPT_EMAIL_ENV_KEY = "OPENAI_CHATGPT_EMAIL";
export declare const OPENAI_CHATGPT_PLAN_ENV_KEY = "OPENAI_CHATGPT_PLAN";
export declare const ANTHROPIC_API_KEY_ENV_KEY = "ANTHROPIC_API_KEY";
export declare const ANTHROPIC_AUTH_TOKEN_ENV_KEY = "ANTHROPIC_AUTH_TOKEN";
export declare const ANTHROPIC_BASE_URL_ENV_KEY = "ANTHROPIC_BASE_URL";
export declare const CLAUDE_CODE_OAUTH_TOKEN_ENV_KEY = "CLAUDE_CODE_OAUTH_TOKEN";
export declare const ANTHROPIC_OAUTH_BETA_HEADER = "oauth-2025-04-20";
export declare const CLAUDE_CODE_OAUTH_BILLING_SYSTEM_TEXT = "x-anthropic-billing-header: cc_version=openwiki; cc_entrypoint=openwiki;";
export declare const OPENROUTER_API_KEY_ENV_KEY = "OPENROUTER_API_KEY";
export declare const OPENWIKI_PROVIDER_ENV_KEY = "OPENWIKI_PROVIDER";
export declare const OPENWIKI_MODEL_ID_ENV_KEY = "OPENWIKI_MODEL_ID";
export declare const OPENWIKI_MODEL_EFFORT_ENV_KEY = "OPENWIKI_MODEL_EFFORT";
export declare const OPENWIKI_LANGUAGE_ENV_KEY = "OPENWIKI_LANGUAGE";
export declare const DEFAULT_WIKI_LANGUAGE = "ko";
export declare const OPENWIKI_PROVIDER_RETRY_ATTEMPTS_ENV_KEY = "OPENWIKI_PROVIDER_RETRY_ATTEMPTS";
export declare const DEFAULT_PROVIDER_RETRY_ATTEMPTS = 3;
export declare const OPENWIKI_GOOGLE_ACCESS_TOKEN_ENV_KEY = "OPENWIKI_GOOGLE_ACCESS_TOKEN";
export declare const OPENWIKI_GOOGLE_CLIENT_ID_ENV_KEY = "OPENWIKI_GOOGLE_CLIENT_ID";
export declare const OPENWIKI_GOOGLE_CLIENT_SECRET_ENV_KEY = "OPENWIKI_GOOGLE_CLIENT_SECRET";
export declare const OPENWIKI_GOOGLE_REFRESH_TOKEN_ENV_KEY = "OPENWIKI_GOOGLE_REFRESH_TOKEN";
export declare const OPENWIKI_GMAIL_ACCESS_TOKEN_ENV_KEY = "OPENWIKI_GMAIL_ACCESS_TOKEN";
export declare const OPENWIKI_GMAIL_REFRESH_TOKEN_ENV_KEY = "OPENWIKI_GMAIL_REFRESH_TOKEN";
export declare const OPENWIKI_NOTION_MCP_ACCESS_TOKEN_ENV_KEY = "OPENWIKI_NOTION_MCP_ACCESS_TOKEN";
export declare const OPENWIKI_NOTION_MCP_CLIENT_ID_ENV_KEY = "OPENWIKI_NOTION_MCP_CLIENT_ID";
export declare const OPENWIKI_NOTION_MCP_REFRESH_TOKEN_ENV_KEY = "OPENWIKI_NOTION_MCP_REFRESH_TOKEN";
export declare const OPENWIKI_NOTION_TOKEN_ENV_KEY = "OPENWIKI_NOTION_TOKEN";
export declare const OPENWIKI_SLACK_BOT_TOKEN_ENV_KEY = "OPENWIKI_SLACK_BOT_TOKEN";
export declare const OPENWIKI_SLACK_CLIENT_ID_ENV_KEY = "OPENWIKI_SLACK_CLIENT_ID";
export declare const OPENWIKI_SLACK_CLIENT_SECRET_ENV_KEY = "OPENWIKI_SLACK_CLIENT_SECRET";
export declare const OPENWIKI_SLACK_USER_TOKEN_ENV_KEY = "OPENWIKI_SLACK_USER_TOKEN";
export declare const OPENWIKI_X_ACCESS_TOKEN_ENV_KEY = "OPENWIKI_X_ACCESS_TOKEN";
export declare const OPENWIKI_X_CLIENT_ID_ENV_KEY = "OPENWIKI_X_CLIENT_ID";
export declare const OPENWIKI_X_CLIENT_SECRET_ENV_KEY = "OPENWIKI_X_CLIENT_SECRET";
export declare const OPENWIKI_X_REFRESH_TOKEN_ENV_KEY = "OPENWIKI_X_REFRESH_TOKEN";
export declare const OPENWIKI_TAVILY_API_KEY_ENV_KEY = "TAVILY_API_KEY";
export declare const DEFAULT_PROVIDER = "openai";
export declare const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export type OpenWikiProvider = "anthropic" | "baseten" | "fireworks" | "openai" | "openai-chatgpt" | "openai-compatible" | "openrouter";
/**
 * How a provider authenticates. Providers default to `"api-key"` (a pasted
 * secret persisted to a `*_API_KEY` env var); `"oauth"` providers instead run a
 * browser login flow and persist short-lived access/refresh tokens.
 */
export type ProviderAuthMethod = "api-key" | "oauth";
export type SelectableOpenWikiProvider = OpenWikiProvider;
export type ProviderModelOption = {
    id: string;
    label: string;
};
export type ProviderCredential = {
    envKey: string;
    type: "api-key" | "auth-token";
    value: string;
};
type ProviderConfig = {
    apiKeyEnvKey: string;
    /**
     * Authentication method for the provider. Omitted entries are implicitly
     * {@link ProviderAuthMethod} `"api-key"`. `"oauth"` providers replace the
     * pasted-key setup step with a browser login and store tokens instead.
     */
    authMethod?: ProviderAuthMethod;
    baseURL?: string;
    /**
     * Environment variable that, when set, overrides {@link ProviderConfig.baseURL}
     * with an alternative base URL (e.g. a self-hosted or proxied endpoint).
     */
    baseUrlEnvKey?: string;
    /**
     * When true, the provider has no default endpoint and requires a base URL to
     * be supplied via {@link ProviderConfig.baseUrlEnvKey}.
     */
    requiresBaseUrl?: boolean;
    label: string;
    modelOptions: ProviderModelOption[];
};
export declare const SELECTABLE_OPENWIKI_PROVIDERS: readonly ["openai", "openai-chatgpt", "anthropic", "openrouter", "openai-compatible", "fireworks", "baseten"];
export declare const PROVIDER_CONFIGS: Record<OpenWikiProvider, ProviderConfig>;
export declare const DEFAULT_MODEL_ID: string;
export declare const SUGGESTED_MODEL_IDS: string[];
export declare function getProviderConfig(provider: OpenWikiProvider): ProviderConfig;
export declare function getProviderLabel(provider: OpenWikiProvider): string;
export declare function getProviderApiKeyEnvKey(provider: OpenWikiProvider): string;
export declare function getProviderCredentialEnvKeys(provider: OpenWikiProvider): string[];
export declare function getProviderCredentialRequirement(provider: OpenWikiProvider): string;
export declare function createProviderCredentialRequiredMessage(provider: OpenWikiProvider, mode: "interactive" | "non-interactive"): string;
export declare function createProviderCredentialConfigurationError(provider: OpenWikiProvider, env?: NodeJS.ProcessEnv): string | null;
export declare function resolveProviderCredential(provider: OpenWikiProvider, env?: NodeJS.ProcessEnv): ProviderCredential | null;
export declare function getProviderAuthMethod(provider: OpenWikiProvider): ProviderAuthMethod;
export declare function providerUsesOAuth(provider: OpenWikiProvider): boolean;
/**
 * Resolves the base URL for a provider, preferring an alternative base URL from
 * the provider's configured environment variable over the built-in default.
 * Returns `undefined` when neither is set, so callers fall back to the SDK's
 * own default endpoint.
 */
export declare function resolveProviderBaseUrl(provider: OpenWikiProvider, env?: NodeJS.ProcessEnv): string | undefined;
export declare function getProviderBaseUrlEnvKey(provider: OpenWikiProvider): string | undefined;
export declare function providerRequiresBaseUrl(provider: OpenWikiProvider): boolean;
export declare function isValidBaseUrl(value: string): boolean;
export declare function getProviderModelOptions(provider: OpenWikiProvider): ProviderModelOption[];
export declare function getDefaultModelId(provider: OpenWikiProvider): string;
export declare function normalizeProvider(value: string | null | undefined): OpenWikiProvider | null;
export declare function isValidProvider(value: string): value is OpenWikiProvider;
export declare function resolveConfiguredProvider(env?: NodeJS.ProcessEnv): OpenWikiProvider;
export type AnthropicModelEffort = "low" | "medium" | "high" | "xhigh" | "max";
export declare const DEFAULT_ANTHROPIC_MODEL_EFFORT: AnthropicModelEffort;
/**
 * Output-token ceiling for Anthropic models running with adaptive thinking and
 * an effort setting. Thinking tokens count against max_tokens, and high effort
 * levels need generous headroom; the SDK default for unknown model IDs is only
 * 4096, which truncates documentation writes mid-thought.
 */
export declare const DEFAULT_ANTHROPIC_EFFORT_MAX_OUTPUT_TOKENS = 64000;
export declare function anthropicModelSupportsAdaptiveReasoning(modelId: string): boolean;
/**
 * Resolves the effort level for an Anthropic model. OPENWIKI_MODEL_EFFORT wins
 * when set to a valid level ("none"/"off"/"disabled" suppresses the effort
 * parameter entirely); otherwise xhigh-capable models default to
 * {@link DEFAULT_ANTHROPIC_MODEL_EFFORT} and the rest use the API default.
 * Returns null when no effort parameter should be sent.
 */
export declare function resolveAnthropicModelEffort(modelId: string, env?: NodeJS.ProcessEnv): AnthropicModelEffort | null;
export declare function isAnthropicModelEffort(value: string): value is AnthropicModelEffort;
export declare function isValidModelEffortSetting(value: string): boolean;
/**
 * Canonicalizes language input so "ko", "Korean", and "한국어" compare equal in
 * run options, env configuration, and update metadata.
 */
export declare function normalizeLanguage(value: string): string;
export declare function isValidLanguage(value: string): boolean;
/**
 * Human-readable language name used inside model prompts. Unknown values pass
 * through so free-form languages still work.
 */
export declare function formatLanguageForPrompt(value: string): string;
export declare function resolveProviderRetryAttempts(env?: NodeJS.ProcessEnv): number;
export declare function normalizeModelId(value: string): string;
export declare function isValidModelId(value: string): boolean;
export declare const OPENWIKI_VERSION = "0.1.1";
export {};
