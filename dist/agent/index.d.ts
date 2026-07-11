import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import { ChatOpenRouter } from "@langchain/openrouter";
import type { OpenWikiCommand, OpenWikiRunOptions, OpenWikiRunResult, UpdateMetadata } from "./types.js";
import { type OpenWikiProvider } from "../constants.js";
export declare function runOpenWikiAgent(command: OpenWikiCommand, cwd?: string, options?: OpenWikiRunOptions): Promise<OpenWikiRunResult>;
export type CheckpointTarget = {
    connString: string;
    persistent: boolean;
};
export declare function resolveCheckpointTarget(command: OpenWikiCommand): CheckpointTarget;
export declare function createOpenWikiThreadId(cwd?: string): string;
type StreamInactivityContext = {
    command: OpenWikiCommand;
    modelId: string;
    provider: OpenWikiProvider;
    timeoutMs: number;
};
export declare function consumeOpenWikiAgentStream(stream: AsyncIterable<unknown>, options: OpenWikiRunOptions, context: StreamInactivityContext): Promise<void>;
export declare function resolveLanguage(options: OpenWikiRunOptions, lastUpdate: UpdateMetadata | null): string;
export declare function createModel(provider: OpenWikiProvider, modelId: string, providerRetryAttempts: number): ChatAnthropic | ChatOpenAI<import("@langchain/openai").ChatOpenAICallOptions> | ChatOpenRouter;
export declare function sanitizeOpenRouterResponseBody(body: string): string;
export {};
