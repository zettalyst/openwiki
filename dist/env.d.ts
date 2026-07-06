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
export declare function loadOpenWikiEnv(): Promise<EnvMap>;
export declare function getCredentialDiagnostics(): Promise<CredentialDiagnostic[]>;
export declare function saveOpenWikiEnv(updates: EnvMap): Promise<void>;
export {};
