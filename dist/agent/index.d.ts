import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import { ChatOpenRouter } from "@langchain/openrouter";
import type { OpenWikiCommand, OpenWikiRunOptions, OpenWikiRunResult, UpdateMetadata } from "./types.js";
import { type OpenWikiProvider } from "../constants.js";
export declare function runOpenWikiAgent(command: OpenWikiCommand, cwd?: string, options?: OpenWikiRunOptions): Promise<OpenWikiRunResult>;
export declare function createOpenWikiThreadId(cwd?: string): string;
type StreamInactivityContext = {
    command: OpenWikiCommand;
    modelId: string;
    provider: OpenWikiProvider;
    timeoutMs: number;
};
export declare function consumeOpenWikiAgentStream(stream: AsyncIterable<unknown>, options: OpenWikiRunOptions, context: StreamInactivityContext): Promise<void>;
export declare function resolveLanguage(options: OpenWikiRunOptions, lastUpdate: UpdateMetadata | null): string;
export declare function createModel(provider: OpenWikiProvider, modelId: string): Promise<ChatAnthropic | ChatOpenRouter | ChatOpenAI<import("@langchain/openai").ChatOpenAICallOptions>>;
export {};
