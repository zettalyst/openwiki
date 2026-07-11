import type { AuthProviderId, OAuthRunResult } from "./types.js";
export type OAuthAuthOptions = {
    onAuthorizationUrl?: (event: {
        copiedToClipboard: boolean;
        openedBrowser: boolean;
        provider: AuthProviderId;
        url: string;
    }) => void;
    silent?: boolean;
};
export declare function runOAuthAuth(providerId: AuthProviderId, options?: OAuthAuthOptions): Promise<OAuthRunResult>;
export declare function formatAuthProviderList(): string;
