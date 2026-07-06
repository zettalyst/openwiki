#!/usr/bin/env node
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { Box, render, Text, useApp, useInput } from "ink";
import { marked } from "marked";
import { helpContent, isDevelopmentMode, parseCommand, } from "./commands.js";
import { InitSetup, needsCredentialSetup, } from "./credentials.js";
import { getCredentialDiagnostics, loadOpenWikiEnv, saveOpenWikiEnv, } from "./env.js";
import { createOpenWikiThreadId, runOpenWikiAgent } from "./agent/index.js";
import { ANTHROPIC_API_KEY_ENV_KEY, ANTHROPIC_AUTH_TOKEN_ENV_KEY, BASETEN_API_KEY_ENV_KEY, CLAUDE_CODE_OAUTH_TOKEN_ENV_KEY, createProviderCredentialConfigurationError, createProviderCredentialRequiredMessage, FIREWORKS_API_KEY_ENV_KEY, getDefaultModelId, getProviderCredentialRequirement, getProviderLabel, getProviderModelOptions, isValidModelId, normalizeModelId, normalizeProvider, OPENAI_API_KEY_ENV_KEY, OPENWIKI_PROVIDER_ENV_KEY, OPENWIKI_MODEL_ID_ENV_KEY, OPENROUTER_API_KEY_ENV_KEY, OPEN_WIKI_DIR, resolveConfiguredProvider, resolveProviderCredential, SELECTABLE_OPENWIKI_PROVIDERS, OPENWIKI_VERSION, } from "./constants.js";
const OPENWIKI_LOGO_LINES = [
    "  ___                  __        ___ _    _ ",
    " / _ \\ _ __   ___ _ __ \\ \\      / (_) | _(_)",
    "| | | | '_ \\ / _ \\ '_ \\ \\ \\ /\\ / /| | |/ / |",
    "| |_| | |_) |  __/ | | | \\ V  V / | |   <| |",
    " \\___/| .__/ \\___|_| |_|  \\_/\\_/  |_|_|\\_\\_|",
    "      |_|",
];
const OPENWIKI_LOGO_WIDTH = Math.max(...OPENWIKI_LOGO_LINES.map((line) => line.length));
function App({ command }) {
    const app = useApp();
    const startupModelId = command.kind === "run" ? command.modelId : null;
    const startupProvider = resolveConfiguredProvider();
    const autoExitOnSuccess = shouldAutoExitStartupRun(command);
    const [sessionProvider, setSessionProvider] = useState(startupProvider);
    const [sessionModelId, setSessionModelId] = useState(startupModelId);
    const activeRunId = useRef(0);
    const sessionThreadId = useRef(createOpenWikiThreadId(process.cwd()));
    const mountedRef = useRef(false);
    const nextLogId = useRef(1);
    const nextCompletedRunId = useRef(1);
    const activeRunCredentialDiagnostics = useRef(undefined);
    const activeRunLog = useRef([]);
    const [runState, setRunState] = useState({ status: "idle" });
    const [completedRuns, setCompletedRuns] = useState([]);
    const [activeUserMessage, setActiveUserMessage] = useState(command.kind === "run" ? command.userMessage : null);
    const [activeMessageIsFollowup, setActiveMessageIsFollowup] = useState(command.kind === "run" && command.command === "chat");
    const [resolvedCommand, setResolvedCommand] = useState(command.kind === "run" && command.shouldStart ? command.command : null);
    const shouldRunInteractiveCredentialSetup = command.kind === "run" &&
        resolvedCommand !== null &&
        !command.dryRun &&
        process.stdin.isTTY &&
        runState.status === "idle" &&
        needsCredentialSetup(sessionModelId);
    const displayModelId = sessionModelId ?? startupModelId;
    function submitChatMessage(message) {
        if (isExitMessage(message)) {
            process.exitCode = 0;
            app.exit();
            return;
        }
        setActiveUserMessage(message);
        setActiveMessageIsFollowup(true);
        setResolvedCommand("chat");
        setRunState({ status: "idle" });
    }
    function submitCommandRun(nextCommand, message) {
        setActiveUserMessage(message);
        setActiveMessageIsFollowup(false);
        setResolvedCommand(nextCommand);
        setRunState({ status: "idle" });
    }
    function clearSession() {
        activeRunId.current += 1;
        sessionThreadId.current = createOpenWikiThreadId(process.cwd());
        activeRunCredentialDiagnostics.current = undefined;
        activeRunLog.current = [];
        nextLogId.current = 1;
        nextCompletedRunId.current = 1;
        setCompletedRuns([]);
        setActiveUserMessage(null);
        setActiveMessageIsFollowup(false);
        setResolvedCommand(null);
        setRunState({ status: "idle" });
    }
    async function selectModel(modelId) {
        const updates = {
            [OPENWIKI_MODEL_ID_ENV_KEY]: modelId,
        };
        // Pin the provider alongside the model. A model ID saved against an
        // auto-detected provider would silently break once another provider's
        // credentials appear and change the detection result.
        if (process.env[OPENWIKI_PROVIDER_ENV_KEY] === undefined) {
            updates[OPENWIKI_PROVIDER_ENV_KEY] = sessionProvider;
        }
        await saveOpenWikiEnv(updates);
        setSessionModelId(modelId);
    }
    async function selectProvider(provider) {
        const modelId = getDefaultModelId(provider);
        await saveOpenWikiEnv({
            [OPENWIKI_PROVIDER_ENV_KEY]: provider,
            [OPENWIKI_MODEL_ID_ENV_KEY]: modelId,
        });
        setSessionProvider(provider);
        setSessionModelId(modelId);
    }
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);
    useEffect(() => {
        if (command.kind === "help" || command.kind === "error") {
            process.exitCode = command.exitCode;
            app.exit();
            return;
        }
        if (command.dryRun) {
            process.exitCode = 0;
            app.exit();
            return;
        }
        if (command.kind !== "run") {
            return;
        }
        if (resolvedCommand === null) {
            return;
        }
        const providerCredentialError = createProviderCredentialConfigurationError(sessionProvider);
        if (providerCredentialError !== null) {
            setRunState({
                status: "error",
                message: providerCredentialError,
            });
            return;
        }
        const providerCredential = resolveProviderCredential(sessionProvider);
        if (providerCredential === null && !process.stdin.isTTY) {
            setRunState({
                status: "error",
                message: createProviderCredentialRequiredMessage(sessionProvider, "interactive"),
            });
            return;
        }
        if (shouldRunInteractiveCredentialSetup) {
            return;
        }
        if (runState.status !== "idle" && runState.status !== "init-setup-saved") {
            return;
        }
        const runId = activeRunId.current + 1;
        const runMessage = activeUserMessage;
        activeRunId.current = runId;
        activeRunCredentialDiagnostics.current = undefined;
        activeRunLog.current = [];
        setRunState({
            status: "running",
            command: resolvedCommand,
            log: [],
        });
        if (shouldShowCredentialDiagnostics()) {
            void getCredentialDiagnostics()
                .catch(() => undefined)
                .then((credentialDiagnostics) => {
                if (!mountedRef.current ||
                    activeRunId.current !== runId ||
                    !credentialDiagnostics) {
                    return;
                }
                setRunState((currentState) => updateRunningCredentialDiagnostics(currentState, credentialDiagnostics, activeRunCredentialDiagnostics));
            });
        }
        runOpenWikiAgent(resolvedCommand, process.cwd(), {
            debug: isDebugMode(),
            isFollowup: activeMessageIsFollowup,
            modelId: sessionModelId,
            threadId: sessionThreadId.current,
            userMessage: activeUserMessage,
            onEvent: (event) => {
                if (!mountedRef.current || activeRunId.current !== runId) {
                    return;
                }
                activeRunLog.current = appendRunLogEvent(activeRunLog.current, event, nextLogId);
                setRunState((currentState) => currentState.status === "running"
                    ? {
                        ...currentState,
                        log: activeRunLog.current,
                    }
                    : currentState);
            },
        })
            .then((result) => {
            if (!mountedRef.current || activeRunId.current !== runId) {
                return;
            }
            setRunState({
                status: "success",
                result,
                log: activeRunLog.current,
                credentialDiagnostics: activeRunCredentialDiagnostics.current,
            });
            setCompletedRuns((runs) => [
                ...runs,
                {
                    id: nextCompletedRunId.current,
                    command: result.command,
                    credentialDiagnostics: activeRunCredentialDiagnostics.current,
                    log: activeRunLog.current,
                    message: runMessage,
                    result,
                },
            ]);
            nextCompletedRunId.current += 1;
        })
            .catch((error) => {
            if (!mountedRef.current || activeRunId.current !== runId) {
                return;
            }
            const errorDiagnostics = getErrorDiagnostics(error);
            const message = getErrorMessage(error);
            void getCredentialDiagnostics()
                .catch(() => undefined)
                .then((credentialDiagnostics) => {
                if (!mountedRef.current || activeRunId.current !== runId) {
                    return;
                }
                setRunState({
                    status: "error",
                    message,
                    credentialDiagnostics,
                    errorDiagnostics,
                });
            });
        });
    }, [
        app,
        command,
        activeMessageIsFollowup,
        activeUserMessage,
        resolvedCommand,
        runState.status,
        sessionModelId,
        sessionProvider,
        shouldRunInteractiveCredentialSetup,
    ]);
    useEffect(() => {
        if (runState.status === "error") {
            process.exitCode = 1;
            app.exit();
            return;
        }
        if (runState.status === "success" && autoExitOnSuccess) {
            process.exitCode = 0;
            app.exit();
        }
    }, [app, autoExitOnSuccess, runState.status]);
    if (command.kind === "help") {
        return _jsx(HelpView, {});
    }
    if (command.kind === "error") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Header, { modelId: null, subtitle: "Command failed" }), _jsx(StatusLine, { tone: "error", label: "Error", value: command.message }), _jsx(HelpView, {})] }));
    }
    if (command.kind === "run" && command.dryRun) {
        return (_jsx(DryRunView, { command: command.command, modelId: command.modelId, shouldStart: command.shouldStart, userMessage: command.userMessage }));
    }
    if (shouldRunInteractiveCredentialSetup) {
        return (_jsx(InitSetup, { modelIdOverride: command.modelId, onComplete: (result) => {
                if (result.modelId) {
                    setSessionModelId(result.modelId);
                }
                if (result.provider) {
                    setSessionProvider(result.provider);
                }
                setRunState({ status: "init-setup-saved", result });
            }, onError: (message) => {
                setRunState({ status: "error", message });
            } }));
    }
    if (runState.status === "init-setup-saved") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Header, { modelId: runState.result.modelId ?? displayModelId, subtitle: "Credential setup" }), runState.result.savedApiKey ||
                    runState.result.savedProvider ||
                    runState.result.savedBaseUrl ||
                    runState.result.savedModelId ||
                    runState.result.savedLangSmithKey ? (_jsx(StatusLine, { tone: "success", label: "Credentials", value: "saved" })) : null, runState.result.provider ? (_jsx(StatusLine, { tone: "muted", label: "Provider", value: getProviderLabel(runState.result.provider) })) : null, runState.result.modelId ? (_jsx(StatusLine, { tone: "muted", label: "Model", value: runState.result.modelId })) : null, _jsx(StatusLine, { tone: "active", label: "Next", value: "starting openwiki" })] }));
    }
    if (runState.status === "running") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(ChatHistory, { runs: completedRuns }), _jsx(RunView, { command: runState.command, credentialDiagnostics: runState.credentialDiagnostics, log: runState.log, message: activeUserMessage, modelId: displayModelId })] }));
    }
    if (runState.status === "success") {
        if (autoExitOnSuccess) {
            return (_jsx(RunView, { command: runState.result.command, credentialDiagnostics: runState.credentialDiagnostics, done: true, log: runState.log, message: activeUserMessage, modelId: runState.result.model }));
        }
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Header, { modelId: runState.result.model, subtitle: "Ready for follow-up" }), _jsx(ChatHistory, { runs: completedRuns }), _jsx(ChatInput, { currentModelId: getDisplayModelId(displayModelId), currentProvider: sessionProvider, onClear: clearSession, onCommandRun: submitCommandRun, onModelSelect: selectModel, onProviderSelect: selectProvider, onSubmit: submitChatMessage })] }));
    }
    if (runState.status === "idle" && completedRuns.length > 0) {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Header, { modelId: displayModelId, subtitle: "Starting follow-up" }), _jsx(ChatHistory, { runs: completedRuns }), activeUserMessage ? _jsx(PromptBlock, { message: activeUserMessage }) : null, _jsx(StatusLine, { tone: "active", label: "Next", value: "starting openwiki" })] }));
    }
    if (runState.status === "error") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Header, { modelId: displayModelId, subtitle: "Run failed" }), _jsx(StatusLine, { tone: "error", label: "Error", value: runState.message }), runState.credentialDiagnostics ? (_jsx(CredentialDiagnosticsPanel, { diagnostics: runState.credentialDiagnostics })) : null, runState.errorDiagnostics && runState.errorDiagnostics.length > 0 ? (_jsx(ErrorDiagnosticsPanel, { diagnostics: runState.errorDiagnostics })) : null] }));
    }
    return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Header, { modelId: displayModelId, subtitle: "Ready for chat" }), _jsx(ChatInput, { currentModelId: getDisplayModelId(displayModelId), currentProvider: sessionProvider, onClear: clearSession, onCommandRun: submitCommandRun, onModelSelect: selectModel, onProviderSelect: selectProvider, onSubmit: submitChatMessage })] }));
}
function HelpView() {
    return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Header, { modelId: null, subtitle: helpContent.description }), _jsx(Panel, { title: "Usage", children: helpContent.usage.map((line) => (_jsxs(Text, { children: [" ", line] }, line))) }), _jsx(Panel, { title: "Commands", children: _jsx(Rows, { rows: helpContent.commands }) }), _jsx(Panel, { title: "Options", children: _jsx(Rows, { rows: helpContent.options }) }), isDevelopmentMode() ? (_jsx(Panel, { title: "Development Options", children: _jsx(Rows, { rows: helpContent.developmentOptions }) })) : null, _jsxs(Panel, { title: "Examples", children: [helpContent.examples.map((line) => (_jsxs(Text, { children: [" ", line] }, line))), isDevelopmentMode()
                        ? helpContent.developmentExamples.map((line) => (_jsxs(Text, { children: [" ", line] }, line)))
                        : null] })] }));
}
function DryRunView({ command, modelId, shouldStart, userMessage, }) {
    return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Header, { modelId: modelId, subtitle: "Development dry run" }), _jsxs(Panel, { title: "Execution Plan", children: [_jsx(StatusLine, { tone: "active", label: "Command", value: `openwiki ${command}` }), _jsx(StatusLine, { tone: "muted", label: "Mode", value: command }), _jsx(StatusLine, { tone: "muted", label: "Credentials", value: "not read or requested" }), _jsx(StatusLine, { tone: "muted", label: "Model", value: modelId ??
                            `saved setting or ${getDefaultModelId(resolveConfiguredProvider())}` }), _jsx(StatusLine, { tone: "muted", label: "Agent", value: "not invoked" }), _jsx(StatusLine, { tone: "muted", label: "Writes", value: "no files or metadata" }), _jsx(StatusLine, { tone: "muted", label: "Output", value: `${OPEN_WIKI_DIR}/` }), _jsx(StatusLine, { tone: "muted", label: "Startup", value: shouldStart ? "would start run" : "would open chat" }), userMessage ? (_jsx(StatusLine, { tone: "muted", label: "Message", value: userMessage })) : null] })] }));
}
function CredentialDiagnosticsPanel({ diagnostics, }) {
    return (_jsxs(Panel, { title: "Credential Diagnostics", children: [_jsx(Text, { color: "gray", children: "Raw secret values are intentionally not printed." }), diagnostics.map((diagnostic) => (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsxs(Text, { children: [_jsx(Text, { bold: true, children: diagnostic.key }), " ", _jsxs(Text, { color: "gray", children: ["source=", diagnostic.source] })] }), _jsxs(Text, { children: ["length=", diagnostic.length ?? "unset", " preview=", diagnostic.preview] }), _jsxs(Text, { color: diagnostic.warnings.length > 0 ? "yellow" : "gray", children: ["warnings=", diagnostic.warnings.length > 0
                                ? diagnostic.warnings.join(", ")
                                : "none"] })] }, diagnostic.key)))] }));
}
function ErrorDiagnosticsPanel({ diagnostics, }) {
    return (_jsxs(Panel, { title: "Error Diagnostics", children: [_jsx(Text, { color: "gray", children: "Only allowlisted, non-secret error fields are shown." }), diagnostics.map((diagnostic) => (_jsxs(Text, { children: [_jsx(Text, { bold: true, children: diagnostic.label }), " ", diagnostic.value] }, diagnostic.label)))] }));
}
function Header({ compact = false, modelId, showLogo = true, subtitle, }) {
    const terminalColumns = process.stdout.columns ?? 80;
    const displayModelId = sanitizeHeaderValue(modelId ??
        process.env[OPENWIKI_MODEL_ID_ENV_KEY] ??
        getDefaultModelId(resolveConfiguredProvider()), Math.max(8, terminalColumns - 12));
    const displayProvider = getProviderLabel(resolveConfiguredProvider());
    const displayDirectory = sanitizeHeaderValue(formatCwd(process.cwd()), Math.max(8, terminalColumns - 17));
    const shouldShowLogo = showLogo && terminalColumns > OPENWIKI_LOGO_WIDTH;
    const tracingEnabled = process.env.LANGCHAIN_TRACING_V2 === "true" &&
        Boolean(process.env.LANGSMITH_API_KEY);
    if (compact) {
        return (_jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [_jsxs(Text, { wrap: "truncate", children: [_jsx(Text, { color: "cyan", children: ">_ " }), _jsx(Text, { bold: true, children: "OpenWiki" }), " ", _jsxs(Text, { color: "gray", children: ["v", OPENWIKI_VERSION] }), " ", _jsx(Text, { color: "gray", children: "provider: " }), _jsx(Text, { color: "white", children: displayProvider }), " ", _jsx(Text, { color: "gray", children: "model: " }), _jsx(Text, { color: "white", children: displayModelId })] }), _jsxs(Text, { children: [_jsx(Text, { color: tracingEnabled ? "green" : "gray", children: tracingEnabled ? "* " : "- " }), _jsxs(Text, { color: tracingEnabled ? "green" : "gray", children: ["LangSmith tracing ", tracingEnabled ? "enabled" : "disabled"] }), _jsx(Text, { color: "gray", children: " - " }), _jsx(Text, { color: "cyan", children: subtitle })] })] }));
    }
    return (_jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [shouldShowLogo ? (_jsx(Box, { flexDirection: "column", marginBottom: 1, children: OPENWIKI_LOGO_LINES.map((line) => (_jsx(Text, { bold: true, color: "cyan", wrap: "truncate", children: line }, line))) })) : null, _jsxs(Box, { borderColor: "cyan", borderStyle: "round", flexDirection: "column", marginBottom: 1, paddingX: 1, children: [_jsxs(Text, { children: [_jsx(Text, { color: "cyan", children: ">_ " }), _jsx(Text, { bold: true, children: "OpenWiki" }), " ", _jsxs(Text, { color: "gray", children: ["v", OPENWIKI_VERSION] }), " ", _jsx(Text, { color: "gray", children: "agent docs for codebases" })] }), _jsxs(Text, { children: [_jsx(Text, { color: "gray", children: "provider: " }), _jsx(Text, { color: "white", children: displayProvider })] }), _jsxs(Text, { children: [_jsx(Text, { color: "gray", children: "model: " }), _jsx(Text, { color: "white", children: displayModelId })] }), _jsxs(Text, { children: [_jsx(Text, { color: "gray", children: "directory: " }), _jsx(Text, { color: "white", children: displayDirectory })] })] }), _jsxs(Text, { children: [_jsx(Text, { color: tracingEnabled ? "green" : "gray", children: tracingEnabled ? "* " : "- " }), _jsxs(Text, { color: tracingEnabled ? "green" : "gray", children: ["LangSmith tracing ", tracingEnabled ? "enabled" : "disabled"] }), _jsx(Text, { color: "gray", children: " - " }), _jsx(Text, { color: "cyan", children: subtitle })] }), _jsx(Text, { color: "gray", children: "Tip: ask for a docs change, or use /exit when you are done." })] }));
}
function StatusLine({ tone, label, value }) {
    const color = tone === "success"
        ? "green"
        : tone === "error"
            ? "red"
            : tone === "active"
                ? "yellow"
                : "gray";
    return (_jsxs(Text, { children: [_jsx(Text, { color: color, children: "* " }), _jsx(Text, { bold: true, color: color, children: label }), " ", _jsx(Text, { color: tone === "muted" ? "gray" : undefined, children: value })] }));
}
function RunView({ command, credentialDiagnostics, log, done = false, message = null, modelId = null, }) {
    const [animationFrame, setAnimationFrame] = useState(0);
    const activeRunningToolId = getActiveRunningToolLogId(log);
    const hasRunningTool = activeRunningToolId !== null;
    useEffect(() => {
        if (done || !hasRunningTool) {
            return;
        }
        const interval = setInterval(() => {
            setAnimationFrame((frame) => frame + 1);
        }, 140);
        return () => {
            clearInterval(interval);
        };
    }, [done, hasRunningTool]);
    return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Header, { compact: true, modelId: modelId, showLogo: false, subtitle: done ? "Run complete" : "Agent running" }), message ? _jsx(PromptBlock, { message: message }) : null, _jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [_jsxs(Text, { children: [_jsx(Text, { color: done ? "green" : "cyan", children: "* " }), _jsx(Text, { bold: true, children: done ? "Complete" : "Working" }), " ", _jsxs(Text, { color: "gray", children: ["openwiki ", command] }), !done ? _jsx(Text, { color: "gray", children: " - streaming" }) : null] }), _jsx(Box, { flexDirection: "column", marginLeft: 2, marginTop: 1, children: log.length > 0 ? (log.map((item) => (_jsx(RunLogLine, { activeRunningToolId: activeRunningToolId, animationFrame: animationFrame, item: item }, item.id)))) : (_jsx(Text, { color: "gray", children: "Waiting for model output..." })) })] }), credentialDiagnostics ? (_jsx(CredentialDiagnosticsPanel, { diagnostics: credentialDiagnostics })) : null] }));
}
function RunLogLine({ activeRunningToolId = null, animationFrame = 0, item, }) {
    if (item.type === "tool") {
        if (item.status === "running") {
            const isActive = item.id === activeRunningToolId;
            return (_jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [_jsxs(Text, { children: [_jsx(Text, { color: isActive ? "cyan" : "gray", children: isActive ? `${getSpinnerFrame(animationFrame)} ` : "* " }), _jsx(Text, { bold: isActive, color: isActive ? "cyan" : "gray", children: item.content })] }), isActive && item.call ? (_jsxs(Text, { color: "gray", children: [" ", truncateLogOutput(item.call, "")] })) : null] }));
        }
        if (item.status === "error") {
            return (_jsx(Box, { flexDirection: "column", marginBottom: 1, children: _jsxs(Text, { children: [_jsx(Text, { bold: true, color: "red", children: "!! " }), _jsx(Text, { bold: true, color: "red", children: item.content })] }) }));
        }
        return (_jsx(Box, { flexDirection: "column", marginBottom: 1, children: _jsxs(Text, { children: [_jsx(Text, { color: "green", children: "* " }), _jsx(Text, { color: "gray", children: item.content })] }) }));
    }
    if (item.type === "debug") {
        return (_jsxs(Text, { children: [_jsx(Text, { color: "gray", children: "- " }), _jsx(Text, { color: "gray", children: item.content })] }));
    }
    return (_jsxs(Box, { flexDirection: "row", children: [_jsx(Text, { color: "white", children: "* " }), _jsx(Box, { flexDirection: "column", children: _jsx(MarkdownText, { markdown: item.content.trim() }) })] }));
}
function getActiveRunningToolLogId(log) {
    for (let index = log.length - 1; index >= 0; index -= 1) {
        const item = log[index];
        if (item.type === "tool" && item.status === "running") {
            return item.id;
        }
    }
    return null;
}
function getSpinnerFrame(frame) {
    const frames = ["-", "\\", "|", "/"];
    return frames[frame % frames.length] ?? "-";
}
function MarkdownText({ markdown }) {
    const tokens = marked.lexer(markdown, {
        async: false,
        gfm: true,
    });
    return (_jsx(Box, { flexDirection: "column", children: tokens.map((token, index) => (_jsx(MarkdownBlock, { index: index, token: token }, `${token.type}-${index}`))) }));
}
function MarkdownBlock({ index, token }) {
    if (token.type === "space" || token.type === "def" || token.type === "hr") {
        return null;
    }
    if (token.type === "paragraph") {
        return (_jsx(Text, { wrap: "wrap", children: _jsx(InlineMarkdown, { tokens: getTokenChildren(token) }) }));
    }
    if (token.type === "heading") {
        return (_jsx(Text, { wrap: "wrap", children: _jsx(InlineMarkdown, { tokens: getTokenChildren(token) }) }));
    }
    if (token.type === "list") {
        return (_jsx(Box, { flexDirection: "column", children: token.items.map((item, itemIndex) => (_jsxs(Text, { wrap: "wrap", children: [_jsx(Text, { color: "gray", children: token.ordered
                            ? `${Number(token.start || 1) + itemIndex}. `
                            : "- " }), _jsx(InlineMarkdown, { tokens: getTokenChildren(item) })] }, `${index}-${itemIndex}`))) }));
    }
    if (token.type === "code") {
        return _jsx(Text, { color: "gray", children: token.text });
    }
    if (token.type === "blockquote") {
        return (_jsxs(Text, { wrap: "wrap", children: [_jsx(Text, { color: "gray", children: "| " }), _jsx(InlineMarkdown, { tokens: getTokenChildren(token) })] }));
    }
    if (token.type === "table") {
        return _jsx(Text, { color: "gray", children: renderPlainTable(token) });
    }
    if (token.type === "html") {
        return _jsx(Text, { wrap: "wrap", children: renderHtmlToken(token) });
    }
    if (token.type === "text") {
        return (_jsx(Text, { wrap: "wrap", children: _jsx(InlineMarkdown, { tokens: token.tokens ?? [token] }) }));
    }
    return _jsx(Text, { wrap: "wrap", children: token.raw });
}
function InlineMarkdown({ tokens }) {
    return (_jsx(_Fragment, { children: tokens.map((token, index) => (_jsx(InlineMarkdownToken, { token: token }, `${token.type}-${index}`))) }));
}
function InlineMarkdownToken({ token }) {
    if (token.type === "text" || token.type === "escape") {
        return _jsx(_Fragment, { children: token.text });
    }
    if (token.type === "strong") {
        return (_jsx(Text, { bold: true, children: _jsx(InlineMarkdown, { tokens: getTokenChildren(token) }) }));
    }
    if (token.type === "em") {
        return (_jsx(Text, { italic: true, children: _jsx(InlineMarkdown, { tokens: getTokenChildren(token) }) }));
    }
    if (token.type === "link") {
        return (_jsx(Text, { underline: true, children: _jsx(InlineMarkdown, { tokens: getTokenChildren(token) }) }));
    }
    if (token.type === "codespan") {
        return _jsx(Text, { color: "gray", children: token.text });
    }
    if (token.type === "br") {
        return _jsx(_Fragment, { children: "\n" });
    }
    if (token.type === "del") {
        return (_jsx(Text, { strikethrough: true, children: _jsx(InlineMarkdown, { tokens: getTokenChildren(token) }) }));
    }
    if (token.type === "html") {
        return _jsx(_Fragment, { children: renderHtmlToken(token) });
    }
    if ("tokens" in token && Array.isArray(token.tokens)) {
        return _jsx(InlineMarkdown, { tokens: token.tokens });
    }
    return _jsx(_Fragment, { children: token.raw });
}
function getTokenChildren(token) {
    return "tokens" in token && Array.isArray(token.tokens) ? token.tokens : [];
}
function renderPlainTable(token) {
    const header = token.header.map((cell) => cell.text).join(" | ");
    const rows = token.rows.map((row) => row.map((cell) => cell.text).join(" | "));
    return [header, ...rows].filter(Boolean).join("\n");
}
function renderHtmlToken(token) {
    const text = "text" in token && typeof token.text === "string" ? token.text : token.raw;
    const underlineMatch = text.match(/^<u>(.*)<\/u>$/isu);
    if (underlineMatch) {
        return _jsx(Text, { underline: true, children: underlineMatch[1] });
    }
    return text.replace(/<[^>]*>/gu, "");
}
function ChatHistory({ runs }) {
    if (runs.length === 0) {
        return null;
    }
    return (_jsx(Box, { flexDirection: "column", children: runs.map((run) => (_jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [run.message ? _jsx(PromptBlock, { message: run.message }) : null, _jsxs(Text, { children: [_jsx(Text, { color: "green", children: "* " }), _jsx(Text, { bold: true, children: "Complete" }), " ", _jsxs(Text, { color: "gray", children: ["openwiki ", run.command, " - ", run.result.model] })] }), _jsx(Box, { flexDirection: "column", marginLeft: 2, marginTop: 1, children: run.log.length > 0 ? (run.log.map((item) => _jsx(RunLogLine, { item: item }, item.id))) : (_jsx(Text, { color: "gray", children: "No assistant output captured." })) })] }, run.id))) }));
}
function ChatInput({ currentModelId, currentProvider, onClear, onCommandRun, onModelSelect, onProviderSelect, onSubmit, }) {
    const [inputState, setInputState] = useState({
        cursorPosition: 0,
        value: "",
    });
    const [menuState, setMenuState] = useState({
        kind: "none",
    });
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const input = inputState.value;
    const cursorPosition = inputState.cursorPosition;
    useEffect(() => {
        setMenuState((currentState) => syncMenuStateForInput(input, currentState, currentModelId, currentProvider));
    }, [currentModelId, currentProvider, input]);
    useInput((inputValue, key) => {
        if (isSaving) {
            return;
        }
        if (isMenuUpInput(inputValue, key) && menuState.kind !== "none") {
            setMenuState((state) => moveMenuSelection(state, -1, currentModelId, currentProvider));
            return;
        }
        if (isMenuDownInput(inputValue, key) && menuState.kind !== "none") {
            setMenuState((state) => moveMenuSelection(state, 1, currentModelId, currentProvider));
            return;
        }
        if (key.return) {
            void submitInput();
            return;
        }
        if (inputValue === "\u001b" && menuState.kind !== "none") {
            resetInput();
            return;
        }
        if (key.leftArrow) {
            setInputState((state) => moveInputCursor(state, -1));
            return;
        }
        if (key.rightArrow) {
            setInputState((state) => moveInputCursor(state, 1));
            return;
        }
        if ((key.ctrl && inputValue === "a") || inputValue === "\u0001") {
            setInputState((state) => ({
                ...state,
                cursorPosition: 0,
            }));
            return;
        }
        if ((key.ctrl && inputValue === "e") || inputValue === "\u0005") {
            setInputState((state) => ({
                ...state,
                cursorPosition: state.value.length,
            }));
            return;
        }
        if (key.backspace || isRawBackspaceInput(inputValue)) {
            setInputState(deleteBeforeInputCursor);
            return;
        }
        if (key.delete) {
            setInputState(inputValue.length === 0 ? deleteBeforeInputCursor : deleteAtInputCursor);
            return;
        }
        if (inputValue && !key.ctrl && !key.meta) {
            setError(null);
            setNotice(null);
            setInputState((state) => applyRawInputValue(state, inputValue));
        }
    });
    async function submitInput() {
        const message = input.trim();
        if (message.length === 0) {
            setError("Enter a follow-up message.");
            return;
        }
        if (message.startsWith("/")) {
            await submitSlashInput(message);
            return;
        }
        resetInput();
        onSubmit(message);
    }
    async function submitSlashInput(message) {
        if (message === "/" && menuState.kind === "commands") {
            await runSlashCommand(slashCommandOptions[menuState.selectedIndex]);
            return;
        }
        if (message === "/model" && menuState.kind === "model") {
            await selectModelMenuOption(menuState.selectedIndex);
            return;
        }
        if (message === "/provider" && menuState.kind === "provider") {
            await selectProviderMenuOption(menuState.selectedIndex);
            return;
        }
        const parsedCommand = parseSlashInput(message);
        if (parsedCommand === null) {
            setError(`Unknown command: ${message}`);
            return;
        }
        await runSlashCommand(parsedCommand.option, parsedCommand.args.length > 0 ? parsedCommand.args : null);
    }
    async function runSlashCommand(option, args = null) {
        if (!option) {
            setError("Select a slash command.");
            return;
        }
        if (option.id === "model") {
            if (args && args.length > 0) {
                await saveModelSelection(args);
                return;
            }
            setError(null);
            setNotice("Choose a model, or type /model <model-id>.");
            setInputValue("/model");
            setMenuState({
                kind: "model",
                selectedIndex: getCurrentModelOptionIndex(currentModelId, currentProvider),
            });
            return;
        }
        if (option.id === "provider") {
            if (args && args.length > 0) {
                await saveProviderSelection(args);
                return;
            }
            setError(null);
            setNotice("Choose a provider, or type /provider <provider-id>.");
            setInputValue("/provider");
            setMenuState({
                kind: "provider",
                selectedIndex: getCurrentProviderOptionIndex(currentProvider),
            });
            return;
        }
        if (option.id === "init" || option.id === "update") {
            resetInput();
            onCommandRun(option.id, args);
            return;
        }
        if (option.id === "clear") {
            resetInput();
            onClear();
            setNotice("Started a new chat thread.");
            return;
        }
        if (option.id === "help") {
            resetInput();
            setNotice("Slash commands: /provider, /model, /init, /update, /clear, /help, /exit. Use arrows to select.");
            return;
        }
        resetInput();
        onSubmit("/exit");
    }
    async function selectModelMenuOption(selectedIndex) {
        const option = getModelMenuOptions(currentModelId, currentProvider)[selectedIndex];
        if (!option) {
            setError("Select a model.");
            return;
        }
        if (option.kind === "custom") {
            setError(null);
            setNotice("Type a custom model ID after /model.");
            setInputValue("/model ");
            return;
        }
        await saveModelSelection(option.modelId);
    }
    async function saveModelSelection(rawModelId) {
        const modelId = normalizeModelId(rawModelId);
        if (!isValidModelId(modelId)) {
            setError("Enter a valid model ID.");
            return;
        }
        setIsSaving(true);
        setError(null);
        setNotice(null);
        try {
            await onModelSelect(modelId);
            resetInput();
            setNotice(`Model switched to ${modelId}.`);
        }
        catch (saveError) {
            setError(saveError instanceof Error
                ? saveError.message
                : "Failed to save model selection.");
        }
        finally {
            setIsSaving(false);
        }
    }
    async function selectProviderMenuOption(selectedIndex) {
        const provider = SELECTABLE_OPENWIKI_PROVIDERS[selectedIndex];
        if (!provider) {
            setError("Select a provider.");
            return;
        }
        await saveProviderSelection(provider);
    }
    async function saveProviderSelection(rawProvider) {
        const provider = normalizeProvider(rawProvider);
        if (provider === null) {
            setError("Enter a valid provider: openrouter, baseten, fireworks, openai, or anthropic.");
            return;
        }
        setIsSaving(true);
        setError(null);
        setNotice(null);
        try {
            await onProviderSelect(provider);
            resetInput();
            setNotice(`Provider switched to ${getProviderLabel(provider)} with model ${getDefaultModelId(provider)}. Ensure ${getProviderCredentialRequirement(provider)} is set.`);
        }
        catch (saveError) {
            setError(saveError instanceof Error
                ? saveError.message
                : "Failed to save provider selection.");
        }
        finally {
            setIsSaving(false);
        }
    }
    function resetInput() {
        setInputState({ cursorPosition: 0, value: "" });
        setMenuState({ kind: "none" });
        setError(null);
    }
    function setInputValue(value) {
        setInputState({
            cursorPosition: value.length,
            value,
        });
    }
    const beforeCursor = input.slice(0, cursorPosition);
    const afterCursor = input.slice(cursorPosition);
    return (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Box, { borderStyle: "single", borderColor: "blue", paddingX: 1, children: _jsxs(Text, { children: [_jsx(Text, { color: "blue", children: ">" }), " ", input.length > 0 ? (_jsxs(_Fragment, { children: [beforeCursor, _jsx(InputCursor, {}), afterCursor] })) : (_jsxs(_Fragment, { children: [_jsx(InputCursor, {}), _jsx(Text, { color: "gray", children: " Ask a follow-up..." })] }))] }) }), _jsx(Text, { children: _jsxs(Text, { color: "gray", children: ["enter to send - / for commands - /exit to quit - cwd", " ", formatCwd(process.cwd())] }) }), menuState.kind !== "none" ? (_jsx(SlashMenu, { currentModelId: currentModelId, currentProvider: currentProvider, input: input, menuState: menuState })) : null, notice ? _jsx(Text, { color: "green", children: notice }) : null, isSaving ? _jsx(Text, { color: "gray", children: "Saving selection..." }) : null, error ? _jsx(Text, { color: "red", children: error }) : null] }));
}
const slashCommandOptions = [
    {
        description: "Switch the model provider",
        id: "provider",
        label: "/provider",
    },
    {
        description: "Switch the current provider model",
        id: "model",
        label: "/model",
    },
    {
        description: "Run an initial OpenWiki documentation pass",
        id: "init",
        label: "/init",
    },
    {
        description: "Update existing OpenWiki documentation",
        id: "update",
        label: "/update",
    },
    {
        description: "Start a fresh thread and clear chat history",
        id: "clear",
        label: "/clear",
    },
    {
        description: "Show slash command help",
        id: "help",
        label: "/help",
    },
    {
        description: "Exit OpenWiki",
        id: "exit",
        label: "/exit",
    },
];
function SlashMenu({ currentModelId, currentProvider, input, menuState, }) {
    if (menuState.kind === "model") {
        const modelOptions = getModelMenuOptions(currentModelId, currentProvider);
        return (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsxs(Text, { color: "gray", children: ["Models for ", getProviderLabel(currentProvider)] }), modelOptions.map((option, index) => (_jsx(MenuRow, { description: option.kind === "model" && option.modelId === currentModelId
                        ? "current"
                        : option.kind === "custom"
                            ? "type /model <model-id>"
                            : "", isSelected: index === menuState.selectedIndex, label: option.label }, option.label))), input.startsWith("/model ") ? (_jsx(Text, { color: "gray", children: "Press enter to save the custom model ID." })) : (_jsx(Text, { color: "gray", children: "Use arrows, enter to select, esc to cancel." }))] }));
    }
    if (menuState.kind === "provider") {
        return (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { color: "gray", children: "Providers" }), SELECTABLE_OPENWIKI_PROVIDERS.map((provider, index) => (_jsx(MenuRow, { description: provider === currentProvider
                        ? "current"
                        : `default model ${getDefaultModelId(provider)}`, isSelected: index === menuState.selectedIndex, label: getProviderLabel(provider) }, provider))), _jsx(Text, { color: "gray", children: "Use arrows, enter to select, esc to cancel." })] }));
    }
    return (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { color: "gray", children: "Commands" }), slashCommandOptions.map((option, index) => (_jsx(MenuRow, { description: option.description, isSelected: index === menuState.selectedIndex, label: option.label }, option.id))), _jsx(Text, { color: "gray", children: "Use arrows, enter to select, esc to cancel." })] }));
}
function MenuRow({ description, isSelected, label, }) {
    return (_jsxs(Text, { children: [_jsx(Text, { color: isSelected ? "cyan" : "gray", children: isSelected ? ">" : " " }), " ", _jsx(Text, { bold: isSelected, children: label.padEnd(28) }), _jsx(Text, { color: "gray", children: description })] }));
}
function moveInputCursor(state, offset) {
    return {
        ...state,
        cursorPosition: clampCursorPosition(state.cursorPosition + offset, state.value),
    };
}
function deleteBeforeInputCursor(state) {
    if (state.cursorPosition === 0) {
        return state;
    }
    return {
        cursorPosition: state.cursorPosition - 1,
        value: `${state.value.slice(0, state.cursorPosition - 1)}${state.value.slice(state.cursorPosition)}`,
    };
}
function deleteAtInputCursor(state) {
    if (state.cursorPosition >= state.value.length) {
        return state;
    }
    return {
        ...state,
        value: `${state.value.slice(0, state.cursorPosition)}${state.value.slice(state.cursorPosition + 1)}`,
    };
}
function applyRawInputValue(state, inputValue) {
    let nextState = state;
    for (let index = 0; index < inputValue.length; index += 1) {
        if (inputValue.startsWith("\u001b[D", index)) {
            nextState = moveInputCursor(nextState, -1);
            index += 2;
            continue;
        }
        if (inputValue.startsWith("\u001b[C", index)) {
            nextState = moveInputCursor(nextState, 1);
            index += 2;
            continue;
        }
        if (inputValue.startsWith("\u001b[3~", index)) {
            nextState = deleteAtInputCursor(nextState);
            index += 3;
            continue;
        }
        if (inputValue.startsWith("\u007f", index) ||
            inputValue.startsWith("\b", index)) {
            nextState = deleteBeforeInputCursor(nextState);
            continue;
        }
        if (inputValue.startsWith("\u001b[A", index) ||
            inputValue.startsWith("\u001b[B", index)) {
            index += 2;
            continue;
        }
        const character = inputValue[index];
        if (isControlCharacter(character)) {
            continue;
        }
        nextState = insertAtInputCursor(nextState, character);
    }
    return nextState;
}
function insertAtInputCursor(state, character) {
    return {
        cursorPosition: state.cursorPosition + character.length,
        value: `${state.value.slice(0, state.cursorPosition)}${character}${state.value.slice(state.cursorPosition)}`,
    };
}
function clampCursorPosition(position, value) {
    return Math.max(0, Math.min(value.length, position));
}
function isControlCharacter(character) {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && codePoint < 32;
}
function isRawBackspaceInput(inputValue) {
    return inputValue === "\u007f" || inputValue === "\b";
}
function syncMenuStateForInput(input, currentState, currentModelId, currentProvider) {
    if (input.startsWith("/provider")) {
        const selectedIndex = currentState.kind === "provider"
            ? currentState.selectedIndex
            : getCurrentProviderOptionIndex(currentProvider);
        return {
            kind: "provider",
            selectedIndex: clampMenuIndex(selectedIndex, SELECTABLE_OPENWIKI_PROVIDERS.length),
        };
    }
    if (input.startsWith("/model")) {
        const selectedIndex = currentState.kind === "model"
            ? currentState.selectedIndex
            : getCurrentModelOptionIndex(currentModelId, currentProvider);
        return {
            kind: "model",
            selectedIndex: clampMenuIndex(selectedIndex, getModelMenuOptions(currentModelId, currentProvider).length),
        };
    }
    if (input.startsWith("/")) {
        const selectedIndex = currentState.kind === "commands"
            ? currentState.selectedIndex
            : getCommandOptionIndex(input);
        return {
            kind: "commands",
            selectedIndex: clampMenuIndex(selectedIndex, slashCommandOptions.length),
        };
    }
    return { kind: "none" };
}
function moveMenuSelection(menuState, offset, currentModelId, currentProvider) {
    if (menuState.kind === "none") {
        return menuState;
    }
    const itemCount = menuState.kind === "model"
        ? getModelMenuOptions(currentModelId, currentProvider).length
        : menuState.kind === "provider"
            ? SELECTABLE_OPENWIKI_PROVIDERS.length
            : slashCommandOptions.length;
    return {
        ...menuState,
        selectedIndex: wrapMenuIndex(menuState.selectedIndex + offset, itemCount),
    };
}
function getCommandOptionIndex(input) {
    const matchingIndex = slashCommandOptions.findIndex((option) => option.label.startsWith(input));
    return matchingIndex === -1 ? 0 : matchingIndex;
}
function getCurrentModelOptionIndex(currentModelId, currentProvider) {
    const matchingIndex = getModelMenuOptions(currentModelId, currentProvider).findIndex((option) => option.kind === "model" && option.modelId === currentModelId);
    return matchingIndex === -1 ? 0 : matchingIndex;
}
function getCurrentProviderOptionIndex(currentProvider) {
    const matchingIndex = SELECTABLE_OPENWIKI_PROVIDERS.findIndex((provider) => provider === currentProvider);
    return matchingIndex === -1 ? 0 : matchingIndex;
}
function getModelMenuOptions(currentModelId, currentProvider) {
    const modelIds = Array.from(new Set([
        currentModelId,
        ...getProviderModelOptions(currentProvider).map((model) => model.id),
    ].filter(Boolean)));
    return [
        ...modelIds.map((modelId) => {
            const preset = getProviderModelOptions(currentProvider).find((model) => model.id === modelId);
            return {
                kind: "model",
                label: preset ? `${preset.label} ${modelId}` : modelId,
                modelId,
            };
        }),
        {
            kind: "custom",
            label: "Custom model ID",
        },
    ];
}
function parseSlashInput(input) {
    const trimmedInput = input.trim();
    const [commandName = "", ...args] = trimmedInput.split(/\s+/u);
    const option = slashCommandOptions.find((commandOption) => commandOption.label === commandName);
    return option ? { args: args.join(" "), option } : null;
}
function isMenuUpInput(inputValue, key) {
    return key.upArrow || inputValue === "\u001b[A";
}
function isMenuDownInput(inputValue, key) {
    return key.downArrow || inputValue === "\u001b[B";
}
function clampMenuIndex(index, itemCount) {
    return Math.max(0, Math.min(Math.max(0, itemCount - 1), index));
}
function wrapMenuIndex(index, itemCount) {
    if (itemCount <= 0) {
        return 0;
    }
    return ((index % itemCount) + itemCount) % itemCount;
}
function InputCursor() {
    return _jsx(Text, { color: "cyan", children: "|" });
}
function PromptBlock({ message }) {
    return (_jsx(Box, { flexDirection: "column", marginBottom: 1, children: _jsxs(Text, { backgroundColor: "gray", wrap: "wrap", children: [" ", _jsx(Text, { color: "cyan", children: ">" }), " ", message] }) }));
}
function updateRunningCredentialDiagnostics(state, credentialDiagnostics, credentialDiagnosticsRef) {
    credentialDiagnosticsRef.current = credentialDiagnostics;
    return state.status === "running"
        ? {
            ...state,
            credentialDiagnostics,
        }
        : state;
}
function appendRunLogEvent(log, event, nextLogId) {
    if (event.type === "text" && event.source === "subgraph") {
        return log;
    }
    if (event.type === "text" && event.text.length === 0) {
        return log;
    }
    if (event.type === "tool_start") {
        return appendToolStartLogItem(log, event, nextLogId);
    }
    if (event.type === "tool_end") {
        return completeToolLogItem(log, event);
    }
    const nextLog = [...log];
    const content = event.type === "text" ? event.text : event.message;
    const previous = nextLog.at(-1);
    if (event.type === "text" && previous?.type === "text") {
        nextLog[nextLog.length - 1] = {
            ...previous,
            content: `${previous.content}${content}`,
        };
    }
    else {
        nextLog.push({
            id: nextLogId.current,
            type: event.type,
            content,
        });
        nextLogId.current += 1;
    }
    return nextLog;
}
function appendToolStartLogItem(log, event, nextLogId) {
    const toolDisplay = createToolDisplay(event);
    const nextLog = [...log];
    const previous = nextLog.at(-1);
    if (previous?.type === "tool") {
        const actionCount = (previous.actionCount ?? 1) + 1;
        const errorCount = previous.errorCount ?? 0;
        const latestDoneContent = toolDisplay.done;
        nextLog[nextLog.length - 1] = {
            ...previous,
            actionCount,
            activeToolCallIds: [...getActiveToolCallIds(previous), event.id],
            call: toolDisplay.showDetail ? event.call : undefined,
            content: formatToolGroupRunning(actionCount, toolDisplay.running),
            doneContent: formatToolGroupDone(actionCount, errorCount, latestDoneContent),
            errorCount,
            latestDoneContent,
            status: "running",
            toolCallId: event.id,
            toolName: event.name,
        };
        return nextLog;
    }
    return [
        ...log,
        {
            actionCount: 1,
            activeToolCallIds: [event.id],
            call: toolDisplay.showDetail ? event.call : undefined,
            content: toolDisplay.running,
            doneContent: toolDisplay.done,
            errorCount: 0,
            id: nextLogId.current++,
            latestDoneContent: toolDisplay.done,
            status: "running",
            toolCallId: event.id,
            toolName: event.name,
            type: "tool",
        },
    ];
}
function completeToolLogItem(log, event) {
    const matchingIndex = findLastToolLogItemIndex(log, event.id);
    if (matchingIndex === -1) {
        return log;
    }
    return log.map((item, index) => index === matchingIndex ? completeToolGroupItem(item, event) : item);
}
function completeToolGroupItem(item, event) {
    const actionCount = item.actionCount ?? 1;
    const activeToolCallIds = getActiveToolCallIds(item).filter((id) => id !== event.id);
    const errorCount = (item.errorCount ?? 0) + (event.status === "error" ? 1 : 0);
    const latestDoneContent = item.latestDoneContent ?? item.doneContent;
    if (activeToolCallIds.length > 0) {
        return {
            ...item,
            activeToolCallIds,
            call: undefined,
            content: formatToolGroupRunning(actionCount, null),
            doneContent: formatToolGroupDone(actionCount, errorCount, latestDoneContent),
            errorCount,
            status: "running",
        };
    }
    return {
        ...item,
        activeToolCallIds,
        call: undefined,
        content: formatToolGroupDone(actionCount, errorCount, latestDoneContent),
        doneContent: formatToolGroupDone(actionCount, errorCount, latestDoneContent),
        errorCount,
        status: errorCount > 0 ? "error" : "done",
    };
}
function findLastToolLogItemIndex(log, toolCallId) {
    for (let index = log.length - 1; index >= 0; index -= 1) {
        const item = log[index];
        if (item.type === "tool" &&
            item.status === "running" &&
            getActiveToolCallIds(item).includes(toolCallId)) {
            return index;
        }
    }
    return -1;
}
function getActiveToolCallIds(item) {
    if (item.activeToolCallIds) {
        return item.activeToolCallIds;
    }
    if (item.status === "running" && item.toolCallId) {
        return [item.toolCallId];
    }
    return [];
}
function formatToolGroupRunning(actionCount, currentAction) {
    if (actionCount <= 1) {
        return currentAction ?? "Running 1 action";
    }
    if (currentAction) {
        return `Running ${formatCount(actionCount, "action", "actions")}: ${currentAction}`;
    }
    return `Running ${formatCount(actionCount, "action", "actions")}`;
}
function formatToolGroupDone(actionCount, errorCount, latestDoneContent) {
    if (actionCount <= 1 && errorCount === 0) {
        return latestDoneContent ?? "Ran 1 action";
    }
    if (errorCount > 0) {
        return `Ran ${formatCount(actionCount, "action", "actions")} with ${formatCount(errorCount, "failure", "failures")}`;
    }
    return `Ran ${formatCount(actionCount, "action", "actions")}`;
}
function createToolDisplay(event) {
    const input = parseToolInput(event.input);
    const variantIndex = pickVariantIndex(`${event.id}:${event.name}:${event.call}`);
    switch (event.name) {
        case "read_file": {
            const count = countToolTargets(input, ["path", "paths", "file", "files"]);
            return pickToolDisplay(variantIndex, [
                `Reading ${formatCount(count, "file", "files")}`,
                `Examining ${formatCount(count, "file", "files")}`,
                `Taking a look at ${formatCount(count, "file", "files")}`,
            ], [
                `Read ${formatCount(count, "file", "files")}`,
                `Examined ${formatCount(count, "file", "files")}`,
                `Looked at ${formatCount(count, "file", "files")}`,
            ]);
        }
        case "edit_file": {
            const count = countToolTargets(input, ["path", "paths", "file", "files"]);
            return pickToolDisplay(variantIndex, [
                `Editing ${formatCount(count, "file", "files")}`,
                `Updating ${formatCount(count, "file", "files")}`,
                `Applying changes to ${formatCount(count, "file", "files")}`,
            ], [
                `Edited ${formatCount(count, "file", "files")}`,
                `Updated ${formatCount(count, "file", "files")}`,
                `Applied changes to ${formatCount(count, "file", "files")}`,
            ], false);
        }
        case "write_file": {
            const count = countToolTargets(input, ["path", "paths", "file", "files"]);
            return pickToolDisplay(variantIndex, [
                `Writing ${formatCount(count, "file", "files")}`,
                `Creating ${formatCount(count, "file", "files")}`,
                `Saving ${formatCount(count, "file", "files")}`,
            ], [
                `Wrote ${formatCount(count, "file", "files")}`,
                `Created ${formatCount(count, "file", "files")}`,
                `Saved ${formatCount(count, "file", "files")}`,
            ], false);
        }
        case "ls":
            return pickToolDisplay(variantIndex, ["Listing files", "Scanning a directory", "Checking the file tree"], ["Listed files", "Scanned a directory", "Checked the file tree"]);
        case "glob":
            return pickToolDisplay(variantIndex, [
                "Finding matching files",
                "Searching file paths",
                "Scanning for matches",
            ], ["Found matching files", "Searched file paths", "Scanned for matches"]);
        case "grep":
            return pickToolDisplay(variantIndex, [
                "Searching file contents",
                "Grepping the codebase",
                "Looking for matches",
            ], [
                "Searched file contents",
                "Grepped the codebase",
                "Looked for matches",
            ]);
        case "write_todos": {
            const count = countTodoItems(input);
            return pickToolDisplay(variantIndex, [
                `Updating ${formatCount(count, "todo", "todos")}`,
                `Organizing ${formatCount(count, "todo", "todos")}`,
                `Refreshing ${formatCount(count, "todo", "todos")}`,
            ], [
                `Updated ${formatCount(count, "todo", "todos")}`,
                `Organized ${formatCount(count, "todo", "todos")}`,
                `Refreshed ${formatCount(count, "todo", "todos")}`,
            ]);
        }
        case "task": {
            const count = countToolTargets(input, [
                "tasks",
                "subagents",
                "agents",
                "items",
            ]);
            return pickToolDisplay(variantIndex, [
                `Spinning up ${formatCount(count, "subagent", "subagents")}`,
                `Starting ${formatCount(count, "subagent", "subagents")}`,
                `Delegating to ${formatCount(count, "subagent", "subagents")}`,
            ], [
                `Finished ${formatCount(count, "subagent", "subagents")}`,
                `Completed ${formatCount(count, "subagent", "subagents")}`,
                `Wrapped up ${formatCount(count, "subagent", "subagents")}`,
            ]);
        }
        default:
            return {
                done: event.call,
                running: event.call,
                showDetail: false,
            };
    }
}
function pickToolDisplay(variantIndex, running, done, showDetail = true) {
    const index = variantIndex % Math.min(running.length, done.length);
    return {
        done: done[index],
        running: running[index],
        showDetail,
    };
}
function parseToolInput(input) {
    if (typeof input !== "string") {
        return input;
    }
    try {
        return JSON.parse(input);
    }
    catch {
        return input;
    }
}
function countToolTargets(input, keys) {
    if (Array.isArray(input)) {
        return Math.max(input.length, 1);
    }
    if (!isRecord(input)) {
        return 1;
    }
    for (const key of keys) {
        const value = input[key];
        if (Array.isArray(value)) {
            return Math.max(value.length, 1);
        }
        if (typeof value === "string" && value.trim().length > 0) {
            return 1;
        }
    }
    return 1;
}
function countTodoItems(input) {
    if (!isRecord(input)) {
        return 1;
    }
    const todos = input.todos ?? input.items;
    return Array.isArray(todos) ? Math.max(todos.length, 1) : 1;
}
function formatCount(count, singular, plural) {
    return `${count} ${count === 1 ? singular : plural}`;
}
function pickVariantIndex(seed) {
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
        hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
    }
    return hash;
}
function isExitMessage(message) {
    const normalizedMessage = message.trim().toLowerCase();
    return (normalizedMessage === "/exit" ||
        normalizedMessage === "exit" ||
        normalizedMessage === "quit");
}
function truncateLogOutput(content, label) {
    const terminalColumns = process.stdout.columns ?? 80;
    const availableColumns = Math.max(24, terminalColumns - label.length - 7);
    return truncateToDisplayLines(content, 2, availableColumns);
}
function truncateToDisplayLines(content, maxLines, maxColumns) {
    const normalizedContent = content.replace(/\s+/gu, " ").trim();
    if (normalizedContent.length <= maxColumns) {
        return normalizedContent;
    }
    const lines = [];
    let remaining = normalizedContent;
    while (remaining.length > 0 && lines.length < maxLines) {
        lines.push(remaining.slice(0, maxColumns));
        remaining = remaining.slice(maxColumns);
    }
    if (remaining.length > 0 && lines.length > 0) {
        const lastLine = lines[lines.length - 1];
        lines[lines.length - 1] =
            lastLine.length > 3 ? `${lastLine.slice(0, -3)}...` : "...";
    }
    return lines.join("\n");
}
function formatCwd(cwd) {
    const home = process.env.HOME;
    if (home && cwd.startsWith(home)) {
        return `~${cwd.slice(home.length)}`;
    }
    return cwd;
}
function isDebugMode() {
    return process.env.OPENWIKI_DEBUG === "1";
}
function shouldShowCredentialDiagnostics() {
    return isDebugMode() || process.env.OPENWIKI_DEBUG_CREDENTIALS === "1";
}
function getDisplayModelId(modelId) {
    return (modelId ??
        process.env[OPENWIKI_MODEL_ID_ENV_KEY] ??
        getDefaultModelId(resolveConfiguredProvider()));
}
function getErrorDiagnostics(error) {
    const diagnostics = [];
    const debugMode = isDebugMode();
    addRuntimeDiagnostics(diagnostics);
    if (debugMode && error instanceof Error) {
        diagnostics.push({ label: "name", value: error.name }, { label: "message", value: sanitizeDiagnosticText(error.message) });
        const messageStatus = error.message.match(/\b([45]\d{2})\b/)?.[1];
        if (messageStatus) {
            diagnostics.push({
                label: "httpStatusFromMessage",
                value: messageStatus,
            });
        }
    }
    if (!isRecord(error)) {
        return diagnostics;
    }
    addOpenRouterMetadataDiagnostics(diagnostics, error, "");
    addAttachedDebugDiagnostics(diagnostics, error, "");
    if (debugMode) {
        addSafeObjectDiagnostics(diagnostics, error, "");
        addSafeNestedDiagnostics(diagnostics, error, "cause");
        addSafeNestedDiagnostics(diagnostics, error, "error");
        addSafeNestedDiagnostics(diagnostics, error, "response");
    }
    return dedupeDiagnostics(diagnostics);
}
function addRuntimeDiagnostics(diagnostics) {
    try {
        const provider = resolveConfiguredProvider();
        const credential = resolveProviderCredential(provider);
        diagnostics.push({
            label: "provider",
            value: provider,
        });
        diagnostics.push({
            label: "model",
            value: process.env[OPENWIKI_MODEL_ID_ENV_KEY] ?? getDefaultModelId(provider),
        });
        if (credential === null) {
            diagnostics.push({
                label: "credential",
                value: "missing",
            });
            return;
        }
        diagnostics.push({
            label: "credential.env",
            value: credential.envKey,
        });
        diagnostics.push({
            label: "credential.type",
            value: credential.type,
        });
    }
    catch {
        // Error diagnostics must never mask the original failure.
    }
}
function addSafeNestedDiagnostics(diagnostics, value, key) {
    const nested = value[key];
    if (!isRecord(nested)) {
        return;
    }
    addSafeObjectDiagnostics(diagnostics, nested, key);
    addOpenRouterMetadataDiagnostics(diagnostics, nested, key);
    addAttachedDebugDiagnostics(diagnostics, nested, key);
}
function addSafeObjectDiagnostics(diagnostics, value, prefix) {
    for (const key of [
        "status",
        "statusCode",
        "statusText",
        "code",
        "type",
        "param",
        "request_id",
        "requestID",
        "lc_error_code",
    ]) {
        const property = value[key];
        if (isDiagnosticValue(property)) {
            diagnostics.push({
                label: prefix ? `${prefix}.${key}` : key,
                value: sanitizeDiagnosticText(String(property)),
            });
        }
    }
    addSafeHeaderDiagnostics(diagnostics, value.headers, prefix);
}
function addAttachedDebugDiagnostics(diagnostics, value, prefix) {
    const debugValue = value.openRouterDebug;
    if (debugValue === undefined || debugValue === null) {
        return;
    }
    diagnostics.push({
        label: prefix ? `${prefix}.openRouterDebug` : "openRouterDebug",
        value: formatDiagnosticMetadataValue(debugValue),
    });
}
function addOpenRouterMetadataDiagnostics(diagnostics, value, prefix) {
    const metadata = value.metadata;
    if (!isRecord(metadata)) {
        return;
    }
    for (const key of ["provider_name", "is_byok", "finish_reason"]) {
        const property = metadata[key];
        if (isDiagnosticValue(property)) {
            diagnostics.push({
                label: prefix ? `${prefix}.metadata.${key}` : `metadata.${key}`,
                value: sanitizeDiagnosticText(String(property)),
            });
        }
    }
    addMetadataValueDiagnostic(diagnostics, metadata, "raw", prefix);
    addPreviousErrorDiagnostics(diagnostics, metadata.previous_errors, prefix);
}
function addMetadataValueDiagnostic(diagnostics, metadata, key, prefix) {
    const value = metadata[key];
    if (value === undefined || value === null) {
        return;
    }
    diagnostics.push({
        label: prefix ? `${prefix}.metadata.${key}` : `metadata.${key}`,
        value: formatDiagnosticMetadataValue(value),
    });
}
function addPreviousErrorDiagnostics(diagnostics, previousErrors, prefix) {
    if (!Array.isArray(previousErrors)) {
        return;
    }
    previousErrors.slice(0, 5).forEach((previousError, index) => {
        diagnostics.push({
            label: prefix
                ? `${prefix}.metadata.previous_errors.${index}`
                : `metadata.previous_errors.${index}`,
            value: formatDiagnosticMetadataValue(previousError),
        });
    });
    if (previousErrors.length > 5) {
        diagnostics.push({
            label: prefix
                ? `${prefix}.metadata.previous_errors.more`
                : "metadata.previous_errors.more",
            value: `${previousErrors.length - 5} more previous provider errors`,
        });
    }
}
function formatDiagnosticMetadataValue(value) {
    if (isDiagnosticValue(value)) {
        return truncateDiagnosticValue(sanitizeDiagnosticText(String(value)));
    }
    return truncateDiagnosticValue(sanitizeDiagnosticText(safeStringify(value)));
}
function safeStringify(value) {
    try {
        return JSON.stringify(value, createDiagnosticJsonReplacer(), 2);
    }
    catch {
        return String(value);
    }
}
function createDiagnosticJsonReplacer() {
    const seen = new WeakSet();
    return (key, value) => {
        if (isSecretLikeKey(key)) {
            return "[REDACTED]";
        }
        if (typeof value === "object" && value !== null) {
            if (seen.has(value)) {
                return "[Circular]";
            }
            seen.add(value);
        }
        return value;
    };
}
function isSecretLikeKey(key) {
    return /api[-_]?key|authorization|bearer|token|secret|password/iu.test(key);
}
function truncateDiagnosticValue(value) {
    const maxLength = 2_000;
    const normalizedValue = value.trim();
    if (normalizedValue.length <= maxLength) {
        return normalizedValue;
    }
    return `${normalizedValue.slice(0, maxLength - 3)}...`;
}
function addSafeHeaderDiagnostics(diagnostics, headers, prefix) {
    if (!isRecord(headers)) {
        return;
    }
    for (const key of [
        "x-request-id",
        "request-id",
        "openai-processing-ms",
        "cf-ray",
    ]) {
        const value = getHeaderValue(headers, key);
        if (isDiagnosticValue(value)) {
            diagnostics.push({
                label: prefix ? `${prefix}.header.${key}` : `header.${key}`,
                value: sanitizeDiagnosticText(String(value)),
            });
        }
    }
}
function getHeaderValue(headers, key) {
    if (key in headers) {
        return headers[key];
    }
    const matchingKey = Object.keys(headers).find((headerKey) => headerKey.toLowerCase() === key);
    return matchingKey ? headers[matchingKey] : undefined;
}
function dedupeDiagnostics(diagnostics) {
    const seen = new Set();
    const deduped = [];
    for (const diagnostic of diagnostics) {
        const key = `${diagnostic.label}:${diagnostic.value}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        deduped.push(diagnostic);
    }
    return deduped;
}
function isDiagnosticValue(value) {
    return (typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean");
}
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
function getErrorMessage(error) {
    const message = error instanceof Error ? error.message : "OpenWiki agent run failed.";
    if (isOpenRouterServerError(error, message)) {
        return "OpenRouter/provider returned 500 Internal Server Error. Try retrying or switching models with /model. Run with OPENWIKI_DEBUG=1 to show provider metadata.";
    }
    return sanitizeDiagnosticText(message);
}
function isOpenRouterServerError(error, message) {
    if (isRecord(error)) {
        const status = error.statusCode ?? error.status;
        const name = error instanceof Error ? error.name : null;
        if ((status === 500 || status === "500") &&
            (name === "OpenRouterError" || "metadata" in error)) {
            return true;
        }
    }
    return /OpenRouterError/iu.test(String(error)) ||
        /Internal Server Error/iu.test(message)
        ? /\b500\b|Internal Server Error/iu.test(message)
        : false;
}
function sanitizeDiagnosticText(value) {
    let sanitized = value;
    for (const key of [
        BASETEN_API_KEY_ENV_KEY,
        FIREWORKS_API_KEY_ENV_KEY,
        OPENAI_API_KEY_ENV_KEY,
        ANTHROPIC_API_KEY_ENV_KEY,
        ANTHROPIC_AUTH_TOKEN_ENV_KEY,
        CLAUDE_CODE_OAUTH_TOKEN_ENV_KEY,
        OPENROUTER_API_KEY_ENV_KEY,
        "LANGSMITH_API_KEY",
    ]) {
        const secret = process.env[key];
        if (secret && secret.length > 0) {
            sanitized = sanitized.split(secret).join(`[REDACTED:${key}]`);
        }
    }
    return sanitized
        .replace(/(Incorrect API key provided:\s*)([^\s.]+)/giu, "$1[REDACTED:API_KEY]")
        .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gu, "Bearer [REDACTED]")
        .replace(/\bsk-or-v1-[A-Za-z0-9_-]+/gu, "[REDACTED:OPENROUTER_API_KEY]")
        .replace(/\bsk-[A-Za-z0-9_-]+/gu, "[REDACTED:API_KEY]")
        .replace(/\bls[v_][A-Za-z0-9_-]+/gu, "[REDACTED:LANGSMITH_API_KEY]");
}
function sanitizeHeaderValue(value, maxLength = 80) {
    const compactValue = stripControlCharacters(value)
        .replace(/[^\S\n]+/gu, " ")
        .replace(/[\r\n\t]/gu, " ")
        .trim();
    if (compactValue.length <= maxLength) {
        return compactValue;
    }
    return `${compactValue.slice(0, Math.max(0, maxLength - 3))}...`;
}
function stripControlCharacters(value) {
    let sanitized = "";
    for (const character of value) {
        const codePoint = character.codePointAt(0);
        if (codePoint === undefined ||
            codePoint <= 31 ||
            (codePoint >= 127 && codePoint <= 159)) {
            sanitized += " ";
            continue;
        }
        sanitized += character;
    }
    return sanitized;
}
function Panel({ title, children }) {
    return (_jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [_jsxs(Text, { children: [_jsx(Text, { color: "cyan", children: "# " }), _jsx(Text, { bold: true, children: title })] }), _jsx(Box, { flexDirection: "column", marginLeft: 2, children: children })] }));
}
function Rows({ rows }) {
    const labelWidth = Math.max(...rows.map((row) => row.label.length));
    return (_jsx(_Fragment, { children: rows.map((row) => (_jsxs(Text, { children: ["  ", row.label.padEnd(labelWidth), "  ", row.description] }, row.label))) }));
}
const argv = process.argv.slice(2);
const parsedCommand = parseCommand(argv);
// Load ~/.openwiki/.env for every command, including help and dry-run, so
// provider/model displays match what a real run would resolve.
await loadOpenWikiEnv();
const command = resolveStartupCommand(parsedCommand);
if (shouldPrintStartupError(argv, parsedCommand, command)) {
    process.stderr.write(`${command.message}\n`);
    process.exitCode = command.exitCode;
}
else if (shouldRunHeadlessCommand(command)) {
    await runHeadlessCommand(command);
}
else {
    render(_jsx(App, { command: command }));
}
function argvRequestsPrint(argv) {
    return argv.some((arg) => arg === "-p" || arg === "--print");
}
function shouldPrintStartupError(argv, parsedCommand, command) {
    return (command.kind === "error" &&
        (argvRequestsPrint(argv) ||
            !process.stdin.isTTY ||
            (parsedCommand.kind === "run" && parsedCommand.shouldStart)));
}
function shouldAutoExitStartupRun(command) {
    return (command.kind === "run" &&
        !command.dryRun &&
        !command.print &&
        command.shouldStart &&
        (command.command === "init" || command.command === "update"));
}
function shouldRunHeadlessCommand(command) {
    return (command.kind === "run" &&
        !command.dryRun &&
        command.shouldStart &&
        (command.print || !process.stdin.isTTY));
}
async function runHeadlessCommand(command) {
    try {
        const debugMode = isDebugMode();
        const shouldStreamProgress = debugMode || !command.print;
        const output = [];
        await runOpenWikiAgent(command.command, process.cwd(), {
            debug: debugMode,
            isFollowup: command.command === "chat",
            modelId: command.modelId,
            threadId: createOpenWikiThreadId(process.cwd()),
            userMessage: command.userMessage,
            onEvent: (event) => {
                if (event.type === "text" && event.source !== "subgraph") {
                    output.push(event.text);
                }
                if (shouldStreamProgress) {
                    writeHeadlessProgressEvent(event, debugMode);
                }
            },
        });
        const text = output.join("").trim();
        if (text.length > 0) {
            process.stdout.write(`${text}\n`);
        }
        process.exitCode = 0;
    }
    catch (error) {
        process.stderr.write(`${getErrorMessage(error)}\n`);
        writePrintErrorDiagnostics(error);
        process.exitCode = 1;
    }
}
function writeHeadlessProgressEvent(event, debugMode) {
    if (event.type === "tool_start") {
        process.stderr.write(`[tool:start] ${event.name}${formatHeadlessToolTarget(event.input)}\n`);
        return;
    }
    if (event.type === "tool_end") {
        process.stderr.write(`[tool:${event.status}] ${event.name}\n`);
        return;
    }
    if (event.type === "debug" && debugMode) {
        process.stderr.write(`[debug] ${event.message}\n`);
        return;
    }
    if (event.type === "text" && debugMode && event.source !== "subgraph") {
        const text = truncateHeadlessValue(event.text.trim().replace(/\s+/g, " "));
        if (text.length > 0) {
            process.stderr.write(`[text] ${text}\n`);
        }
    }
}
function formatHeadlessToolTarget(input) {
    const parsedInput = parseHeadlessToolInput(input);
    if (isHeadlessRecord(parsedInput)) {
        const target = getHeadlessString(parsedInput, "path") ??
            getHeadlessString(parsedInput, "file_path") ??
            getHeadlessString(parsedInput, "command");
        if (target) {
            return ` ${truncateHeadlessValue(target)}`;
        }
    }
    const fallback = truncateHeadlessValue(JSON.stringify(parsedInput) ?? "");
    return fallback.length > 0 ? ` ${fallback}` : "";
}
function parseHeadlessToolInput(input) {
    if (typeof input !== "string") {
        return input;
    }
    try {
        return JSON.parse(input);
    }
    catch {
        return input;
    }
}
function getHeadlessString(value, key) {
    return typeof value[key] === "string" ? value[key] : null;
}
function isHeadlessRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function truncateHeadlessValue(value) {
    return value.length > 180 ? `${value.slice(0, 177)}...` : value;
}
function writePrintErrorDiagnostics(error) {
    const diagnostics = getErrorDiagnostics(error);
    if (diagnostics.length === 0) {
        return;
    }
    process.stderr.write("\nError Diagnostics\n");
    for (const diagnostic of diagnostics) {
        process.stderr.write(`${diagnostic.label}: ${diagnostic.value}\n`);
    }
}
function resolveStartupCommand(command) {
    if (command.kind === "run" &&
        !command.dryRun &&
        command.shouldStart &&
        (command.print || !process.stdin.isTTY)) {
        const provider = resolveConfiguredProvider();
        const providerCredentialError = createProviderCredentialConfigurationError(provider);
        if (providerCredentialError !== null) {
            return {
                kind: "error",
                exitCode: 1,
                message: providerCredentialError,
            };
        }
        const providerCredential = resolveProviderCredential(provider);
        if (providerCredential === null) {
            return {
                kind: "error",
                exitCode: 1,
                message: createProviderCredentialRequiredMessage(provider, "non-interactive"),
            };
        }
    }
    if (command.kind === "run" &&
        !command.dryRun &&
        command.userMessage !== null &&
        command.userMessage.trim().length === 0) {
        return {
            kind: "error",
            exitCode: 1,
            message: "User message cannot be empty.",
        };
    }
    return command;
}
