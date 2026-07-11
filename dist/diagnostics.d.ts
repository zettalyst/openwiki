/**
 * Redacts secrets from text before it is shown to the user or written to a log.
 *
 * This is a security boundary: any error message, header value, or provider
 * response body that could contain a credential must pass through here first.
 * It removes (1) the exact values of secrets currently set in the environment
 * and (2) anything matching known key/token shapes (OpenAI/OpenRouter `sk-…`,
 * `Bearer …`, LangSmith `ls…`, and "Incorrect API key provided: …" phrasing).
 */
export declare function sanitizeDiagnosticText(value: string): string;
/**
 * Recognizes an OpenRouter/provider 500 response so a friendlier, actionable
 * message can be shown instead of a raw stack trace.
 */
export declare function isOpenRouterServerError(error: unknown, message: string): boolean;
/**
 * Produces a user-facing error message: a friendly note for provider 500s,
 * otherwise the error's own message with any secrets redacted.
 */
export declare function getErrorMessage(error: unknown): string;
