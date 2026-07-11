import { isValidLanguage, isValidModelId, normalizeLanguage, normalizeModelId, } from "./constants.js";
import { isAuthProviderId } from "./auth/providers.js";
import { parseIngestionTarget } from "./ingestion.js";
export function parseCommand(argv) {
    if (argv[0] === "--help" || argv[0] === "-h") {
        return { kind: "help", exitCode: 0 };
    }
    if (argv[0] === "auth") {
        const action = argv[1] === "configure"
            ? "configure"
            : argv[1] === "tools"
                ? "tools"
                : "oauth";
        const provider = action === "configure" || action === "tools"
            ? argv[2]
            : (argv[1] ?? "list");
        const optionArgs = action === "configure" || action === "tools"
            ? argv.slice(3)
            : argv.slice(2);
        const unknownOption = optionArgs.find((arg) => arg !== "--force");
        const force = optionArgs.includes("--force");
        if (unknownOption) {
            return {
                kind: "error",
                exitCode: 1,
                message: `Unknown option for auth: ${unknownOption}`,
            };
        }
        if (provider === "list" && action === "oauth") {
            return {
                kind: "auth",
                action: "list",
                exitCode: 0,
                force: false,
                provider: null,
            };
        }
        if (!provider || !isAuthProviderId(provider)) {
            return {
                kind: "error",
                exitCode: 1,
                message: action === "configure"
                    ? "Usage: openwiki auth configure <provider> [--force]"
                    : action === "tools"
                        ? "Usage: openwiki auth tools <provider>"
                        : `Unknown auth provider: ${provider}`,
            };
        }
        return {
            kind: "auth",
            action,
            exitCode: 0,
            force,
            provider,
        };
    }
    if (argv[0] === "ngrok") {
        if (argv[1] !== "start") {
            return {
                kind: "error",
                exitCode: 1,
                message: "Usage: openwiki ngrok start [url] [--port <port>]",
            };
        }
        let port = 53682;
        let url = null;
        const optionArgs = argv.slice(2);
        for (let index = 0; index < optionArgs.length; index += 1) {
            const arg = optionArgs[index];
            if (arg === "--port") {
                const rawPort = optionArgs[index + 1];
                if (!rawPort) {
                    return {
                        kind: "error",
                        exitCode: 1,
                        message: "--port requires a value.",
                    };
                }
                port = Number(rawPort);
                index += 1;
                continue;
            }
            if (arg.startsWith("--port=")) {
                port = Number(arg.slice("--port=".length));
                continue;
            }
            if (!arg.startsWith("-") && url === null) {
                url = arg;
                continue;
            }
            return {
                kind: "error",
                exitCode: 1,
                message: `Unknown option for ngrok: ${arg}`,
            };
        }
        if (!Number.isInteger(port) || port < 1024 || port > 65535) {
            return {
                kind: "error",
                exitCode: 1,
                message: "--port must be between 1024 and 65535.",
            };
        }
        return {
            kind: "ngrok",
            action: "start",
            exitCode: 0,
            port,
            url,
        };
    }
    if (argv[0] === "ingest") {
        const target = parseIngestionTarget(argv[1] ?? "all");
        if (!target) {
            return {
                kind: "error",
                exitCode: 1,
                message: "Usage: openwiki ingest <source|source-instance|all> [--print] [--modelId <id>]",
            };
        }
        let modelId = null;
        let print = false;
        let scheduledOnly = false;
        const optionArgs = argv.slice(2);
        for (let index = 0; index < optionArgs.length; index += 1) {
            const arg = optionArgs[index];
            if (arg === "--print" || arg === "-p") {
                print = true;
                continue;
            }
            if (arg === "--scheduled") {
                scheduledOnly = true;
                continue;
            }
            if (arg === "--modelId" || arg === "--model-id") {
                const rawModelId = optionArgs[index + 1];
                if (!rawModelId || rawModelId.startsWith("-")) {
                    return {
                        kind: "error",
                        exitCode: 1,
                        message: `${arg} requires a model ID.`,
                    };
                }
                const parsedModelId = normalizeModelId(rawModelId);
                if (!isValidModelId(parsedModelId)) {
                    return {
                        kind: "error",
                        exitCode: 1,
                        message: `Invalid model ID: ${rawModelId}`,
                    };
                }
                modelId = parsedModelId;
                index += 1;
                continue;
            }
            if (arg.startsWith("--modelId=") || arg.startsWith("--model-id=")) {
                const [, rawModelId = ""] = arg.split("=", 2);
                const parsedModelId = normalizeModelId(rawModelId);
                if (!isValidModelId(parsedModelId)) {
                    return {
                        kind: "error",
                        exitCode: 1,
                        message: `Invalid model ID: ${rawModelId}`,
                    };
                }
                modelId = parsedModelId;
                continue;
            }
            return {
                kind: "error",
                exitCode: 1,
                message: `Unknown option for ingest: ${arg}`,
            };
        }
        return {
            kind: "ingest",
            exitCode: 0,
            modelId,
            print,
            scheduledOnly,
            target,
        };
    }
    if (argv[0] === "cron") {
        if (argv[1] === "list" && argv.length === 2) {
            return {
                kind: "cron",
                action: "list",
                exitCode: 0,
                target: null,
            };
        }
        if (argv[1] === "pause" || argv[1] === "resume" || argv[1] === "delete") {
            const target = parseIngestionTarget(argv[2] ?? "");
            if (!target || typeof target !== "string" || argv.length > 3) {
                return {
                    kind: "error",
                    exitCode: 1,
                    message: `Usage: openwiki cron ${argv[1]} <source|all>`,
                };
            }
            return {
                kind: "cron",
                action: argv[1],
                exitCode: 0,
                target,
            };
        }
        {
            return {
                kind: "error",
                exitCode: 1,
                message: "Usage: openwiki cron list | pause <source|all> | resume <source|all> | delete <source|all>",
            };
        }
    }
    if (isOpenWikiRunMode(argv[0])) {
        return parseRunCommand(argv.slice(1), argv[0], "positional");
    }
    return parseRunCommand(argv, "personal", "default");
}
function parseRunCommand(argv, initialMode, initialModeSource) {
    let dryRun = false;
    let language = null;
    let mode = initialMode;
    let modeSource = initialModeSource;
    let modelId = null;
    let print = false;
    let command = "chat";
    const userMessageParts = [];
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--help" || arg === "-h") {
            return { kind: "help", exitCode: 0 };
        }
        if (arg === "--dry-run") {
            if (!isDevelopmentMode()) {
                return {
                    kind: "error",
                    exitCode: 1,
                    message: `Unknown option: ${arg}`,
                };
            }
            dryRun = true;
            continue;
        }
        if (arg === "--print" || arg === "-p") {
            print = true;
            continue;
        }
        if (arg === "--init" || arg === "--update") {
            const nextCommand = arg === "--init" ? "init" : "update";
            if (command !== "chat" && command !== nextCommand) {
                return {
                    kind: "error",
                    exitCode: 1,
                    message: "--init and --update cannot be used together.",
                };
            }
            command = nextCommand;
            continue;
        }
        if (arg === "--mode") {
            const nextArg = argv[index + 1];
            if (!nextArg || nextArg.startsWith("-")) {
                return {
                    kind: "error",
                    exitCode: 1,
                    message: "--mode requires personal or code.",
                };
            }
            if (!isOpenWikiRunMode(nextArg)) {
                return {
                    kind: "error",
                    exitCode: 1,
                    message: `Invalid mode: ${nextArg}. Expected personal or code.`,
                };
            }
            const modeResult = resolveExplicitMode(mode, modeSource, nextArg);
            if (modeResult.kind === "error") {
                return modeResult;
            }
            mode = modeResult.mode;
            modeSource = "option";
            index += 1;
            continue;
        }
        if (arg.startsWith("--mode=")) {
            const [, rawMode = ""] = arg.split("=", 2);
            if (!isOpenWikiRunMode(rawMode)) {
                return {
                    kind: "error",
                    exitCode: 1,
                    message: `Invalid mode: ${rawMode}. Expected personal or code.`,
                };
            }
            const modeResult = resolveExplicitMode(mode, modeSource, rawMode);
            if (modeResult.kind === "error") {
                return modeResult;
            }
            mode = modeResult.mode;
            modeSource = "option";
            continue;
        }
        if (arg === "--modelId" || arg === "--model-id") {
            const nextArg = argv[index + 1];
            if (!nextArg || nextArg.startsWith("-")) {
                return {
                    kind: "error",
                    exitCode: 1,
                    message: `${arg} requires a model ID.`,
                };
            }
            const parsedModelId = normalizeModelId(nextArg);
            if (!isValidModelId(parsedModelId)) {
                return {
                    kind: "error",
                    exitCode: 1,
                    message: `Invalid model ID: ${nextArg}`,
                };
            }
            modelId = parsedModelId;
            index += 1;
            continue;
        }
        if (arg.startsWith("--modelId=") || arg.startsWith("--model-id=")) {
            const [, rawModelId = ""] = arg.split("=", 2);
            const parsedModelId = normalizeModelId(rawModelId);
            if (!isValidModelId(parsedModelId)) {
                return {
                    kind: "error",
                    exitCode: 1,
                    message: `Invalid model ID: ${rawModelId}`,
                };
            }
            modelId = parsedModelId;
            continue;
        }
        if (arg === "--language" || arg === "--lang") {
            const nextArg = argv[index + 1];
            if (!nextArg || nextArg.startsWith("-")) {
                return {
                    kind: "error",
                    exitCode: 1,
                    message: `${arg} requires a language.`,
                };
            }
            if (!isValidLanguage(nextArg)) {
                return {
                    kind: "error",
                    exitCode: 1,
                    message: `Invalid language: ${nextArg}`,
                };
            }
            language = normalizeLanguage(nextArg);
            index += 1;
            continue;
        }
        if (arg.startsWith("--language=") || arg.startsWith("--lang=")) {
            const rawLanguage = arg.slice(arg.indexOf("=") + 1);
            if (!isValidLanguage(rawLanguage)) {
                return {
                    kind: "error",
                    exitCode: 1,
                    message: `Invalid language: ${rawLanguage}`,
                };
            }
            language = normalizeLanguage(rawLanguage);
            continue;
        }
        if (arg.startsWith("-")) {
            return {
                kind: "error",
                exitCode: 1,
                message: `Unknown option: ${arg}`,
            };
        }
        userMessageParts.push(arg);
    }
    const userMessage = userMessageParts.length > 0 ? userMessageParts.join(" ") : null;
    const shouldStart = command !== "chat" || userMessage !== null;
    if (command === "init" && modeSource === "default") {
        return {
            kind: "error",
            exitCode: 1,
            message: "openwiki --init requires a mode.\n\nRun one of:\n  openwiki personal --init  Build your local personal brain wiki in ~/.openwiki/wiki.\n  openwiki code --init   Build repository documentation in ./openwiki.",
        };
    }
    if (print && !shouldStart) {
        return {
            kind: "error",
            exitCode: 1,
            message: "-p, --print requires a message, --init, or --update.",
        };
    }
    return {
        kind: "run",
        exitCode: 0,
        command,
        dryRun,
        language,
        mode,
        modeSource,
        modelId,
        print,
        shouldStart,
        userMessage,
    };
}
function resolveExplicitMode(currentMode, modeSource, nextMode) {
    if (currentMode === nextMode || modeSource === "default") {
        return { kind: "ok", mode: nextMode };
    }
    return {
        kind: "error",
        exitCode: 1,
        message: `Conflicting modes: ${currentMode} and ${nextMode}.`,
    };
}
function isOpenWikiRunMode(value) {
    return value === "personal" || value === "code";
}
/**
 * True when a run must bypass the Ink UI and use the non-interactive path:
 * either the user asked for print mode, or stdin is not a TTY (CI, cron,
 * pipes), where Ink's raw-mode input is unavailable and rendering the UI
 * fails. Interactive chat without a message still requires a TTY, so it is
 * excluded.
 */
