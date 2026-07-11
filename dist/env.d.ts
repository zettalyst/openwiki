export declare const openWikiEnvDir: string;
export declare const openWikiEnvPath: string;
type EnvMap = Record<string, string>;
export type CredentialDiagnostic = {
    key: string;
    source: "process.env" | "~/.openwiki/.env" | "process.env over ~/.openwiki/.env" | "unset";
    length: number | null;
    preview: string;
    warnings: string[];
};
/**
 * Every environment variable OpenWiki reads or persists, in the order they are
 * written to `~/.openwiki/.env`. This is the single source of truth: the
 * credential diagnostics list and the agent's debug-dump key list are both
 * derived from it (see {@link CREDENTIAL_DIAGNOSTIC_ENV_KEYS} and
 * {@link DEBUG_ENV_KEYS}), so they cannot silently drift out of sync when a new
 * managed key is added.
 */
export declare const MANAGED_ENV_KEYS: readonly ["BASETEN_API_KEY", "FIREWORKS_API_KEY", "OPENAI_API_KEY", "OPENAI_CHATGPT_ACCESS_TOKEN", "OPENAI_CHATGPT_REFRESH_TOKEN", "OPENAI_CHATGPT_EXPIRES_AT", "OPENAI_CHATGPT_ACCOUNT_ID", "OPENAI_CHATGPT_EMAIL", "OPENAI_CHATGPT_PLAN", "OPENAI_COMPATIBLE_API_KEY", "OPENAI_COMPATIBLE_BASE_URL", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "CLAUDE_CODE_OAUTH_TOKEN", "OPENROUTER_API_KEY", "OPENWIKI_PROVIDER", "OPENWIKI_MODEL_ID", "OPENWIKI_MODEL_EFFORT", "OPENWIKI_LANGUAGE", "OPENWIKI_PROVIDER_RETRY_ATTEMPTS", "OPENWIKI_NOTION_TOKEN", "OPENWIKI_NOTION_MCP_CLIENT_ID", "OPENWIKI_NOTION_MCP_ACCESS_TOKEN", "OPENWIKI_NOTION_MCP_REFRESH_TOKEN", "OPENWIKI_SLACK_BOT_TOKEN", "OPENWIKI_SLACK_CLIENT_ID", "OPENWIKI_SLACK_CLIENT_SECRET", "OPENWIKI_SLACK_USER_TOKEN", "OPENWIKI_GMAIL_ACCESS_TOKEN", "OPENWIKI_GMAIL_REFRESH_TOKEN", "OPENWIKI_GOOGLE_CLIENT_ID", "OPENWIKI_GOOGLE_CLIENT_SECRET", "OPENWIKI_GOOGLE_ACCESS_TOKEN", "OPENWIKI_GOOGLE_REFRESH_TOKEN", "OPENWIKI_X_CLIENT_ID", "OPENWIKI_X_CLIENT_SECRET", "OPENWIKI_X_ACCESS_TOKEN", "OPENWIKI_X_REFRESH_TOKEN", "TAVILY_API_KEY", "OPENWIKI_HTTPS_OAUTH_REDIRECT_URI", "OPENWIKI_OAUTH_CALLBACK_PORT", "LANGSMITH_API_KEY", "LANGCHAIN_PROJECT", "LANGCHAIN_TRACING_V2"];
/**
 * Managed keys surfaced (in display order) in the credential diagnostics panel:
 * the provider/model settings and every credential, but not the LangChain
 * project/tracing settings. Derived from {@link MANAGED_ENV_KEYS} so a new
 * credential key automatically appears in diagnostics.
 */
export declare const CREDENTIAL_DIAGNOSTIC_ENV_KEYS: readonly string[];
/**
 * Keys dumped in the agent's environment debug line: every managed key plus the
 * LangChain endpoint override that OpenWiki reads but never persists. Derived
 * from {@link MANAGED_ENV_KEYS} so it cannot drift.
 */
export declare const DEBUG_ENV_KEYS: readonly string[];
export declare function loadOpenWikiEnv(): Promise<EnvMap>;
export declare function getCredentialDiagnostics(): Promise<CredentialDiagnostic[]>;
export declare function saveOpenWikiEnv(updates: EnvMap): Promise<void>;
export declare function parseEnv(content: string): EnvMap;
export declare function formatEnv(env: EnvMap): string;
export {};
