import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { useEffect, useMemo, useRef, useState } from "react";
import { homedir } from "node:os";
import path from "node:path";
import { Box, Text, useInput, useStdout } from "ink";
import { configureAuthProvider } from "./auth/configure.js";
import { runOAuthAuth } from "./auth/oauth.js";
import { DEFAULT_PROVIDER, getDefaultModelId, getProviderApiKeyEnvKey, getProviderBaseUrlEnvKey, getProviderCredentialRequirement, getProviderLabel, getProviderModelOptions, isValidBaseUrl, isValidModelId, normalizeProvider, normalizeModelId, OPENAI_CHATGPT_EMAIL_ENV_KEY, OPENAI_CHATGPT_PLAN_ENV_KEY, OPENWIKI_GOOGLE_CLIENT_ID_ENV_KEY, OPENWIKI_GOOGLE_CLIENT_SECRET_ENV_KEY, OPENWIKI_MODEL_ID_ENV_KEY, OPENWIKI_PROVIDER_ENV_KEY, OPENWIKI_TAVILY_API_KEY_ENV_KEY, OPENWIKI_X_CLIENT_ID_ENV_KEY, providerRequiresBaseUrl, providerUsesOAuth, resolveConfiguredProvider, resolveProviderCredential, SELECTABLE_OPENWIKI_PROVIDERS, } from "./constants.js";
import { codexTokensToEnv, formatChatGptAccount, isChatGptTokenExpired, loginWithChatGPT, readCodexTokensFromEnv, } from "./agent/openai-chatgpt-oauth.js";
import { getConnectorConfigPath } from "./openwiki-home.js";
import { openWikiEnvPath, saveOpenWikiEnv } from "./env.js";
import { createEmptyOnboardingConfig, isOpenWikiOnboardingCompleteSync, isOnboardingComplete, isRepositoryCodeOnboardingCompleteSync, openWikiOnboardingPath, readOpenWikiOnboardingConfig, readRepositoryWikiInstructions, saveRepositoryWikiInstructions, saveOpenWikiOnboardingConfig, } from "./onboarding.js";
import { getSuggestedCronExpression, installOpenWikiPowerSchedule, installConnectorSchedule, validateCronExpression, } from "./schedules.js";
const ONBOARDING_TEMPLATES = [
    {
        description: "Maintain a structured project wiki from a local Git repository, with code-oriented pages for architecture, workflows, source maps, and operational guidance.",
        id: "code",
        name: "Code",
        sourceIds: ["git-repo"],
        suggestedSources: ["Local Git repository"],
        suggestedGoal: "A code wiki for this local repository. Prioritize a concise quickstart, architecture overview, source map, key workflows, domain concepts, operations/runbook notes, testing guidance, and integration points. Inspect git history to understand reasoning behind code changes and the progression of the repository. Keep pages grounded in the repository structure and recent code changes. Prefer practical navigation for engineers over generic summaries.",
    },
    {
        description: "A personal assistant wiki that builds memory from email, notes, social/research sources, and web search so you can ask about projects, priorities, people, and recurring context.",
        id: "personal",
        name: "Personal",
        sourceIds: [
            "git-repo",
            "google",
            "notion",
            "web-search",
            "hackernews",
            "x",
        ],
        suggestedSources: [
            "Gmail",
            "Notion",
            "Web Search (Tavily)",
            "Hacker News",
            "X/Twitter",
        ],
        suggestedGoal: "Your personal brain. Track active projects, people, organizations, decisions, commitments, follow-ups, useful links, recurring themes, and fresh external signals. Organize the wiki so a personal assistant can answer what changed, what matters, what needs attention, and where supporting evidence came from. Be selective: summarize durable context and explicit action items, not every raw item.",
    },
];
const RUN_MODE_OPTIONS = [
    {
        description: "Build a local personal brain wiki in ~/.openwiki/wiki from configured sources.",
        id: "personal",
        name: "Personal",
    },
    {
        description: "Build repository documentation in ./openwiki for this codebase.",
        id: "code",
        name: "Code",
    },
];
const SOURCE_OPTIONS = [
    {
        displayName: "Local Git repository",
        examples: [
            "Track architecture notes from this repo.",
            "Summarize recent commits and changed files.",
        ],
        id: "git-repo",
        instructions: [
            "Choose the local repository directory OpenWiki should read.",
            "The default is the current working directory, and you can replace it with another path.",
            "You can add more repositories later in the connector config file.",
        ],
        secretInputs: [],
    },
    {
        authProvider: "notion",
        displayName: "Notion",
        examples: [
            "Ingest product specs, meeting notes, and research pages.",
            "Prioritize pages related to Applied AI and customer feedback.",
        ],
        id: "notion",
        instructions: [
            "OpenWiki uses Notion's hosted MCP OAuth flow.",
            "No client ID, client secret, or pasted Notion token is required.",
            "Approve access in the browser window when it opens.",
        ],
        secretInputs: [],
    },
    {
        authProvider: "gmail",
        displayName: "Gmail",
        examples: [
            "Capture important project email threads from the last 24 hours.",
            "Look for vendor updates, customer feedback, and action items.",
        ],
        id: "google",
        instructions: [
            "Create OAuth credentials in Google Cloud for a desktop or web app.",
            "Enable the Gmail API for the Google Cloud project.",
            "Add http://127.0.0.1:53682/callback as an authorized redirect URI.",
            "Paste the client ID and client secret below.",
        ],
        secretInputs: [
            {
                envKey: OPENWIKI_GOOGLE_CLIENT_ID_ENV_KEY,
                label: "Google OAuth client ID",
            },
            {
                envKey: OPENWIKI_GOOGLE_CLIENT_SECRET_ENV_KEY,
                label: "Google OAuth client secret",
                secret: true,
            },
        ],
    },
    {
        displayName: "Web Search (Tavily)",
        examples: [
            "Track a company, product category, or technical topic.",
            "Find launch posts, docs, pricing pages, and recent articles.",
        ],
        id: "web-search",
        instructions: [
            "Create a Tavily account and API key.",
            "Paste the Tavily API key below.",
            "Describe the topics, companies, or pages OpenWiki should search for on the next screen.",
        ],
        secretInputs: [
            {
                envKey: OPENWIKI_TAVILY_API_KEY_ENV_KEY,
                label: "Tavily API key",
                secret: true,
            },
        ],
    },
    {
        displayName: "Hacker News",
        examples: [
            "Monitor threads about AI agents, evals, infrastructure, and startups.",
            "Capture notable discussions and links related to my research topics.",
        ],
        id: "hackernews",
        instructions: [
            "No account setup is required for Hacker News.",
            "OpenWiki uses public Hacker News feed and search APIs.",
            "Describe the topics, keywords, users, or story types OpenWiki should watch on the next screen.",
        ],
        secretInputs: [],
    },
    {
        authProvider: "x",
        displayName: "X / Twitter",
        examples: [
            "Track my home timeline, bookmarks, and key lists.",
            "Summarize tweets from AI researchers and product announcements.",
        ],
        id: "x",
        instructions: [
            "Create an X OAuth 2.0 app.",
            "Use a native app or public client when possible.",
            "Add http://127.0.0.1:53682/callback as a callback URI.",
            "Paste the OAuth client ID below.",
        ],
        secretInputs: [
            {
                envKey: OPENWIKI_X_CLIENT_ID_ENV_KEY,
                label: "X OAuth client ID",
            },
        ],
    },
];
const CRON_MODE_OPTIONS = [
    "Use suggested schedule",
    "Enter custom cron",
];
const POWER_MODE_OPTIONS = [
    "Set up Mac wake/sleep window",
    "Skip power setup",
];
const CRON_FIELD_LABELS = ["minute", "hour", "day", "month", "weekday"];
const SOURCE_CONTINUE_OPTIONS = [
    "Go back to connections",
    "Continue without all sources",
];
const FINAL_OPTIONS = ["Run ingestion now", "Run later"];
const CODE_REPO_OPTIONS = ["Confirm and continue", "Edit path"];
export function needsCredentialSetup(modelIdOverride = null, mode = "personal") {
    const provider = resolveConfiguredProvider();
    const needsCredentials = !hasValidConfiguredProvider() ||
        needsCredentialStep(provider) ||
        needsBaseUrlStep(provider) ||
        (modelIdOverride === null &&
            process.env[OPENWIKI_MODEL_ID_ENV_KEY] === undefined) ||
        process.env.LANGSMITH_API_KEY === undefined;
    if (needsCredentials) {
        return true;
    }
    return mode === "code"
        ? !isRepositoryCodeOnboardingCompleteSync(getDefaultCodeRepoRootPath())
        : !isOpenWikiOnboardingCompleteSync();
}
/**
 * Whether the provider still needs its primary credential collected. For
 * `oauth` providers this is a valid, non-expired stored token; for everyone
 * else it is a pasted API key.
 */
function needsCredentialStep(provider) {
    return providerUsesOAuth(provider)
        ? !hasValidStoredToken()
        : resolveProviderCredential(provider) === null;
}
/** The step that collects the provider's primary credential. */
function credentialStep(provider) {
    return providerUsesOAuth(provider) ? "oauth-login" : "api-key";
}
function hasValidStoredToken(env = process.env) {
    const tokens = readCodexTokensFromEnv(env);
    return tokens !== null && !isChatGptTokenExpired(tokens.expiresAtMs);
}
function needsBaseUrlStep(provider) {
    if (!providerRequiresBaseUrl(provider)) {
        return false;
    }
    return !isBaseUrlConfigured(provider);
}
function isBaseUrlConfigured(provider) {
    const baseUrlEnvKey = getProviderBaseUrlEnvKey(provider);
    return baseUrlEnvKey ? Boolean(process.env[baseUrlEnvKey]) : false;
}
function isCredentialConfigured(provider) {
    return providerUsesOAuth(provider)
        ? hasValidStoredToken()
        : resolveProviderCredential(provider) !== null;
}
function getCredentialSetupDetail(provider, tokens = null) {
    if (providerUsesOAuth(provider)) {
        if (!isCredentialConfigured(provider) && !tokens) {
            return "sign in with your ChatGPT account";
        }
        const account = formatChatGptAccount(tokens?.email ?? process.env[OPENAI_CHATGPT_EMAIL_ENV_KEY] ?? null, tokens?.planType ?? process.env[OPENAI_CHATGPT_PLAN_ENV_KEY] ?? null);
        return account ? `signed in as ${account}` : "signed in with ChatGPT";
    }
    const credential = resolveProviderCredential(provider);
    return credential !== null
        ? `available from ${credential.envKey}`
        : `save ${getProviderCredentialRequirement(provider)} to ${openWikiEnvPath}`;
}
/**
 * Copies text to the terminal's clipboard using the OSC 52 escape sequence.
 * This targets the user's local terminal emulator even when OpenWiki runs over
 * SSH, unlike shelling out to a host clipboard utility.
 */