export function shouldRunNonInteractively(command, stdinIsTTY) {
    return (command.kind === "run" &&
        !command.dryRun &&
        (command.print || (!stdinIsTTY && command.shouldStart)));
}
export function isDevelopmentMode() {
    return (process.env.NODE_ENV === "development" || process.env.OPENWIKI_DEV === "1");
}
export const helpContent = {
    title: "OpenWiki",
    description: "Run an agent that generates and maintains a project or local knowledge wiki.",
    usage: [
        "openwiki code [--init|--update] [message]",
        "openwiki personal [--init|--update] [message]",
        "openwiki --mode <personal|code> [--init|--update] [message]",
        "openwiki [--modelId <model>]",
        "openwiki [--modelId <model>] [message]",
        "openwiki --update [message]",
        "openwiki auth <provider>",
        "openwiki auth configure <provider> [--force]",
        "openwiki auth tools <provider>",
        "openwiki ingest <source|source-instance|all>",
        "openwiki cron list",
        "openwiki cron pause <source|all>",
        "openwiki cron resume <source|all>",
        "openwiki cron delete <source|all>",
        "openwiki ngrok start [url] [--port <port>]",
    ],
    commands: [
        {
            label: "openwiki code",
            description: "Run OpenWiki for the current repository, writing docs under repo openwiki/ and using GitHub Actions for recurrence.",
        },
        {
            label: "openwiki personal",
            description: "Run OpenWiki as your local personal brain over configured sources, writing to ~/.openwiki/wiki.",
        },
        {
            label: "openwiki",
            description: "Open the interactive OpenWiki personal brain chat.",
        },
        {
            label: "openwiki auth <provider>",
            description: "Authenticate, create connector config, and discover MCP tools when available.",
        },
        {
            label: "openwiki auth configure <provider>",
            description: "Create local connector config that references saved auth env vars.",
        },
        {
            label: "openwiki auth tools <provider>",
            description: "List available MCP tools for a configured auth provider.",
        },
        {
            label: "openwiki ingest <source|source-instance|all>",
            description: "Run ingestion and wiki update runs for one connector, one source instance, or all configured sources.",
        },
        {
            label: "openwiki cron list",
            description: "List saved connector schedules and local launchd status.",
        },
        {
            label: "openwiki cron pause <source|all>",
            description: "Pause saved connector schedules and reconcile the Mac wake window.",
        },
        {
            label: "openwiki cron resume <source|all>",
            description: "Resume paused connector schedules and reconcile the Mac wake window.",
        },
        {
            label: "openwiki cron delete <source|all>",
            description: "Delete saved connector schedules and remove stale local schedule files.",
        },
        {
            label: "openwiki ngrok start [url]",
            description: "Start an ngrok tunnel for Slack OAuth, optionally using a fixed HTTPS URL.",
        },
    ],
    options: [
        {
            label: "--init",
            description: "Generate initial OpenWiki documentation for a selected mode. Use openwiki personal --init or openwiki code --init.",
        },
        {
            label: "--update",
            description: "Update existing OpenWiki documentation and ingest configured connectors when relevant.",
        },
        {
            label: "--mode <personal|code>",
            description: "Choose the personal brain (local, over configured sources) or the code brain (repository docs).",
        },
        {
            label: "-p, --print",
            description: "Run once and print the final assistant output.",
        },
        {
            label: "--modelId <id>",
            description: "Use a model ID for this run.",
        },
        {
            label: "--language <lang>",
            description: "Write wiki documentation in this language (default: ko / Korean).",
        },
    ],
    developmentOptions: [
        {
            label: "--dry-run",
            description: "Show what would run without invoking the agent.",
        },
    ],
    examples: [
        "openwiki",
        "openwiki personal --init",
        "openwiki code --init",
        "openwiki --update",
        "openwiki --update --mode personal",
        'openwiki "What can you do?"',
        'openwiki -p "Summarize what OpenWiki can do"',
        "openwiki --modelId gpt-5.5",
        "openwiki --init --language en",
        'openwiki --update --modelId gpt-5.5 "Please document the API routes first"',
        'openwiki --update "Refresh the wiki from configured connectors"',
        "openwiki ingest all",
        "openwiki ingest web-search",
        "openwiki ingest web-search-2",
        "openwiki cron list",
        "openwiki cron pause web-search",
        "openwiki cron resume web-search",
        "openwiki cron delete web-search",
        "openwiki auth slack",
        "openwiki auth gmail",
        "openwiki auth notion",
        "openwiki auth tools notion",
        "openwiki ngrok start",
        "openwiki ngrok start https://openwiki.ngrok.app",
    ],
    developmentExamples: ["openwiki --dry-run"],
};
export function getHelpText() {
    const helpSections = [
        helpContent.title,
        `  ${helpContent.description}`,
        "",
        "Usage",
        ...helpContent.usage.map((line) => `  ${line}`),
        "",
        "Commands",
        ...formatRows(helpContent.commands),
        "",
        "Options",
        ...formatRows(helpContent.options),
        "",
    ];
    if (isDevelopmentMode()) {
        helpSections.push("Development Options", ...formatRows(helpContent.developmentOptions), "");
    }
    helpSections.push("Examples", ...helpContent.examples.map((line) => `  ${line}`));
    if (isDevelopmentMode()) {
        helpSections.push(...helpContent.developmentExamples.map((line) => `  ${line}`));
    }
    return helpSections.join("\n");
}
function formatRows(rows) {
    const labelWidth = Math.max(...rows.map((row) => row.label.length));
    return rows.map((row) => `  ${row.label.padEnd(labelWidth)}  ${row.description}`);
}
