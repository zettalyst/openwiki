import type { OpenWikiCommand } from "./agent/types.js";
export type HelpRow = {
    label: string;
    description: string;
};
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
    kind: "help";
    exitCode: 0;
} | {
    kind: "run";
    exitCode: 0;
    command: OpenWikiCommand;
    dryRun: boolean;
    modelId: string | null;
    print: boolean;
    shouldStart: boolean;
    userMessage: string | null;
} | {
    kind: "error";
    exitCode: 1;
    message: string;
};
export declare function parseCommand(argv: string[]): CliCommand;
export declare function isDevelopmentMode(): boolean;
export declare const helpContent: HelpContent;
export declare function getHelpText(): string;
