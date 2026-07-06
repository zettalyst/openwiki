import { OpenWikiCommand, RunContext } from "./types.js";
export type PromptOptions = {
    language?: string;
    isLanguageMigration?: boolean;
};
export declare function createSystemPrompt(command: OpenWikiCommand, promptOptions?: PromptOptions): string;
export declare function createModeInstructions(command: OpenWikiCommand, promptOptions?: PromptOptions): string;
export declare function createUserPrompt(command: OpenWikiCommand, context: RunContext, userMessage?: string | null, promptOptions?: PromptOptions): string;
