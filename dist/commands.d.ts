import type { OpenWikiCommand } from "./agent/types.js";
import type { AuthProviderId } from "./auth/types.js";
import { type IngestionTarget } from "./ingestion.js";
export type HelpRow = {
    label: string;
    description: string;
};
export type OpenWikiRunMode = "personal" | "code";
type CronTarget = Extract<IngestionTarget, string>;
export type HelpContent = {
    title: string;
    description: string;
    usage: string[];
    commands: HelpRow[];
    options: HelpRow[];
    developmentOptions: HelpRow[];
    examples: string[];
    developmentExamples: string[];
};
export type CliCommand = {
    kind: "auth";
    action: "configure" | "list" | "oauth" | "tools";
    exitCode: 0;
    force: boolean;
    provider: AuthProviderId | null;
} | {
    kind: "ngrok";
    action: "start";
    exitCode: 0;
    port: number;
    url: string | null;
} | {
    kind: "ingest";
    exitCode: 0;
    modelId: string | null;
    print: boolean;
    scheduledOnly: boolean;
    target: IngestionTarget;
} | {
    kind: "cron";
    action: "delete" | "list" | "pause" | "resume";
    exitCode: 0;
    target: CronTarget | null;
} | {
    kind: "help";
    exitCode: 0;
} | {
    kind: "run";
    exitCode: 0;
    command: OpenWikiCommand;
    dryRun: boolean;
    language: string | null;
    mode: OpenWikiRunMode;
    modeSource: OpenWikiRunModeSource;
    modelId: string | null;
    print: boolean;
    shouldStart: boolean;
    userMessage: string | null;
} | {
    kind: "error";
    exitCode: 1;
    message: string;
};
export type OpenWikiRunModeSource = "default" | "option" | "positional";
export declare function parseCommand(argv: string[]): CliCommand;
/**
 * True when a run must bypass the Ink UI and use the non-interactive path:
 * either the user asked for print mode, or stdin is not a TTY (CI, cron,
 * pipes), where Ink's raw-mode input is unavailable and rendering the UI
 * fails. Interactive chat without a message still requires a TTY, so it is
 * excluded.
 */
export declare function shouldRunNonInteractively(command: CliCommand, stdinIsTTY: boolean): command is Extract<CliCommand, {
    kind: "run";
}>;
export declare function isDevelopmentMode(): boolean;
export declare const helpContent: HelpContent;
export declare function getHelpText(): string;
export {};
