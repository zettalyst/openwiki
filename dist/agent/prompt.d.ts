import { OpenWikiCommand, OpenWikiOutputMode, RunContext } from "./types.js";
export type PromptOptions = {
    language?: string;
    isLanguageMigration?: boolean;
};
export declare function createSystemPrompt(command: OpenWikiCommand, outputMode?: OpenWikiOutputMode, promptOptions?: PromptOptions): string;
export declare function createModeInstructions(command: OpenWikiCommand, outputMode?: OpenWikiOutputMode, promptOptions?: PromptOptions): string;
export declare function createUserPrompt(command: OpenWikiCommand, context: RunContext, userMessage?: string | null, outputMode?: OpenWikiOutputMode, promptOptions?: PromptOptions): string;
