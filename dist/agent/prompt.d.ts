import { OpenWikiCommand, RunContext } from "./types.js";
export declare function createSystemPrompt(command: OpenWikiCommand): string;
export declare function createModeInstructions(command: OpenWikiCommand): string;
export declare function createUserPrompt(command: OpenWikiCommand, context: RunContext, userMessage?: string | null): string;