function copyToClipboard(text) {
    const encoded = Buffer.from(text, "utf8").toString("base64");
    process.stdout.write(`\u001b]52;c;${encoded}\u0007`);
}
function openLoginUrl(url) {
    try {
        const child = process.platform === "win32"
            ? spawn("cmd", ["/c", "start", '""', `"${url}"`], {
                detached: true,
                stdio: "ignore",
                windowsVerbatimArguments: true,
            })
            : spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], {
                detached: true,
                stdio: "ignore",
            });
        child.on("error", () => {
            // The URL is also rendered for manual use on headless/SSH machines.
        });
        child.unref();
    }
    catch {
        // Ignore spawn failures; the URL is still rendered for manual use.
    }
}
export function InitSetup({ allowModeSelection = false, mode, modelIdOverride = null, onComplete, onError, }) {
    const { stdout } = useStdout();
    const initialProvider = resolveConfiguredProvider();
    const [step, setStep] = useState(null);
    const [selectedMode, setSelectedMode] = useState(mode);
    const [provider, setProvider] = useState(initialProvider);
    const [apiKey, setApiKey] = useState(null);
    const [baseUrl, setBaseUrl] = useState(null);
    const [modelId, setModelId] = useState(null);
    const [langSmithKey, setLangSmithKey] = useState(null);
    const [input, setInput] = useState("");
    const [onboardingConfig, setOnboardingConfig] = useState(() => createEmptyOnboardingConfig());
    const [sourceState, setSourceState] = useState({
        secretValues: {},
    });
    const [selectedSourceId, setSelectedSourceId] = useState("git-repo");
    const [secretInputIndex, setSecretInputIndex] = useState(0);
    const [providerSelectionIndex, setProviderSelectionIndex] = useState(() => getProviderSelectionIndex(initialProvider));
    const [modelSelectionIndex, setModelSelectionIndex] = useState(() => getModelSelectionIndex(initialProvider, modelIdOverride ??
        process.env[OPENWIKI_MODEL_ID_ENV_KEY] ??
        getDefaultModelId(initialProvider)));
    const [runModeSelectionIndex, setRunModeSelectionIndex] = useState(() => getRunModeSelectionIndex(mode));
    const [sourceSelectionIndex, setSourceSelectionIndex] = useState(0);
    const [sourceDescriptionSelectionIndex, setSourceDescriptionSelectionIndex] = useState(0);
    const [templateSelectionIndex, setTemplateSelectionIndex] = useState(0);
    const [cronModeSelectionIndex, setCronModeSelectionIndex] = useState(0);
    const [powerModeSelectionIndex, setPowerModeSelectionIndex] = useState(0);
    const [cronFieldSelectionIndex, setCronFieldSelectionIndex] = useState(0);
    const [cronReplaceCurrentField, setCronReplaceCurrentField] = useState(true);
    const [sourceContinueSelectionIndex, setSourceContinueSelectionIndex] = useState(0);
    const [finalSelectionIndex, setFinalSelectionIndex] = useState(0);
    const [codeRepoSelectionIndex, setCodeRepoSelectionIndex] = useState(0);
    const [codeRepoRoot, setCodeRepoRoot] = useState(() => getDefaultCodeRepoRootPath());
    const [codeRepoConfirmed, setCodeRepoConfirmed] = useState(false);
    const [isCustomModelInput, setIsCustomModelInput] = useState(false);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isAuthRunning, setIsAuthRunning] = useState(false);
    const [oauthTokens, setOauthTokens] = useState(null);
    const [loginUrl, setLoginUrl] = useState(null);
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [loginAttempt, setLoginAttempt] = useState(0);
    const [copied, setCopied] = useState(false);
    const [forceModelStep, setForceModelStep] = useState(false);
    const loginHandleRef = useRef(null);
    const activeSourceOptions = useMemo(() => getTemplateSourceOptions(getConfigModeId(onboardingConfig)), [onboardingConfig.modeId, onboardingConfig.templateId]);
    const selectedSource = getSourceOption(selectedSourceId);
    const suggestedCronExpression = useMemo(() => getSuggestedCronExpression(onboardingConfig), [onboardingConfig]);
    const suggestedCronDescription = useMemo(() => {
        const validation = validateCronExpression(suggestedCronExpression);
        return validation.valid ? validation.description : suggestedCronExpression;
    }, [suggestedCronExpression]);
    const inputDisplayWidth = getInputDisplayWidth(stdout.columns);
    useEffect(() => {
        let cancelled = false;
        readOpenWikiOnboardingConfig()
            .then(async (config) => {
            if (cancelled) {
                return;
            }
            const defaultRepoRoot = getDefaultCodeRepoRootPath();
            const configForMode = allowModeSelection
                ? config
                : await hydrateRunModeConfig(ensureRunModeConfig(config, mode), mode, defaultRepoRoot);
            if (configForMode !== config) {
                await saveOpenWikiOnboardingConfig({
                    ...configForMode,
                    wikiGoal: mode === "code" ? undefined : configForMode.wikiGoal,
                });
            }
            setOnboardingConfig(configForMode);
            const initialStep = getInitialStep(modelIdOverride, initialProvider, configForMode, mode, allowModeSelection);
            if (initialStep === null) {
                onComplete({
                    mode,
                    modelId: modelIdOverride ?? process.env[OPENWIKI_MODEL_ID_ENV_KEY] ?? null,
                    onboardingCompleted: true,
                    provider: initialProvider,
                    runIngestionNow: false,
                    savedApiKey: false,
                    savedBaseUrl: false,
                    savedLangSmithKey: false,
                    savedModelId: false,
                    savedProvider: false,
                    shouldContinueToRun: true,
                });
                return;
            }
            setProvider(initialProvider);
            setProviderSelectionIndex(getProviderSelectionIndex(initialProvider));
            setModelSelectionIndex(getModelSelectionIndex(initialProvider, modelIdOverride ??
                process.env[OPENWIKI_MODEL_ID_ENV_KEY] ??
                getDefaultModelId(initialProvider)));
            setIsCustomModelInput(initialStep === "model" &&
                shouldStartWithCustomModelInput(initialProvider));
            if (initialStep === "wiki-goal") {
                setInput(getTemplateGoal(getConfigModeId(config)));
            }
            if (initialStep === "code-repo-confirm") {
                setCodeRepoRoot(defaultRepoRoot);
                setCodeRepoSelectionIndex(0);
            }
            setStep(initialStep);
        })
            .catch((loadError) => {
            if (!cancelled) {
                onError(getErrorMessage(loadError));
            }
        });
        return () => {
            cancelled = true;
        };
    }, [
        allowModeSelection,
        initialProvider,
        modelIdOverride,
        onComplete,
        onError,
        mode,
    ]);
    // Drive the browser OAuth login whenever the wizard enters the oauth-login
    // step or the user retries after a failure.
    useEffect(() => {
        if (step !== "oauth-login") {
            return;
        }
        let cancelled = false;
        setIsLoggingIn(true);
        setLoginUrl(null);
        setCopied(false);
        setInput("");
        setError(null);
        loginHandleRef.current = null;
        void (async () => {
            try {
                const tokens = await loginWithChatGPT((url) => {
                    if (cancelled) {
                        return;
                    }
                    setLoginUrl(url);
                    openLoginUrl(url);
                }, (handle) => {
                    if (!cancelled) {
                        loginHandleRef.current = handle;
                    }
                });
                if (cancelled) {
                    return;
                }
                setOauthTokens(tokens);
                setIsLoggingIn(false);
                const nextStep = getNextStepAfterApiKey(provider, modelIdOverride, onboardingConfig, selectedMode, forceModelStep);
                if (nextStep) {
                    setIsCustomModelInput(nextStep === "model" && shouldStartWithCustomModelInput(provider));
                    setStep(nextStep);
                    return;
                }
                await completeSetup({
                    nextApiKey: apiKey,
                    nextBaseUrl: baseUrl,
                    nextLangSmithKey: langSmithKey,
                    nextModelId: modelId,
                    nextOAuthTokens: tokens,
                    nextProvider: provider,
                    runMode: selectedMode,
                });
            }
            catch (loginError) {
                if (cancelled) {
                    return;
                }
                setIsLoggingIn(false);
                setError(getErrorMessage(loginError));
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [step, loginAttempt]);
    useInput((inputValue, key) => {
        if (isSaving ||
            isAuthRunning ||
            (isLoggingIn && step !== "oauth-login") ||
            step === null) {
            return;
        }
        if (step === "oauth-login") {
            if (input.length === 0 &&
                (inputValue === "c" || inputValue === "C") &&
                !key.ctrl &&
                !key.meta) {
                if (loginUrl) {
                    copyToClipboard(loginUrl);
                    setCopied(true);
                }
                return;
            }
            if (key.return) {
                const pasted = input.trim();
                if (pasted.length > 0) {
                    submitManualLogin(pasted);
                }
                else if (!isLoggingIn) {
                    setLoginAttempt((attempt) => attempt + 1);
                }
                return;
            }
            if (key.backspace || key.delete) {
                setInput((value) => value.slice(0, -1));
                return;
            }
            const sanitizedInput = sanitizeInputChunk(inputValue);
            if (sanitizedInput && !key.ctrl && !key.meta) {
                setError(null);
                setInput((value) => value + sanitizedInput);
            }
            return;
        }
        if (step === "provider") {
            handleMenuInput(key, () => setProviderSelectionIndex((index) => moveSelectionIndex(index, key.upArrow ? -1 : 1, SELECTABLE_OPENWIKI_PROVIDERS.length)));
            return;
        }
        if (step === "model" && !isCustomModelInput) {
            handleMenuInput(key, () => setModelSelectionIndex((index) => moveSelectionIndex(index, key.upArrow ? -1 : 1, getModelSelectionOptions(provider).length)));
            return;
        }
        if (step === "run-mode") {
            handleMenuInput(key, () => setRunModeSelectionIndex((index) => moveSelectionIndex(index, key.upArrow ? -1 : 1, RUN_MODE_OPTIONS.length)));
            return;
        }
        if (step === "code-repo-confirm") {
            handleMenuInput(key, () => setCodeRepoSelectionIndex((index) => moveSelectionIndex(index, key.upArrow ? -1 : 1, CODE_REPO_OPTIONS.length)));
            return;
        }
        if (step === "source-menu") {
            handleMenuInput(key, () => setSourceSelectionIndex((index) => moveSelectionIndex(index, key.upArrow ? -1 : 1, activeSourceOptions.length + 1)));
            return;
        }
        if (step === "template") {
            handleMenuInput(key, () => setTemplateSelectionIndex((index) => moveSelectionIndex(index, key.upArrow ? -1 : 1, ONBOARDING_TEMPLATES.length)));
            return;
        }
        if (step === "global-cron-mode") {
            handleMenuInput(key, () => setCronModeSelectionIndex((index) => moveSelectionIndex(index, key.upArrow ? -1 : 1, CRON_MODE_OPTIONS.length)));
            return;
        }
        if (step === "global-power-mode") {
            handleMenuInput(key, () => setPowerModeSelectionIndex((index) => moveSelectionIndex(index, key.upArrow ? -1 : 1, POWER_MODE_OPTIONS.length)));
            return;
        }
        if (step === "source-description") {
            handleMenuInput(key, () => setSourceDescriptionSelectionIndex((index) => moveSelectionIndex(index, key.upArrow ? -1 : 1, getSourceDescriptionOptionCount(selectedSource))));
            return;
        }
        if (step === "source-confirm-continue") {
            handleMenuInput(key, () => setSourceContinueSelectionIndex((index) => moveSelectionIndex(index, key.upArrow ? -1 : 1, SOURCE_CONTINUE_OPTIONS.length)));
            return;
        }
        if (step === "final") {
            handleMenuInput(key, () => setFinalSelectionIndex((index) => moveSelectionIndex(index, key.upArrow ? -1 : 1, FINAL_OPTIONS.length)));
            return;
        }
        if (step === "source-auth") {
            if (key.return) {
                void submit();
            }
            return;
        }
        if (step === "global-cron-custom") {
            if (key.return) {
                void submit();
                return;
            }
            const didHandleCronInput = handleCronEditorInput({
                currentFieldIndex: cronFieldSelectionIndex,
                currentValue: input,
                fallbackExpression: suggestedCronExpression,
                inputValue,
                key,
                replaceCurrentField: cronReplaceCurrentField,
                setCurrentFieldIndex: setCronFieldSelectionIndex,
                setReplaceCurrentField: setCronReplaceCurrentField,
                setValue: setInput,
            });
            if (didHandleCronInput) {
                setError(null);
            }
            return;
        }
        if (step === "code-repo-path") {
            if (key.return) {
                void submit();
                return;
            }
            if (key.backspace || key.delete) {
                setInput((value) => value.slice(0, -1));
                return;
            }
            const sanitizedInput = sanitizeInputChunk(inputValue);
            if (sanitizedInput && !key.ctrl && !key.meta) {
                setError(null);
                setInput((value) => value + sanitizedInput);
            }
            return;
        }
        if (key.return) {
            void submit();
            return;
        }
        if (key.backspace || key.delete) {
            setInput((value) => value.slice(0, -1));
            return;
        }
        const sanitizedInput = sanitizeInputChunk(inputValue);
        if (sanitizedInput && !key.ctrl && !key.meta) {
            setInput((value) => value + sanitizedInput);
        }
    });
    function handleMenuInput(key, move) {
        if (key.upArrow || key.downArrow) {
            setError(null);
            move();
            return;
        }
        if (key.return) {
            void submit();
        }
    }
    async function submit() {
        setError(null);
        setNotice(null);
        if (step === "run-mode") {
            const selectedOption = RUN_MODE_OPTIONS[runModeSelectionIndex] ?? RUN_MODE_OPTIONS[0];
            setSelectedMode(selectedOption.id);
            setRunModeSelectionIndex(getRunModeSelectionIndex(selectedOption.id));
            setInput("");
            const nextOnboardingConfig = ensureRunModeConfig(onboardingConfig, selectedOption.id);
            if (nextOnboardingConfig !== onboardingConfig) {
                await saveConfig(nextOnboardingConfig);
            }
            const nextStep = getInitialStep(modelIdOverride, provider, nextOnboardingConfig, selectedOption.id, false);
            if (nextStep) {
                setStep(nextStep);
                return;
            }
            await completeSetup({
                nextApiKey: apiKey,
                nextBaseUrl: baseUrl,
                nextLangSmithKey: langSmithKey,
                nextModelId: modelId,
                nextOAuthTokens: oauthTokens,
                nextProvider: provider,
                runMode: selectedOption.id,
            });
            return;
        }
        if (step === "code-repo-confirm") {
            const selectedOption = CODE_REPO_OPTIONS[codeRepoSelectionIndex] ?? CODE_REPO_OPTIONS[0];
            if (selectedOption === "Edit path") {
                setInput(codeRepoRoot);
                setStep("code-repo-path");
                return;
            }
            setCodeRepoConfirmed(true);
            continueAfterCodeRepoConfirmed(codeRepoRoot);
            return;
        }
        if (step === "code-repo-path") {
            try {
                const repoRoot = await validateLocalDirectoryPath(input);
                setCodeRepoRoot(repoRoot);
                setCodeRepoConfirmed(true);
                setInput("");
                continueAfterCodeRepoConfirmed(repoRoot);
            }
            catch (pathError) {
                setError(getErrorMessage(pathError));
            }
            return;
        }
        if (step === "provider") {
            const selectedProvider = SELECTABLE_OPENWIKI_PROVIDERS[providerSelectionIndex] ??
                DEFAULT_PROVIDER;
            setProvider(selectedProvider);
            setProviderSelectionIndex(getProviderSelectionIndex(selectedProvider));
            setModelSelectionIndex(getModelSelectionIndex(selectedProvider, getDefaultModelId(selectedProvider)));
            setInput("");
            const providerChanged = process.env[OPENWIKI_PROVIDER_ENV_KEY] !== selectedProvider;
            setForceModelStep(providerChanged);
            const nextStep = getNextStepAfterProvider(selectedProvider, modelIdOverride, onboardingConfig, selectedMode, providerChanged);
            if (nextStep) {
                setIsCustomModelInput(nextStep === "model" &&
                    shouldStartWithCustomModelInput(selectedProvider));
                setStep(nextStep);
                return;
            }
            await completeSetup({
                nextApiKey: apiKey,
                nextBaseUrl: baseUrl,
                nextLangSmithKey: langSmithKey,
                nextModelId: modelId,
                nextOAuthTokens: oauthTokens,
                nextProvider: selectedProvider,
                runMode: selectedMode,
            });
            return;
        }
        if (step === "api-key") {
            const trimmedInput = input.trim();
            if (trimmedInput.length === 0) {
                setError(`${getProviderApiKeyEnvKey(provider)} is required.`);
                return;
            }
            setApiKey(trimmedInput);
            setInput("");
            const nextStep = getNextStepAfterApiKey(provider, modelIdOverride, onboardingConfig, selectedMode, forceModelStep);
            if (nextStep) {
                setIsCustomModelInput(nextStep === "model" && shouldStartWithCustomModelInput(provider));
                setStep(nextStep);
                return;
            }
            await completeSetup({
                nextApiKey: trimmedInput,
                nextBaseUrl: baseUrl,
                nextLangSmithKey: langSmithKey,
                nextModelId: modelId,
                nextOAuthTokens: oauthTokens,
                nextProvider: provider,
                runMode: selectedMode,
            });
            return;
        }
        if (step === "base-url") {
            const trimmedInput = input.trim();
            if (trimmedInput.length === 0) {
                setError(`${getProviderBaseUrlEnvKey(provider) ?? "Base URL"} is required.`);
                return;
            }
            if (!isValidBaseUrl(trimmedInput)) {
                setError("Enter a valid http(s) base URL.");
                return;
            }
            setBaseUrl(trimmedInput);
            setInput("");
            const nextStep = getNextStepAfterBaseUrl(provider, modelIdOverride, onboardingConfig, selectedMode, forceModelStep);
            if (nextStep) {
                setIsCustomModelInput(nextStep === "model" && shouldStartWithCustomModelInput(provider));
                setStep(nextStep);
                return;
            }
            await completeSetup({
                nextApiKey: apiKey,
                nextBaseUrl: trimmedInput,
                nextLangSmithKey: langSmithKey,
                nextModelId: modelId,
                nextOAuthTokens: oauthTokens,
                nextProvider: provider,
                runMode: selectedMode,
            });
            return;
        }
        if (step === "model") {
            const selectedModelId = getSelectedModelId(provider, modelSelectionIndex, input, isCustomModelInput);
            if (!selectedModelId) {
                setError("Paste a valid model ID.");
                return;
            }
            if (selectedModelId === "custom") {
                setIsCustomModelInput(true);
                setInput("");
                return;
            }
            setModelId(selectedModelId);
            setInput("");
            setIsCustomModelInput(false);
            if (process.env.LANGSMITH_API_KEY === undefined) {
                setStep("langsmith");
                return;
            }
            await continueAfterCredentials({
                nextApiKey: apiKey,
                nextBaseUrl: baseUrl,
                nextLangSmithKey: langSmithKey,
                nextModelId: selectedModelId,
                nextOAuthTokens: oauthTokens,
                nextProvider: provider,
                runMode: selectedMode,
            });
            return;
        }
        if (step === "langsmith") {
            const nextLangSmithKey = input.trim();
            setLangSmithKey(nextLangSmithKey);
            setInput("");
            await continueAfterCredentials({
                nextApiKey: apiKey,
                nextBaseUrl: baseUrl,
                nextLangSmithKey,
                nextModelId: modelId,
                nextOAuthTokens: oauthTokens,
                nextProvider: provider,
                runMode: selectedMode,
            });
            return;
        }
        if (step === "wiki-goal") {
            const wikiGoal = input.trim();
            if (wikiGoal.length === 0) {
                setError("Describe what this wiki should understand.");
                return;
            }
            const nextConfig = {
                ...onboardingConfig,
                wikiGoal,
            };
            await saveConfigForCurrentMode(nextConfig);
            setInput("");
            if (isCodeMode(nextConfig)) {
                setStep("final");
                return;
            }
            setCronModeSelectionIndex(0);
            setCronFieldSelectionIndex(0);
            setCronReplaceCurrentField(true);
            setStep("global-cron-mode");
            return;
        }
        if (step === "template") {
            const selectedTemplate = ONBOARDING_TEMPLATES[templateSelectionIndex] ?? ONBOARDING_TEMPLATES[0];
            const nextConfig = {
                ...onboardingConfig,
                modeId: selectedTemplate.id,
                modeName: selectedTemplate.name,
                templateId: selectedTemplate.id,
                templateName: selectedTemplate.name,
            };
            await saveConfig(nextConfig);
            setInput(selectedTemplate.suggestedGoal);
            setStep("wiki-goal");
            return;
        }
        if (step === "source-menu") {
            if (sourceSelectionIndex >= activeSourceOptions.length) {
                if (getConnectedSourceCount(onboardingConfig, activeSourceOptions) > 0) {
                    setStep("final");
                    return;
                }
                setSourceContinueSelectionIndex(0);
                setStep("source-confirm-continue");
                return;
            }
            const source = activeSourceOptions[sourceSelectionIndex] ?? activeSourceOptions[0];
            const firstMissingSecretIndex = source.secretInputs.findIndex((secret) => needsEnvValue(secret));
            setSelectedSourceId(source.id);
            setSourceState({ secretValues: {} });
            setSourceDescriptionSelectionIndex(0);
            setSecretInputIndex(firstMissingSecretIndex === -1 ? 0 : firstMissingSecretIndex);
            setInput("");
            setCronModeSelectionIndex(0);
            setPowerModeSelectionIndex(0);
            setCronFieldSelectionIndex(0);
            setCronReplaceCurrentField(true);
            if (source.secretInputs.some((secretInput) => needsEnvValue(secretInput))) {
                setStep("source-secret");
                return;
            }
            continueAfterSourceCredentialSetup(source);
            return;
        }
        if (step === "source-secret") {
            const currentSecretInput = selectedSource.secretInputs[secretInputIndex];
            if (!currentSecretInput) {
                continueAfterSourceCredentialSetup(selectedSource);
                return;
            }
            const trimmedInput = input.trim();
            if (trimmedInput.length === 0 && !currentSecretInput.optional) {
                setError(`${currentSecretInput.envKey} is required.`);
                return;
            }
            const nextSecretValues = {
                ...sourceState.secretValues,
                ...(trimmedInput.length > 0
                    ? { [currentSecretInput.envKey]: trimmedInput }
                    : {}),
            };
            setSourceState((state) => ({
                ...state,
                secretValues: nextSecretValues,
            }));
            setInput("");
            const nextIndex = secretInputIndex + 1;
            const nextMissingIndex = selectedSource.secretInputs.findIndex((secretInput, index) => index >= nextIndex &&
                needsEnvValue(secretInput) &&
                nextSecretValues[secretInput.envKey] === undefined);
            if (nextMissingIndex !== -1) {
                setSecretInputIndex(nextMissingIndex);
                return;
            }
            await saveOpenWikiEnv(nextSecretValues);
            continueAfterSourceCredentialSetup(selectedSource);
            return;
        }
        if (step === "source-auth") {
            await authorizeSelectedSource();
            return;
        }
        if (step === "source-path") {
            const repoPath = normalizeLocalPath(input);
            if (repoPath.length === 0) {
                setError("Enter a local repository directory.");
                return;
            }
            try {
                const connectorConfig = await configureLocalGitRepo(repoPath);
                setSourceState((state) => ({ ...state, connectorConfig }));
                setInput("");
                setStep("source-description");
            }
            catch (setupError) {
                setError(getErrorMessage(setupError));
            }
            return;
        }
        if (step === "source-description") {
            if (sourceDescriptionSelectionIndex >= selectedSource.examples.length) {
                setInput("");
                setStep("source-description-custom");
                return;
            }
            const selectedExample = selectedSource.examples[sourceDescriptionSelectionIndex] ?? "";
            await saveSelectedSourceDescription(selectedExample);
            return;
        }
        if (step === "source-description-custom") {
            await saveSelectedSourceDescription(input.trim());
            return;
        }
        if (step === "global-cron-mode") {
            const selectedMode = CRON_MODE_OPTIONS[cronModeSelectionIndex];
            if (selectedMode === "Enter custom cron") {
                setInput(suggestedCronExpression);
                setCronFieldSelectionIndex(0);
                setCronReplaceCurrentField(true);
                setStep("global-cron-custom");
                return;
            }
            await saveModeSchedule(suggestedCronExpression);
            return;
        }
        if (step === "global-cron-custom") {
            const validation = validateCronExpression(input);
            if (!validation.valid) {
                setError(validation.error);
                return;
            }
            await saveModeSchedule(validation.expression);
            return;
        }
        if (step === "global-power-mode") {
            const selectedMode = POWER_MODE_OPTIONS[powerModeSelectionIndex];
            if (selectedMode === "Set up Mac wake/sleep window") {
                await saveGlobalMacPowerWindow();
                return;
            }
            setSourceSelectionIndex(0);
            setSourceState({ secretValues: {} });
            setInput("");
            setStep("source-menu");
            return;
        }
        if (step === "source-confirm-continue") {
            const selectedAction = SOURCE_CONTINUE_OPTIONS[sourceContinueSelectionIndex];
            if (selectedAction === "Go back to connections") {
                returnToSourceMenu();
                setStep("source-menu");
                return;
            }
            setStep("final");
            return;
        }
        if (step === "final") {
            const runIngestionNow = FINAL_OPTIONS[finalSelectionIndex] === "Run ingestion now";
            const nextConfig = {
                ...onboardingConfig,
                completedAt: new Date().toISOString(),
            };
            await saveConfigForCurrentMode(nextConfig);
            onComplete({
                mode: selectedMode,
                modelId: modelId ??
                    modelIdOverride ??
                    process.env[OPENWIKI_MODEL_ID_ENV_KEY] ??
                    null,
                onboardingCompleted: true,
                provider,
                repoRoot: selectedMode === "code" && codeRepoConfirmed
                    ? codeRepoRoot
                    : undefined,
                runIngestionNow,
                savedApiKey: apiKey !== null || oauthTokens !== null,
                savedBaseUrl: baseUrl !== null,
                savedLangSmithKey: langSmithKey !== null && langSmithKey.length > 0,
                savedModelId: modelId !== null,
                savedProvider: process.env[OPENWIKI_PROVIDER_ENV_KEY] !== provider,
                shouldContinueToRun: runIngestionNow,
            });
        }
    }
    async function saveSelectedSourceDescription(description) {
        const connectorConfig = selectedSourceId === "web-search" || selectedSourceId === "hackernews"
            ? getStaticSourceConfig(selectedSourceId, description)
            : sourceState.connectorConfig;
        const sourceInstanceId = createSourceInstanceId(selectedSourceId, onboardingConfig);
        const sourceInstance = {
            connectedAt: new Date().toISOString(),
            connectorConfig,
            connectorId: selectedSourceId,
            id: sourceInstanceId,
            ingestionGoal: description.length > 0 ? description : undefined,
            name: createSourceInstanceName(selectedSource, description, onboardingConfig),
        };
        const nextConfig = addSourceInstanceConfig(onboardingConfig, sourceInstance);
        await saveConfig(nextConfig);
        setSourceState((state) => ({
            ...state,
            connectorConfig,
        }));
        setInput("");
        returnToSourceMenu();
    }
    async function continueAfterCredentials(options) {
        await saveCredentialUpdates(options);
        if (options.runMode === "code" && !isOnboardingComplete(onboardingConfig)) {
            setCodeRepoRoot(getDefaultCodeRepoRootPath());
            setCodeRepoSelectionIndex(0);
            setStep("code-repo-confirm");
            return;
        }
        if (!getConfigModeId(onboardingConfig)) {
            setStep("template");
            return;
        }
        if (!onboardingConfig.wikiGoal) {
            setInput(getTemplateGoal(getConfigModeId(onboardingConfig)));
            setStep("wiki-goal");
            return;
        }
        if (!onboardingConfig.ingestionSchedule) {
            setCronModeSelectionIndex(0);
            setStep("global-cron-mode");
            return;
        }
        if (!isOnboardingComplete(onboardingConfig)) {
            setStep("source-menu");
            return;
        }
        await completeSetup(options);
    }
    function continueAfterCodeRepoConfirmed(repoRoot) {
        if (!onboardingConfig.wikiGoal) {
            setInput(getTemplateGoal(getConfigModeId(onboardingConfig)));
            setStep("wiki-goal");
            return;
        }
        setCodeRepoRoot(repoRoot);
        setStep("final");
    }
    async function completeSetup(options) {
        await saveCredentialUpdates(options);
        onComplete({
            modelId: options.nextModelId ??
                modelIdOverride ??
                process.env[OPENWIKI_MODEL_ID_ENV_KEY] ??
                null,
            onboardingCompleted: isOnboardingComplete(onboardingConfig),
            provider: options.nextProvider,
            repoRoot: options.runMode === "code" && codeRepoConfirmed
                ? codeRepoRoot
                : undefined,
            mode: options.runMode,
            runIngestionNow: false,
            savedApiKey: options.nextApiKey !== null || options.nextOAuthTokens != null,
            savedBaseUrl: options.nextBaseUrl !== null,
            savedLangSmithKey: options.nextLangSmithKey !== null &&
                options.nextLangSmithKey.length > 0,
            savedModelId: options.nextModelId !== null,
            savedProvider: process.env[OPENWIKI_PROVIDER_ENV_KEY] !== options.nextProvider,
            shouldContinueToRun: true,
        });
    }
    async function saveCredentialUpdates({ nextApiKey, nextBaseUrl, nextLangSmithKey, nextModelId, nextOAuthTokens = oauthTokens, nextProvider, }) {
        setIsSaving(true);
        try {
            const updates = {};
            if (process.env[OPENWIKI_PROVIDER_ENV_KEY] !== nextProvider) {
                updates[OPENWIKI_PROVIDER_ENV_KEY] = nextProvider;
            }
            if (nextApiKey !== null) {
                updates[getProviderApiKeyEnvKey(nextProvider)] = nextApiKey;
            }
            if (nextOAuthTokens) {
                Object.assign(updates, codexTokensToEnv(nextOAuthTokens));
            }
            if (nextBaseUrl !== null) {
                const baseUrlEnvKey = getProviderBaseUrlEnvKey(nextProvider);
                if (baseUrlEnvKey) {
                    updates[baseUrlEnvKey] = nextBaseUrl;
                }
            }
            if (nextModelId !== null) {
                updates[OPENWIKI_MODEL_ID_ENV_KEY] = nextModelId;
            }
            if (nextLangSmithKey !== null) {
                updates.LANGSMITH_API_KEY = nextLangSmithKey;
                if (nextLangSmithKey.length > 0) {
                    updates.LANGCHAIN_PROJECT = "openwiki";
                    updates.LANGCHAIN_TRACING_V2 = "true";
                }
                else {
                    // Blank input must act as an off switch: without this, a
                    // LANGCHAIN_TRACING_V2=true saved by an earlier setup stays in
                    // ~/.openwiki/.env and tracing silently remains enabled.
                    updates.LANGCHAIN_TRACING_V2 = "false";
                }
            }
            if (Object.keys(updates).length > 0) {
                await saveOpenWikiEnv(updates);
            }
        }
        catch (saveError) {
            onError(getErrorMessage(saveError));
        }
        finally {
            setIsSaving(false);
        }
    }
    async function authorizeSelectedSource() {
        setIsAuthRunning(true);
        setError(null);
        setNotice(null);
        try {
            if (selectedSource.id === "git-repo") {
                await configureLocalGitRepo();
            }
            else if (selectedSource.authProvider) {
                const authResult = await runOAuthAuth(selectedSource.authProvider, {
                    onAuthorizationUrl: ({ copiedToClipboard, openedBrowser, url }) => {
                        setSourceState((state) => ({
                            ...state,
                            authUrl: url,
                            copiedAuthUrlToClipboard: copiedToClipboard,
                        }));
                        setNotice(openedBrowser
                            ? "Opened browser for authorization. Complete the flow to continue."
                            : copiedToClipboard
                                ? "Open the authorization URL from your clipboard to continue."
                                : "Open the authorization URL below to continue.");
                    },
                    silent: true,
                });
                await configureAuthProvider(authResult.provider, { force: false });
            }
            setInput("");
            setStep("source-description");
        }
        catch (authError) {
            setError(getErrorMessage(authError));
        }
        finally {
            setIsAuthRunning(false);
        }
    }
    function continueAfterSourceCredentialSetup(source) {
        if (source.authProvider) {
            setStep("source-auth");
            return;
        }
        try {
            if (source.id === "git-repo") {
                setInput(getDefaultLocalGitRepoPath());
                setStep("source-path");
                return;
            }
            else if (source.id === "web-search" || source.id === "hackernews") {
                setSourceState((state) => ({
                    ...state,
                    connectorConfig: getStaticSourceConfig(source.id, ""),
                }));
            }
            setStep("source-description");
        }
        catch (setupError) {
            setError(getErrorMessage(setupError));
        }
    }
    function returnToSourceMenu() {
        setSourceSelectionIndex(activeSourceOptions.length);
        setSourceState({ secretValues: {} });
        setInput("");
        setStep("source-menu");
    }
    async function configureLocalGitRepo(repoPathInput = getDefaultLocalGitRepoPath()) {
        const sourceId = "git-repo";
        const repoPath = normalizeLocalPath(repoPathInput);
        const repoId = sanitizeRepoId(path.basename(repoPath) || "repo");
        const configPath = getConnectorConfigPath(sourceId);
        const connectorConfig = {
            repos: [
                {
                    id: repoId,
                    path: repoPath,
                },
            ],
        };
        await import("node:fs/promises").then(async ({ chmod, mkdir, stat, writeFile }) => {
            const repoStat = await stat(repoPath);
            if (!repoStat.isDirectory()) {
                throw new Error(`${repoPath} is not a directory.`);
            }
            await mkdir(path.dirname(configPath), {
                recursive: true,
                mode: 0o700,
            });
            await writeFile(configPath, `${JSON.stringify(connectorConfig, null, 2)}\n`, {
                encoding: "utf8",
                mode: 0o600,
            });
            await chmod(configPath, 0o600);
        });
        return connectorConfig;
    }
    async function saveModeSchedule(cronExpression) {
        setIsSaving(true);
        try {
            const result = await installConnectorSchedule({
                connectorId: "git-repo",
                cronExpression,
                cwd: process.cwd(),
            });
            const nextConfig = {
                ...onboardingConfig,
                ingestionSchedule: {
                    description: result.description,
                    expression: result.expression,
                    launchAgentPath: result.launchAgentPath,
                    updatedAt: new Date().toISOString(),
                    warning: result.warning,
                },
            };
            await saveConfig(nextConfig);
            setSourceState((state) => ({
                ...state,
                savedScheduleWarning: result.warning,
            }));
            setPowerModeSelectionIndex(0);
            setStep("global-power-mode");
        }
        catch (scheduleError) {
            setError(getErrorMessage(scheduleError));
        }
        finally {
            setIsSaving(false);
        }
    }
    async function saveGlobalMacPowerWindow() {
        setIsSaving(true);
        try {
            const configForPower = await readOpenWikiOnboardingConfig();
            const result = await installOpenWikiPowerSchedule(configForPower);
            const nextConfig = {
                ...configForPower,
                powerManagement: {
                    ...configForPower.powerManagement,
                    pmset: {
                        days: result.days,
                        enabled: result.enabled,
                        sleepTime: result.sleepTime,
                        updatedAt: new Date().toISOString(),
                        wakeTime: result.wakeTime,
                        warning: result.warning,
                    },
                },
            };
            await saveConfig(nextConfig);
            setSourceSelectionIndex(0);
            setSourceState({
                secretValues: {},
                savedScheduleWarning: result.warning,
            });
            setInput("");
            setStep("source-menu");
        }
        catch (powerError) {
            setError(getErrorMessage(powerError));
        }
        finally {
            setIsSaving(false);
        }
    }
    async function saveConfig(config) {
        setIsSaving(true);
        try {
            await saveOpenWikiOnboardingConfig(config);
            setOnboardingConfig(config);
        }
        catch (saveError) {
            onError(getErrorMessage(saveError));
        }
        finally {
            setIsSaving(false);
        }
    }
    async function saveConfigForCurrentMode(config) {
        if (!isCodeMode(config)) {
            await saveConfig(config);
            return;
        }
        setIsSaving(true);
        try {
            if (config.wikiGoal?.trim()) {
                await saveRepositoryWikiInstructions(codeRepoRoot, config.wikiGoal);
            }
            await saveOpenWikiOnboardingConfig({
                ...config,
                wikiGoal: undefined,
            });
            setOnboardingConfig(config);
        }
        catch (saveError) {
            onError(getErrorMessage(saveError));
        }
        finally {
            setIsSaving(false);
        }
    }
    function submitManualLogin(pasted) {
        const handle = loginHandleRef.current;
        if (!handle) {
            setError("Login is still starting. Try again in a moment.");
            return;
        }
        const errorMessage = handle.submitManual(pasted);
        if (errorMessage) {
            setError(errorMessage);
            return;
        }
        setInput("");
        setError(null);
    }
    const needsCredentialPrompt = !hasValidConfiguredProvider() ||
        needsCredentialStep(provider) ||
        needsBaseUrlStep(provider) ||
        (modelIdOverride === null &&
            process.env[OPENWIKI_MODEL_ID_ENV_KEY] === undefined) ||
        process.env.LANGSMITH_API_KEY === undefined;
    return (_jsxs(Box, { flexDirection: "column", children: [_jsx(SetupHeader, {}), _jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [_jsx(SetupStep, { label: "Provider", state: hasValidConfiguredProvider()
                            ? "done"
                            : step === "provider"
                                ? "current"
                                : "pending", detail: getProviderSetupDetail(provider) }), _jsx(SetupStep, { label: providerUsesOAuth(provider)
                            ? "ChatGPT login"
                            : "Provider credential", state: isCredentialConfigured(provider) || oauthTokens
                            ? "done"
                            : step === credentialStep(provider)
                                ? "current"
                                : "pending", detail: getCredentialSetupDetail(provider, oauthTokens) }), providerRequiresBaseUrl(provider) ? (_jsx(SetupStep, { label: "Base URL", state: isBaseUrlConfigured(provider)
                            ? "done"
                            : step === "base-url"
                                ? "current"
                                : "pending", detail: isBaseUrlConfigured(provider)
                            ? "available from environment"
                            : `save ${getProviderBaseUrlEnvKey(provider)} to ${openWikiEnvPath}` })) : null, _jsx(SetupStep, { label: "Model", state: modelIdOverride || process.env[OPENWIKI_MODEL_ID_ENV_KEY]
                            ? "done"
                            : step === "model"
                                ? "current"
                                : "pending", detail: getModelSetupDetail(modelIdOverride, provider) }), _jsx(SetupStep, { label: "LangSmith", state: process.env.LANGSMITH_API_KEY !== undefined
                            ? "done"
                            : step === "langsmith"
                                ? "current"
                                : "optional", detail: process.env.LANGSMITH_API_KEY !== undefined
                            ? "available from environment"
                            : "optional tracing key" }), _jsx(SetupStep, { label: "Run mode", state: allowModeSelection
                            ? step === "run-mode"
                                ? "current"
                                : "done"
                            : "done", detail: getRunModeName(selectedMode) }), selectedMode === "personal" ? (_jsx(SetupStep, { label: "Personal profile", state: onboardingConfig.templateId
                            ? "done"
                            : step === "template"
                                ? "current"
                                : "pending", detail: getConfigModeName(onboardingConfig) ?? "choose a profile" })) : null, _jsx(SetupStep, { label: "Wiki scope", state: selectedMode === "code"
                            ? "done"
                            : onboardingConfig.wikiGoal
                                ? "done"
                                : step === "wiki-goal"
                                    ? "current"
                                    : "pending", detail: selectedMode === "code"
                            ? "repository openwiki/"
                            : onboardingConfig.wikiGoal
                                ? "saved"
                                : `save onboarding profile to ${openWikiOnboardingPath}` }), selectedMode === "personal" ? (_jsx(SetupStep, { label: "Schedule", state: onboardingConfig.ingestionSchedule
                            ? "done"
                            : isScheduleStep(step)
                                ? "current"
                                : "pending", detail: onboardingConfig.ingestionSchedule
                            ? onboardingConfig.ingestionSchedule.description
                            : "choose one time for all ingestion" })) : null, selectedMode === "personal" ? (_jsx(SetupStep, { label: "Sources", state: getConnectedSourceCount(onboardingConfig, activeSourceOptions) > 0
                            ? "done"
                            : isSourceStep(step)
                                ? "current"
                                : "pending", detail: `${getConnectedSourceCount(onboardingConfig, activeSourceOptions)} setup(s) configured` })) : null] }), step === "oauth-login" ? (_jsx(OAuthLoginPrompt, { copied: copied, input: input, isLoggingIn: isLoggingIn, loginUrl: loginUrl, provider: provider })) : (_jsx(SetupPanel, { title: "Prompt", children: step ? (_jsx(Prompt, { codeRepoRoot: codeRepoRoot, codeRepoSelectionIndex: codeRepoSelectionIndex, cronFieldSelectionIndex: cronFieldSelectionIndex, cronModeSelectionIndex: cronModeSelectionIndex, finalSelectionIndex: finalSelectionIndex, input: input, inputDisplayWidth: inputDisplayWidth, isCustomModelInput: isCustomModelInput, modelSelectionIndex: modelSelectionIndex, onboardingConfig: onboardingConfig, powerModeSelectionIndex: powerModeSelectionIndex, provider: provider, providerSelectionIndex: providerSelectionIndex, runModeSelectionIndex: runModeSelectionIndex, secretInputIndex: secretInputIndex, selectedMode: selectedMode, selectedSource: selectedSource, sourceOptions: activeSourceOptions, sourceContinueSelectionIndex: sourceContinueSelectionIndex, sourceDescriptionSelectionIndex: sourceDescriptionSelectionIndex, sourceSelectionIndex: sourceSelectionIndex, sourceState: sourceState, step: step, suggestedCronDescription: suggestedCronDescription, suggestedCronExpression: suggestedCronExpression, templateSelectionIndex: templateSelectionIndex })) : (_jsx(Text, { children: "Inspecting OpenWiki setup..." })) })), needsCredentialPrompt ? (_jsx(Text, { color: "gray", children: "Secrets are masked and saved only after setup." })) : null, notice ? (_jsx(SetupPanel, { title: "Status", children: _jsx(Text, { color: "cyan", children: notice }) })) : null, error ? (_jsx(SetupPanel, { title: "Error", children: _jsx(Text, { color: "red", children: error }) })) : null, sourceState.savedScheduleWarning ? (_jsx(SetupPanel, { title: "Schedule note", children: _jsx(Text, { color: "yellow", children: sourceState.savedScheduleWarning }) })) : null, isSaving ? (_jsx(SetupPanel, { title: "Saving", children: _jsx(Text, { children: "Writing OpenWiki setup..." }) })) : null, isAuthRunning ? (_jsx(SetupPanel, { title: "Authorization", children: _jsx(Text, { children: "Waiting for the browser authorization callback..." }) })) : null] }));
}
function Prompt({ codeRepoRoot, codeRepoSelectionIndex, cronFieldSelectionIndex, cronModeSelectionIndex, finalSelectionIndex, input, inputDisplayWidth, isCustomModelInput, modelSelectionIndex, onboardingConfig, powerModeSelectionIndex, provider, providerSelectionIndex, runModeSelectionIndex, secretInputIndex, selectedMode, selectedSource, sourceOptions, sourceContinueSelectionIndex, sourceDescriptionSelectionIndex, sourceSelectionIndex, sourceState, step, suggestedCronDescription, suggestedCronExpression, templateSelectionIndex, }) {
    if (step === "run-mode") {
        const selectedMode = RUN_MODE_OPTIONS[runModeSelectionIndex] ?? RUN_MODE_OPTIONS[0];
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: "Choose what OpenWiki should initialize." }), RUN_MODE_OPTIONS.map((option, index) => (_jsxs(Text, { children: [_jsx(SelectionMarker, { isSelected: index === runModeSelectionIndex }), " ", option.name, " ", _jsxs(Text, { color: "gray", children: ["(", option.id, ")"] })] }, option.id))), _jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { bold: true, children: selectedMode.name }), _jsx(Text, { color: "gray", children: selectedMode.description })] }), _jsx(Text, { color: "gray", children: "Use up/down arrows, then press Enter." })] }));
    }
    if (step === "provider") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: "Choose a model provider." }), SELECTABLE_OPENWIKI_PROVIDERS.map((providerOption, index) => (_jsxs(Text, { children: [_jsx(SelectionMarker, { isSelected: index === providerSelectionIndex }), " ", getProviderLabel(providerOption), _jsxs(Text, { color: "gray", children: [" (", providerOption, ")"] }), providerOption === DEFAULT_PROVIDER ? (_jsx(Text, { color: "gray", children: " default" })) : null] }, providerOption))), _jsx(Text, { color: "gray", children: "Use up/down arrows, then press Enter." })] }));
    }
    if (step === "api-key") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { children: ["Paste your ", getProviderLabel(provider), " API key."] }), provider === "anthropic" ? (_jsx(Text, { color: "gray", children: "For bearer OAuth, set ANTHROPIC_AUTH_TOKEN or CLAUDE_CODE_OAUTH_TOKEN before starting OpenWiki." })) : null, _jsx(BorderedInput, { maxDisplayWidth: inputDisplayWidth, marginTop: 1, prefix: `${getProviderApiKeyEnvKey(provider)}=`, secret: true, value: input }), _jsx(Text, { color: "gray", children: "Press Enter to save it." })] }));
    }
    if (step === "base-url") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { children: ["Enter the ", getProviderLabel(provider), " base URL."] }), _jsxs(Text, { children: [_jsx(Text, { color: "gray", children: "$" }), " ", getProviderBaseUrlEnvKey(provider), "=", " ", _jsx(Text, { color: "yellow", children: input })] }), _jsx(Text, { color: "gray", children: "For example an OpenAI-compatible gateway endpoint (such as a LiteLLM gateway). Press Enter to save it." })] }));
    }
    if (step === "model") {
        if (isCustomModelInput) {
            return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: "Paste a custom model ID." }), _jsx(BorderedInput, { maxDisplayWidth: inputDisplayWidth, marginTop: 1, prefix: `${OPENWIKI_MODEL_ID_ENV_KEY}=`, value: input }), _jsx(Text, { color: "gray", children: "Press Enter to save it." })] }));
        }
        return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { children: ["Choose ", getProviderArticle(provider), " ", getProviderLabel(provider), " ", "model."] }), getModelSelectionOptions(provider).map((option, index) => {
                    if (option.kind === "custom") {
                        return (_jsxs(Text, { children: [_jsx(SelectionMarker, { isSelected: index === modelSelectionIndex }), " ", "Custom model ID"] }, "custom"));
                    }
                    return (_jsxs(Text, { children: [_jsx(SelectionMarker, { isSelected: index === modelSelectionIndex }), " ", option.label, " ", _jsx(Text, { color: "gray", children: option.id }), option.id === getDefaultModelId(provider) ? (_jsx(Text, { color: "gray", children: " default" })) : null] }, option.id));
                }), _jsx(Text, { color: "gray", children: "Use up/down arrows, then press Enter." })] }));
    }
    if (step === "langsmith") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: "Optional: paste a LangSmith API key for tracing." }), _jsx(BorderedInput, { maxDisplayWidth: inputDisplayWidth, marginTop: 1, prefix: "LANGSMITH_API_KEY optional=", secret: true, value: input }), _jsx(Text, { color: "gray", children: "Press Enter with an empty value to skip." })] }));
    }
    if (step === "template") {
        const selectedTemplate = ONBOARDING_TEMPLATES[templateSelectionIndex] ?? ONBOARDING_TEMPLATES[0];
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: "Choose how OpenWiki should run." }), ONBOARDING_TEMPLATES.map((template, index) => (_jsxs(Text, { children: [_jsx(SelectionMarker, { isSelected: index === templateSelectionIndex }), " ", template.name] }, template.id))), _jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { bold: true, children: selectedTemplate.name }), _jsx(Text, { color: "gray", children: selectedTemplate.description }), selectedTemplate.suggestedSources.length > 0 ? (_jsxs(Text, { color: "gray", children: ["Suggested sources: ", selectedTemplate.suggestedSources.join(", ")] })) : (_jsx(Text, { color: "gray", children: "Start from a blank wiki brief." }))] }), _jsx(Text, { color: "gray", children: "Press Enter, then edit the brief on the next step." })] }));
    }
    if (step === "wiki-goal") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: "Customize what this wiki should understand." }), getConfigModeName(onboardingConfig) ? (_jsxs(Text, { color: "gray", children: ["Mode: ", getConfigModeName(onboardingConfig)] })) : null, _jsx(Text, { color: "gray", children: "Edit the brief below. Keep what is useful, delete what is not." }), _jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { bold: true, children: "Edit wiki brief" }), _jsx(BorderedMultilineInput, { maxDisplayWidth: inputDisplayWidth, value: input })] }), _jsx(Text, { color: "gray", children: "Press Enter to continue." })] }));
    }
    if (step === "code-repo-confirm") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: "Use this repository?" }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { color: "cyan", children: codeRepoRoot }) }), _jsx(Text, { color: "gray", children: "OpenWiki will run in this directory and write the initial openwiki/ folder there." }), _jsx(Box, { flexDirection: "column", marginTop: 1, children: CODE_REPO_OPTIONS.map((option, index) => (_jsxs(Text, { children: [_jsx(SelectionMarker, { isSelected: index === codeRepoSelectionIndex }), " ", option] }, option))) }), _jsx(Text, { color: "gray", children: "Use up/down arrows, then press Enter." })] }));
    }
    if (step === "code-repo-path") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: "Choose the repository directory." }), _jsx(Text, { color: "gray", children: "Enter an existing directory. OpenWiki will write openwiki/ there." }), _jsx(BorderedInput, { maxDisplayWidth: inputDisplayWidth, marginTop: 1, prefix: "path=", value: input }), _jsx(Text, { color: "gray", children: "Press Enter to confirm this path." })] }));
    }
    if (step === "source-menu") {
        const configuredCount = getConnectedSourceCount(onboardingConfig, sourceOptions);
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: "Configure sources for this mode." }), sourceOptions.map((source, index) => {
                    const sourceInstances = getSourceInstances(onboardingConfig, source.id);
                    return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { children: [_jsx(SelectionMarker, { isSelected: index === sourceSelectionIndex }), " ", getSourceMenuLabel(source, sourceInstances.length), " ", _jsx(SourceConnectionStatus, { count: sourceInstances.length, isConfigured: sourceInstances.length > 0 })] }), sourceInstances.map((sourceInstance) => (_jsxs(Text, { color: "gray", children: ["  ", "- ", sourceInstance.name ?? sourceInstance.id, " ", _jsxs(Text, { color: "gray", children: ["(", sourceInstance.id, ")"] })] }, sourceInstance.id)))] }, source.id));
                }), _jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { color: "gray", children: "Next" }), _jsxs(Text, { children: [_jsx(SelectionMarker, { isSelected: sourceSelectionIndex === sourceOptions.length }), " ", "Continue", " ", configuredCount === 0 ? (_jsx(Text, { color: "gray", children: "(no sources configured)" })) : null] })] }), _jsx(Text, { color: "gray", children: "Use up/down arrows, then press Enter." })] }));
    }
    if (step === "source-path") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: "Choose the local Git repository directory." }), _jsx(Text, { color: "gray", children: "Default is the directory where you started OpenWiki. Edit it to use a different checkout." }), _jsx(BorderedInput, { maxDisplayWidth: inputDisplayWidth, marginTop: 1, prefix: "path=", value: input }), _jsx(Text, { color: "gray", children: "Press Enter to save this source." })] }));
    }
    if (step === "source-secret") {
        const secretInput = selectedSource.secretInputs[secretInputIndex];
        return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { children: [selectedSource.displayName, " setup"] }), selectedSource.instructions.map((instruction, index) => (_jsxs(Text, { children: [index + 1, ". ", instruction] }, instruction))), secretInput ? (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { bold: true, children: "Enter credential" }), _jsx(BorderedInput, { maxDisplayWidth: inputDisplayWidth, prefix: `${secretInput.envKey}${secretInput.optional ? " optional" : ""}=`, secret: true, value: input }), _jsx(Text, { color: "gray", children: secretInput.optional
                                ? "Press Enter with an empty value to skip."
                                : "Press Enter to save this value." })] })) : null] }));
    }
    if (step === "source-auth") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { children: [selectedSource.displayName, " authorization"] }), sourceState.authUrl ? (_jsx(OAuthAuthorizationLink, { copiedToClipboard: Boolean(sourceState.copiedAuthUrlToClipboard), url: sourceState.authUrl })) : (_jsx(Text, { color: "gray", children: "Press Enter to open the authorization URL and wait for the callback." }))] }));
    }
    if (step === "source-description") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: getSourceDescriptionPrompt(selectedSource) }), _jsx(Text, { color: "gray", children: "Choose an example description, or write your own." }), selectedSource.examples.map((example, index) => (_jsxs(Text, { children: [_jsx(SelectionMarker, { isSelected: index === sourceDescriptionSelectionIndex }), " ", example] }, example))), _jsxs(Text, { children: [_jsx(SelectionMarker, { isSelected: sourceDescriptionSelectionIndex >= selectedSource.examples.length }), " ", "Custom description"] }), _jsx(Text, { color: "gray", children: "Use up/down arrows, then press Enter." })] }));
    }
    if (step === "source-description-custom") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: getSourceDescriptionPrompt(selectedSource) }), _jsx(Text, { color: "gray", children: "Type what OpenWiki should focus on for this source." }), _jsx(BorderedMultilineInput, { maxDisplayWidth: inputDisplayWidth, marginTop: 1, value: input }), _jsx(Text, { color: "gray", children: "Optional. Press Enter to continue." })] }));
    }
    if (step === "global-cron-mode") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: isCodeMode(onboardingConfig)
                        ? "When should GitHub Actions refresh this code wiki?"
                        : "When should OpenWiki run all ingestion?" }), _jsx(Text, { color: "gray", children: isCodeMode(onboardingConfig)
                        ? "OpenWiki will write a scheduled GitHub Actions workflow for this repository."
                        : "All configured sources run sequentially at this time." }), _jsxs(Text, { color: "gray", children: ["Suggested: ", suggestedCronDescription] }), CRON_MODE_OPTIONS.map((option, index) => (_jsxs(Text, { children: [_jsx(SelectionMarker, { isSelected: index === cronModeSelectionIndex }), " ", option] }, option))), _jsx(Text, { color: "gray", children: "Use up/down arrows, then press Enter." })] }));
    }
    if (step === "global-cron-custom") {
        const validation = validateCronExpression(input);
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: isCodeMode(onboardingConfig)
                        ? "Enter one GitHub Actions cron schedule for this code wiki."
                        : "Enter one cron schedule for all ingestion." }), _jsx(SegmentedCronInput, { activeFieldIndex: cronFieldSelectionIndex, expression: input, fallbackExpression: suggestedCronExpression, maxDisplayWidth: inputDisplayWidth }), input ? (_jsx(Text, { color: validation.valid ? "cyan" : "red", children: validation.valid ? validation.description : validation.error })) : (_jsx(Text, { color: "gray", children: "Example: 0 2 * * *" })), _jsx(Text, { color: "gray", children: "Type in each field. Use right/left arrows or Tab to move; spaces also move fields." }), _jsx(Text, { color: "gray", children: "Press Enter to save a valid schedule." })] }));
    }
    if (step === "global-power-mode") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: "Keep your Mac awake for scheduled refreshes?" }), _jsx(Text, { color: "gray", children: "OpenWiki can use macOS pmset to wake 2 minutes before the shared ingestion schedule and sleep 30 minutes after it." }), sourceState.savedScheduleWarning ? (_jsx(Text, { color: "yellow", children: sourceState.savedScheduleWarning })) : null, _jsx(Box, { flexDirection: "column", marginTop: 1, children: POWER_MODE_OPTIONS.map((option, index) => (_jsxs(Text, { children: [_jsx(SelectionMarker, { isSelected: index === powerModeSelectionIndex }), " ", option] }, option))) }), _jsx(Text, { color: "gray", children: "macOS has one global repeat power schedule. Setting this can replace an existing pmset repeat wake/sleep schedule." })] }));
    }
    if (step === "source-confirm-continue") {
        const missingSources = sourceOptions.filter((source) => getSourceInstanceCount(onboardingConfig, source.id) === 0);
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: "Some sources for this mode are not configured yet." }), missingSources.map((source) => (_jsxs(Text, { color: "gray", children: ["- ", source.displayName] }, source.id))), _jsx(Box, { flexDirection: "column", marginTop: 1, children: SOURCE_CONTINUE_OPTIONS.map((option, index) => (_jsxs(Text, { children: [_jsx(SelectionMarker, { isSelected: index === sourceContinueSelectionIndex }), " ", option] }, option))) }), _jsx(Text, { color: "gray", children: "Use up/down arrows, then press Enter." })] }));
    }
    if (step === "final") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: "Setup is complete." }), FINAL_OPTIONS.map((option, index) => {
                    const label = getFinalOptionLabel(option, selectedMode);
                    return (_jsxs(Text, { children: [_jsx(SelectionMarker, { isSelected: index === finalSelectionIndex }), " ", label] }, option));
                }), _jsx(Text, { color: "gray", children: selectedMode === "code"
                        ? "Run now writes the initial openwiki/ directory. Open chat skips the initial run."
                        : "Run now executes one source-specific ingestion and wiki update per configured source. Run later opens chat so you can start ingestion when you are ready." })] }));
    }
    return null;
}
function SetupHeader() {
    return (_jsxs(Box, { borderStyle: "round", borderColor: "cyan", flexDirection: "column", marginBottom: 1, paddingX: 1, children: [_jsxs(Text, { children: [_jsx(Text, { bold: true, color: "cyan", children: "OpenWiki" }), " ", _jsx(Text, { color: "gray", children: "first-run setup" })] }), _jsx(Text, { children: "Configure the model, wiki scope, and sources." })] }));
}
function SetupStep({ detail, label, state, }) {
    const color = state === "done"
        ? "green"
        : state === "current"
            ? "yellow"
            : state === "optional"
                ? "cyan"
                : "gray";
    return (_jsxs(Text, { children: [_jsxs(Text, { color: color, children: ["[", state.toUpperCase(), "]"] }), " ", _jsx(Text, { bold: true, children: label.padEnd(16) }), " ", _jsx(Text, { color: "gray", children: detail })] }));
}
function SetupPanel({ children, title, }) {
    return (_jsxs(Box, { borderStyle: "single", borderColor: "gray", flexDirection: "column", marginTop: 1, paddingX: 1, children: [_jsx(Text, { bold: true, color: "cyan", children: title }), children] }));
}
function SelectionMarker({ isSelected }) {
    return (_jsx(Text, { color: isSelected ? "cyan" : "gray", children: isSelected ? ">" : " " }));
}
function SourceConnectionStatus({ count, isConfigured, }) {
    return (_jsx(Text, { color: isConfigured ? "green" : "gray", children: isConfigured
            ? `[configured${count > 1 ? ` x${count}` : ""}]`
            : "[not configured]" }));
}
function OAuthAuthorizationLink({ copiedToClipboard, url, }) {
    return (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { children: _jsx(Text, { color: "cyan", underline: true, children: formatTerminalHyperlink(url, "Open authorization URL") }) }), _jsx(Text, { color: copiedToClipboard ? "green" : "gray", children: copiedToClipboard
                    ? "Full URL copied to clipboard. It is also shown below."
                    : "Copy the full raw URL below if the link is not clickable." }), _jsx(Text, { color: "gray", wrap: "wrap", children: url })] }));
}
function OAuthLoginPrompt({ copied, input, isLoggingIn, loginUrl, provider, }) {
    return (_jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [_jsx(Text, { bold: true, color: "cyan", children: "ChatGPT login" }), _jsxs(Text, { children: ["Sign in with your ", getProviderLabel(provider), " account to authorize OpenWiki."] }), loginUrl ? (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { color: "gray", children: "Opening your browser. If it does not open, copy this URL:" }), _jsx(Text, { color: "cyan", wrap: "wrap", children: loginUrl }), _jsxs(Text, { color: "gray", children: ["Press ", _jsx(Text, { bold: true, children: "c" }), " to copy the URL", copied ? _jsx(Text, { color: "green", children: " (copied)" }) : null] }), _jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { color: "gray", children: "If the browser cannot reach this machine, paste the redirect URL or authorization code and press Enter:" }), _jsxs(Text, { children: [_jsx(Text, { color: "gray", children: "> " }), input.length > 0 ? (_jsx(Text, { color: "yellow", children: input })) : (_jsx(Text, { color: "gray", children: "(paste here)" }))] })] })] })) : (_jsx(Text, { color: "gray", children: "Starting the ChatGPT login..." })), _jsx(Text, { color: "gray", children: isLoggingIn
                    ? "Waiting for browser sign-in or pasted URL..."
                    : "Login failed. Press Enter to retry." })] }));
}
function BorderedInput({ borderColor = "cyan", maxDisplayWidth, marginTop, prefix, secret = false, showCursor = true, value, }) {
    const prompt = prefix ? "$ " : "> ";
    const prefixText = prefix ? `${prefix} ` : "";
    const valueDisplayWidth = Math.max(1, maxDisplayWidth - prompt.length - prefixText.length - (showCursor ? 1 : 0));
    return (_jsx(Box, { borderStyle: "single", borderColor: borderColor, marginTop: marginTop, paddingX: 1, width: maxDisplayWidth + 4, children: _jsxs(Text, { wrap: "truncate", children: [_jsx(Text, { color: "gray", children: prompt }), prefixText ? _jsx(Text, { color: "gray", children: prefixText }) : null, _jsx(InputValueWithCursor, { maxDisplayWidth: valueDisplayWidth, secret: secret, showCursor: showCursor, value: value })] }) }));
}
function BorderedMultilineInput({ borderColor = "cyan", maxDisplayWidth, marginTop, showCursor = true, value, }) {
    return (_jsx(Box, { borderStyle: "single", borderColor: borderColor, flexDirection: "column", marginTop: marginTop, paddingX: 1, width: maxDisplayWidth + 4, children: _jsxs(Text, { wrap: "wrap", children: [_jsx(Text, { color: "gray", children: "> " }), value ? _jsx(Text, { color: "yellow", children: value }) : null, showCursor ? _jsx(Text, { inverse: true, children: " " }) : null] }) }));
}
function InputValueWithCursor({ maxDisplayWidth, secret = false, showCursor = true, value, }) {
    if (secret) {
        const displayValue = getSingleLineInputDisplayValue(formatSecretInputDisplay(value), maxDisplayWidth);
        return (_jsxs(_Fragment, { children: [_jsx(Text, { color: value.length > 0 ? "yellow" : "gray", children: displayValue }), showCursor ? _jsx(Text, { inverse: true, children: " " }) : null] }));
    }
    const displayValue = getSingleLineInputDisplayValue(value, maxDisplayWidth);
    return (_jsxs(_Fragment, { children: [displayValue ? _jsx(Text, { color: "yellow", children: displayValue }) : null, showCursor ? _jsx(Text, { inverse: true, children: " " }) : null] }));
}
function formatSecretInputDisplay(value) {
    return value.length === 0 ? "empty" : `hidden (${value.length} chars)`;
}
function formatTerminalHyperlink(url, label) {
    return `\u001B]8;;${url}\u0007${label}\u001B]8;;\u0007`;
}
function getSingleLineInputDisplayValue(value, maxLength) {
    if (maxLength <= 0) {
        return "";
    }
    if (value.length <= maxLength) {
        return value;
    }
    if (maxLength <= 3) {
        return value.slice(-maxLength);
    }
    return `...${value.slice(-(maxLength - 3))}`;
}
function SegmentedCronInput({ activeFieldIndex, expression, fallbackExpression, maxDisplayWidth, }) {
    const fields = getCronFields(expression, fallbackExpression);
    const fieldDisplayWidth = Math.max(8, Math.min(14, Math.floor(maxDisplayWidth / CRON_FIELD_LABELS.length) - 1));
    return (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Box, { children: fields.map((field, index) => (_jsxs(Box, { flexDirection: "column", marginRight: 1, children: [_jsx(Text, { color: "gray", children: CRON_FIELD_LABELS[index] }), _jsx(BorderedInput, { borderColor: index === activeFieldIndex ? "cyan" : "gray", maxDisplayWidth: fieldDisplayWidth, showCursor: index === activeFieldIndex, value: field })] }, CRON_FIELD_LABELS[index]))) }), _jsxs(Text, { color: "gray", children: ["Cron: ", fields.join(" ")] })] }));
}
export function getInitialStep(modelIdOverride, provider, onboardingConfig = createEmptyOnboardingConfig(), mode = "code", allowModeSelection = false) {
    if (allowModeSelection) {
        return "run-mode";
    }
    if (!hasValidConfiguredProvider()) {
        return "provider";
    }
    if (needsCredentialStep(provider)) {
        return credentialStep(provider);
    }
    if (needsBaseUrlStep(provider)) {
        return "base-url";
    }
    if (modelIdOverride === null &&
        process.env[OPENWIKI_MODEL_ID_ENV_KEY] === undefined) {
        return "model";
    }
    if (process.env.LANGSMITH_API_KEY === undefined) {
        return "langsmith";
    }
    if (mode === "code" && !isOnboardingComplete(onboardingConfig)) {
        return "code-repo-confirm";
    }
    if (!getConfigModeId(onboardingConfig)) {
        return "template";
    }
    if (!onboardingConfig.wikiGoal) {
        return "wiki-goal";
    }
    if (!isCodeMode(onboardingConfig) && !onboardingConfig.ingestionSchedule) {
        return "global-cron-mode";
    }
    if (!isOnboardingComplete(onboardingConfig)) {
        return "source-menu";
    }
    return null;
}
export function getNextStepAfterProvider(provider, modelIdOverride, onboardingConfig = createEmptyOnboardingConfig(), mode = "code", forceModelStep = false) {
    if (needsCredentialStep(provider)) {
        return credentialStep(provider);
    }
    return getNextStepAfterApiKey(provider, modelIdOverride, onboardingConfig, mode, forceModelStep);
}
function getNextStepAfterApiKey(provider, modelIdOverride, onboardingConfig, mode, forceModelStep = false) {
    if (needsBaseUrlStep(provider)) {
        return "base-url";
    }
    return getNextStepAfterBaseUrl(provider, modelIdOverride, onboardingConfig, mode, forceModelStep);
}
function getNextStepAfterBaseUrl(provider, modelIdOverride, onboardingConfig, mode, forceModelStep = false) {
    if (modelIdOverride === null &&
        (forceModelStep || process.env[OPENWIKI_MODEL_ID_ENV_KEY] === undefined)) {
        return "model";
    }
    if (process.env.LANGSMITH_API_KEY === undefined) {
        return "langsmith";
    }
    if (mode === "code" && !isOnboardingComplete(onboardingConfig)) {
        return "code-repo-confirm";
    }
    if (!getConfigModeId(onboardingConfig)) {
        return "template";
    }
    if (!onboardingConfig.wikiGoal) {
        return "wiki-goal";
    }
    if (!isCodeMode(onboardingConfig) && !onboardingConfig.ingestionSchedule) {
        return "global-cron-mode";
    }
    if (!isOnboardingComplete(onboardingConfig)) {
        return "source-menu";
    }
    return null;
}
function ensureRunModeConfig(config, mode) {
    if (getConfigModeId(config) === mode) {
        return config;
    }
    const runModeTemplate = ONBOARDING_TEMPLATES.find((option) => option.id === mode);
    if (!runModeTemplate) {
        return config;
    }
    return {
        ...config,
        modeId: runModeTemplate.id,
        modeName: runModeTemplate.name,
        templateId: runModeTemplate.id,
        templateName: runModeTemplate.name,
    };
}
async function hydrateRunModeConfig(config, mode, repoRoot) {
    if (mode !== "code") {
        return config;
    }
    const wikiGoal = await readRepositoryWikiInstructions(repoRoot);
    return wikiGoal ? { ...config, wikiGoal } : config;
}
function getRunModeSelectionIndex(mode) {
    const index = RUN_MODE_OPTIONS.findIndex((option) => option.id === mode);
    return index === -1 ? 0 : index;
}
function getRunModeName(mode) {
    return RUN_MODE_OPTIONS.find((option) => option.id === mode)?.name ?? mode;
}
function getSourceOption(sourceId) {
    return (SOURCE_OPTIONS.find((source) => source.id === sourceId) ?? SOURCE_OPTIONS[0]);
}
function getConfigModeId(config) {
    return config.modeId ?? config.templateId;
}
function getConfigModeName(config) {
    return config.modeName ?? config.templateName;
}
function isCodeMode(config) {
    return getConfigModeId(config) === "code";
}
function needsEnvValue(secretInput) {
    return !process.env[secretInput.envKey];
}
function addSourceInstanceConfig(config, sourceInstance) {
    const sourceInstances = [...config.sourceInstances, sourceInstance];
    return {
        ...config,
        sourceInstances,
        sources: deriveLegacySources(sourceInstances),
    };
}
function deriveLegacySources(sourceInstances) {
    const sources = {};
    for (const sourceInstance of sourceInstances) {
        if (!sources[sourceInstance.connectorId]) {
            sources[sourceInstance.connectorId] = {
                connectedAt: sourceInstance.connectedAt,
                connectorConfig: sourceInstance.connectorConfig,
                ingestionGoal: sourceInstance.ingestionGoal,
            };
        }
    }
    return sources;
}
function getSourceInstanceCount(config, sourceId) {
    return getSourceInstances(config, sourceId).length;
}
function getSourceInstances(config, sourceId) {
    return config.sourceInstances.filter((sourceInstance) => sourceInstance.connectorId === sourceId);
}
function getConnectedSourceCount(config, sourceOptions) {
    const sourceIds = new Set(sourceOptions.map((source) => source.id));
    return config.sourceInstances.filter((sourceInstance) => sourceIds.has(sourceInstance.connectorId)).length;
}
function createSourceInstanceId(sourceId, config) {
    const sourceCount = getSourceInstanceCount(config, sourceId) + 1;
    return `${sourceId}-${sourceCount}`;
}
function createSourceInstanceName(source, description, config) {
    const sourceCount = getSourceInstanceCount(config, source.id) + 1;
    const trimmedDescription = description.trim();
    const suffix = trimmedDescription.length > 0 ? `: ${trimmedDescription}` : "";
    return `${source.displayName} ${sourceCount}${suffix}`.slice(0, 120);
}
function isSourceStep(step) {
    return Boolean(step?.startsWith("source-"));
}
function isScheduleStep(step) {
    return Boolean(step?.startsWith("global-"));
}
function getProviderSetupDetail(provider) {
    if (hasValidConfiguredProvider()) {
        return getProviderLabel(provider);
    }
    const detectedProvider = resolveConfiguredProvider();
    if (provider === detectedProvider && detectedProvider !== DEFAULT_PROVIDER) {
        return `detected ${getProviderLabel(detectedProvider)}`;
    }
    return `default ${getProviderLabel(DEFAULT_PROVIDER)}`;
}
function hasValidConfiguredProvider() {
    return normalizeProvider(process.env[OPENWIKI_PROVIDER_ENV_KEY]) !== null;
}
function getModelSetupDetail(modelIdOverride, provider) {
    if (modelIdOverride) {
        return `using ${modelIdOverride} for this run`;
    }
    if (process.env[OPENWIKI_MODEL_ID_ENV_KEY]) {
        return process.env[OPENWIKI_MODEL_ID_ENV_KEY] ?? "";
    }
    return `default ${getDefaultModelId(provider)}`;
}
function getModelSelectionOptions(provider) {
    return [
        ...getProviderModelOptions(provider).map((model) => ({
            id: model.id,
            kind: "preset",
            label: model.label,
        })),
        { kind: "custom" },
    ];
}
function shouldStartWithCustomModelInput(provider) {
    return getProviderModelOptions(provider).length === 0;
}
function getSelectedModelId(provider, selectedIndex, input, isCustomInput) {
    if (!isCustomInput) {
        const selectedOption = getModelSelectionOptions(provider)[selectedIndex];
        if (!selectedOption) {
            return null;
        }
        return selectedOption.kind === "custom" ? "custom" : selectedOption.id;
    }
    const normalizedModelId = normalizeModelId(input);
    return isValidModelId(normalizedModelId) ? normalizedModelId : null;
}
function getProviderSelectionIndex(provider) {
    const selectedIndex = SELECTABLE_OPENWIKI_PROVIDERS.findIndex((providerOption) => providerOption === provider);
    return selectedIndex === -1 ? 0 : selectedIndex;
}
function getModelSelectionIndex(provider, selectedModelId) {
    const selectedIndex = getModelSelectionOptions(provider).findIndex((option) => option.kind === "preset" && option.id === selectedModelId);
    return selectedIndex === -1 ? 0 : selectedIndex;
}
function moveSelectionIndex(currentIndex, offset, itemCount) {
    if (itemCount <= 0) {
        return 0;
    }
    return (currentIndex + offset + itemCount) % itemCount;
}
function getInputDisplayWidth(stdoutColumns) {
    const defaultWidth = 64;
    if (!stdoutColumns || stdoutColumns <= 0) {
        return defaultWidth;
    }
    return Math.max(24, Math.min(96, stdoutColumns - 16));
}
function getProviderArticle(provider) {
    return provider === "baseten" || provider === "fireworks" ? "a" : "an";
}
function getTemplateGoal(templateId) {
    return (ONBOARDING_TEMPLATES.find((template) => template.id === templateId)
        ?.suggestedGoal ?? "");
}
function getSourceMenuLabel(source, sourceInstanceCount) {
    return sourceInstanceCount > 0
        ? `Add another ${source.displayName}`
        : `Add ${source.displayName}`;
}
function getTemplateSourceOptions(templateId) {
    const template = ONBOARDING_TEMPLATES.find((option) => option.id === templateId) ??
        ONBOARDING_TEMPLATES[0];
    const sourceIds = new Set(template.sourceIds);
    const sourceOptions = SOURCE_OPTIONS.filter((source) => sourceIds.has(source.id));
    return sourceOptions.length > 0 ? sourceOptions : SOURCE_OPTIONS;
}
function getSourceDescriptionPrompt(source) {
    if (source.id === "web-search") {
        return "Describe the topics, companies, or pages OpenWiki should search for.";
    }
    if (source.id === "hackernews") {
        return "Describe the topics, keywords, users, or story types OpenWiki should watch on Hacker News.";
    }
    if (source.id === "git-repo") {
        return "Describe what OpenWiki should understand about this repository.";
    }
    return `Describe what OpenWiki should look for in ${source.displayName}.`;
}
function getFinalOptionLabel(option, mode) {
    if (mode !== "code") {
        return option;
    }
    return option === "Run ingestion now" ? "Run OpenWiki now" : "Open chat";
}
function getSourceDescriptionOptionCount(source) {
    return source.examples.length + 1;
}
function handleCronEditorInput({ currentFieldIndex, currentValue, fallbackExpression, inputValue, key, replaceCurrentField, setCurrentFieldIndex, setReplaceCurrentField, setValue, }) {
    if (key.leftArrow) {
        setCurrentFieldIndex((index) => Math.max(0, index - 1));
        setReplaceCurrentField(true);
        return true;
    }
    if (key.rightArrow || key.tab || inputValue === " " || inputValue === "\t") {
        setCurrentFieldIndex((index) => Math.min(CRON_FIELD_LABELS.length - 1, index + 1));
        setReplaceCurrentField(true);
        return true;
    }
    if (key.backspace || key.delete) {
        const fields = getCronFields(currentValue, fallbackExpression);
        const currentField = fields[currentFieldIndex] ?? "";
        if (currentField.length === 0 && currentFieldIndex > 0) {
            setCurrentFieldIndex(currentFieldIndex - 1);
            setReplaceCurrentField(false);
            return true;
        }
        fields[currentFieldIndex] = currentField.slice(0, -1);
        setValue(fields.join(" "));
        setReplaceCurrentField(false);
        return true;
    }
    if (key.ctrl || key.meta) {
        return false;
    }
    const pastedFields = parseCronFieldPaste(inputValue);
    if (pastedFields.length > 1) {
        const fields = getCronFields(currentValue, fallbackExpression);
        pastedFields.forEach((field, offset) => {
            const fieldIndex = currentFieldIndex + offset;
            if (fieldIndex < CRON_FIELD_LABELS.length) {
                fields[fieldIndex] = field;
            }
        });
        setValue(fields.join(" "));
        setCurrentFieldIndex((index) => Math.min(CRON_FIELD_LABELS.length - 1, index + pastedFields.length - 1));
        setReplaceCurrentField(true);
        return true;
    }
    const sanitizedInput = sanitizeCronInputChunk(inputValue);
    if (!sanitizedInput) {
        return false;
    }
    const fields = getCronFields(currentValue, fallbackExpression);
    fields[currentFieldIndex] = replaceCurrentField
        ? sanitizedInput
        : `${fields[currentFieldIndex] ?? ""}${sanitizedInput}`;
    setValue(fields.join(" "));
    setReplaceCurrentField(false);
    return true;
}
function getCronFields(expression, fallbackExpression) {
    const source = expression.trim().length > 0 ? expression.trim() : fallbackExpression;
    const fields = source.split(/\s+/u);
    return CRON_FIELD_LABELS.map((_, index) => fields[index] ?? "");
}
function parseCronFieldPaste(inputValue) {
    if (inputValue.trim().length === 0) {
        return [];
    }
    if (/\s/u.test(inputValue)) {
        return inputValue
            .trim()
            .split(/\s+/u)
            .map((field) => sanitizeCronInputChunk(field))
            .filter((field) => field.length > 0);
    }
    const compactValue = sanitizeCronInputChunk(inputValue);
    if (/^[0-9*]{5}$/u.test(compactValue)) {
        return compactValue.split("");
    }
    return [];
}
function sanitizeInputChunk(value) {
    return value.replace(/[\r\n]/gu, "");
}
function sanitizeCronInputChunk(value) {
    return value.replace(/[^A-Za-z0-9*,/?#LW.-]/gu, "");
}
function sanitizeRepoId(value) {
    return value.replace(/[^A-Za-z0-9._-]/gu, "-").slice(0, 80) || "repo";
}
function getDefaultLocalGitRepoPath() {
    return process.cwd();
}
function getDefaultCodeRepoRootPath() {
    return findNearestGitRepoRoot(process.cwd()) ?? process.cwd();
}
export function findNearestGitRepoRoot(startPath) {
    let currentPath = path.resolve(startPath);
    while (true) {
        if (existsSync(path.join(currentPath, ".git"))) {
            return currentPath;
        }
        const parentPath = path.dirname(currentPath);
        if (parentPath === currentPath) {
            return null;
        }
        currentPath = parentPath;
    }
}
async function validateLocalDirectoryPath(value) {
    const normalizedPath = normalizeLocalPath(value);
    if (normalizedPath.length === 0) {
        throw new Error("Enter a local directory.");
    }
    const { stat } = await import("node:fs/promises");
    const pathStat = await stat(normalizedPath);
    if (!pathStat.isDirectory()) {
        throw new Error(`${normalizedPath} is not a directory.`);
    }
    return normalizedPath;
}
function normalizeLocalPath(value) {
    const trimmedValue = value.trim();
    if (trimmedValue.length === 0) {
        return "";
    }
    if (trimmedValue === "~") {
        return homedir();
    }
    if (trimmedValue.startsWith("~/") || trimmedValue.startsWith("~\\")) {
        return path.resolve(homedir(), trimmedValue.slice(2));
    }
    return path.resolve(trimmedValue);
}
function getStaticSourceConfig(sourceId, query) {
    const queries = query.trim().length > 0 ? [query.trim()] : [];
    if (sourceId === "web-search") {
        return {
            enabled: true,
            includeAnswer: true,
            includeImages: false,
            includeRawContent: false,
            maxResults: 5,
            queries,
            searchDepth: "basic",
            timeRange: "day",
            topic: "general",
        };
    }
    if (sourceId === "hackernews") {
        return {
            enabled: true,
            feeds: ["top", "new"],
            maxItemsPerFeed: 30,
            maxResultsPerQuery: 20,
            queries,
            queryTags: ["story"],
        };
    }
    return {
        enabled: true,
    };
}
function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
