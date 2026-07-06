import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import { ChatOpenRouter } from "@langchain/openrouter";
import type { OpenWikiCommand, OpenWikiRunOptions, OpenWikiRunResult } from "./types.js";
import { type OpenWikiProvider } from "../constants.js";
export declare function runOpenWikiAgent(command: OpenWikiCommand, cwd?: string, options?: OpenWikiRunOptions): Promise<OpenWikiRunResult>;
export declare function createOpenWikiThreadId(cwd?: string): string;
export declare function createModel(provider: OpenWikiProvider, modelId: string): Promise<ChatAnthropic | ChatOpenRouter | ChatOpenAI<import("@langchain/openai").ChatOpenAICallOptions>>;
