import type { OpenWikiCommand, OpenWikiRunOptions, RunContext, UpdateMetadata } from "./types.js";
export type OpenWikiContentSnapshot = string;
export type UpdateNoopStatus = {
    shouldSkip: true;
    gitHead: string;
    model: string;
} | {
    shouldSkip: false;
    reason: string;
};
/**
 * Builds the per-run context the prompt uses to reason about prior docs and git changes.
 */
export declare function createRunContext(command: OpenWikiCommand, cwd: string): Promise<RunContext>;
export declare function getUpdateNoopStatus(cwd: string): Promise<UpdateNoopStatus>;
export declare function shouldCheckUpdateNoop(options: OpenWikiRunOptions): boolean;
/**
 * Language the existing wiki was written in, or null when no run has been
 * recorded yet.
 */
export declare function recordedWikiLanguage(lastUpdate: UpdateMetadata | null): string | null;
/**
 * True when the wiki recorded by the previous run is in a different language
 * than the one requested now, so the update must convert existing pages.
 */
export declare function isLanguageMigrationRequired(lastUpdate: UpdateMetadata | null, language: string): boolean;
/**
 * Records a successful init/update run so future updates can diff from this git head.
 */
export declare function writeLastUpdateMetadata(command: OpenWikiCommand, cwd: string, modelId: string, language: string): Promise<void>;
/**
 * Hashes OpenWiki content, excluding run metadata, to detect real documentation changes.
 */
export declare function createOpenWikiContentSnapshot(cwd: string): Promise<OpenWikiContentSnapshot>;
/**
 * Reads prior run metadata if it exists and is structurally valid.
 */
export declare function readLastUpdateMetadata(cwd: string): Promise<UpdateMetadata | null>;
