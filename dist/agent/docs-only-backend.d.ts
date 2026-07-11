import { LocalShellBackend, type EditResult, type LocalShellBackendOptions, type WriteResult } from "deepagents";
import type { OpenWikiOutputMode } from "./types.js";
type OpenWikiBackendOptions = LocalShellBackendOptions & {
    docsOnly?: boolean;
    outputMode?: OpenWikiOutputMode;
};
export declare class OpenWikiLocalShellBackend extends LocalShellBackend {
    private readonly docsOnly;
    private readonly outputMode;
    constructor(options: OpenWikiBackendOptions);
    write(filePath: string, content: string): Promise<WriteResult>;
    edit(filePath: string, oldString: string, newString: string, replaceAll?: boolean): Promise<EditResult>;
    private getDocsOnlyWriteError;
}
export declare function isOpenWikiDocsPath(filePath: string): boolean;
export {};
