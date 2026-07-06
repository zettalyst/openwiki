import React from "react";
import { type OpenWikiProvider } from "./constants.js";
export type InitSetupResult = {
    modelId: string | null;
    provider: OpenWikiProvider | null;
    savedApiKey: boolean;
    savedBaseUrl: boolean;
    savedLangSmithKey: boolean;
    savedModelId: boolean;
    savedProvider: boolean;
};
type InitSetupProps = {
    modelIdOverride?: string | null;
    onComplete: (result: InitSetupResult) => void;
    onError: (message: string) => void;
};
export declare function needsCredentialSetup(modelIdOverride?: string | null): boolean;
export declare function InitSetup({ modelIdOverride, onComplete, onError, }: InitSetupProps): React.JSX.Element;
export {};
