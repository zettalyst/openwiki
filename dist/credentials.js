import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { DEFAULT_PROVIDER, getDefaultModelId, getProviderApiKeyEnvKey, getProviderBaseUrlEnvKey, getProviderCredentialRequirement, getProviderLabel, getProviderModelOptions, isValidBaseUrl, isValidModelId, normalizeModelId, OPENWIKI_MODEL_ID_ENV_KEY, OPENWIKI_PROVIDER_ENV_KEY, providerRequiresBaseUrl, resolveConfiguredProvider, resolveProviderCredential, SELECTABLE_OPENWIKI_PROVIDERS, } from "./constants.js";
import { openWikiEnvPath, saveOpenWikiEnv } from "./env.js";
export function needsCredentialSetup(modelIdOverride = null) {
    const provider = resolveConfiguredProvider();
    return (process.env[OPENWIKI_PROVIDER_ENV_KEY] === undefined ||
        resolveProviderCredential(provider) === null ||
        needsBaseUrlStep(provider) ||
        (modelIdOverride === null &&
            process.env[OPENWIKI_MODEL_ID_ENV_KEY] === undefined) ||
        process.env.LANGSMITH_API_KEY === undefined);
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
export function InitSetup({ modelIdOverride = null, onComplete, onError, }) {
    const initialProvider = resolveConfiguredProvider();
    const [step, setStep] = useState(null);
    const [provider, setProvider] = useState(initialProvider);
    const [apiKey, setApiKey] = useState(null);
    const [baseUrl, setBaseUrl] = useState(null);
    const [modelId, setModelId] = useState(null);
    const [langSmithKey, setLangSmithKey] = useState(null);
    const [input, setInput] = useState("");
    const [providerSelectionIndex, setProviderSelectionIndex] = useState(() => getProviderSelectionIndex(initialProvider));
    const [modelSelectionIndex, setModelSelectionIndex] = useState(() => getModelSelectionIndex(initialProvider, modelIdOverride ??
        process.env[OPENWIKI_MODEL_ID_ENV_KEY] ??
        getDefaultModelId(initialProvider)));
    const [isCustomModelInput, setIsCustomModelInput] = useState(false);
    const [error, setError] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    useEffect(() => {
        const initialStep = getInitialStep(modelIdOverride, initialProvider);
        if (initialStep === null) {
            onComplete({
                modelId: modelIdOverride ?? process.env[OPENWIKI_MODEL_ID_ENV_KEY] ?? null,
                provider: initialProvider,
                savedApiKey: false,
                savedBaseUrl: false,
                savedLangSmithKey: false,
                savedModelId: false,
                savedProvider: false,
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
        setStep(initialStep);
    }, [initialProvider, modelIdOverride, onComplete]);
    useInput((inputValue, key) => {
        if (isSaving || step === null) {
            return;
        }
        if (step === "provider") {
            if (key.upArrow || key.downArrow) {
                setError(null);
                setProviderSelectionIndex((index) => moveSelectionIndex(index, key.upArrow ? -1 : 1, SELECTABLE_OPENWIKI_PROVIDERS.length));
                return;
            }
            if (key.return) {
                void submit();
            }
            return;
        }
        if (step === "model" && !isCustomModelInput) {
            if (key.upArrow || key.downArrow) {
                setError(null);
                setModelSelectionIndex((index) => moveSelectionIndex(index, key.upArrow ? -1 : 1, getModelSelectionOptions(provider).length));
                return;
            }
            if (key.return) {
                void submit();
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
    async function submit() {
        setError(null);
        if (step === "provider") {
            const selectedProvider = SELECTABLE_OPENWIKI_PROVIDERS[providerSelectionIndex] ??
                DEFAULT_PROVIDER;
            setProvider(selectedProvider);
            setProviderSelectionIndex(getProviderSelectionIndex(selectedProvider));
            setModelSelectionIndex(getModelSelectionIndex(selectedProvider, getDefaultModelId(selectedProvider)));
            setInput("");
            const nextStep = getNextStepAfterProvider(selectedProvider, modelIdOverride);
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
                nextProvider: selectedProvider,
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
            const nextStep = getNextStepAfterApiKey(provider, modelIdOverride);
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
                nextProvider: provider,
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
            const nextStep = getNextStepAfterBaseUrl(provider, modelIdOverride);
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
                nextProvider: provider,
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
            await completeSetup({
                nextApiKey: apiKey,
                nextBaseUrl: baseUrl,
                nextLangSmithKey: langSmithKey,
                nextModelId: selectedModelId,
                nextProvider: provider,
            });
            return;
        }
        if (step === "langsmith") {
            const nextLangSmithKey = input.trim();
            setLangSmithKey(nextLangSmithKey);
            setInput("");
            await completeSetup({
                nextApiKey: apiKey,
                nextBaseUrl: baseUrl,
                nextLangSmithKey,
                nextModelId: modelId,
                nextProvider: provider,
            });
        }
    }
    async function completeSetup({ nextApiKey, nextBaseUrl, nextLangSmithKey, nextModelId, nextProvider, }) {
        setIsSaving(true);
        try {
            const updates = {};
            const providerEnvChanged = process.env[OPENWIKI_PROVIDER_ENV_KEY] !== nextProvider;
            if (providerEnvChanged) {
                updates[OPENWIKI_PROVIDER_ENV_KEY] = nextProvider;
            }
            if (nextApiKey !== null) {
                updates[getProviderApiKeyEnvKey(nextProvider)] = nextApiKey;
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
            onComplete({
                modelId: nextModelId ??
                    modelIdOverride ??
                    process.env[OPENWIKI_MODEL_ID_ENV_KEY] ??
                    null,
                provider: nextProvider,
                savedApiKey: nextApiKey !== null,
                savedBaseUrl: nextBaseUrl !== null,
                savedLangSmithKey: nextLangSmithKey !== null && nextLangSmithKey.length > 0,
                savedModelId: nextModelId !== null,
                savedProvider: providerEnvChanged,
            });
        }
        catch (saveError) {
            onError(saveError instanceof Error
                ? saveError.message
                : "Failed to complete OpenWiki credential setup.");
        }
    }
    const needsCredentialPrompt = needsCredentialSetup(modelIdOverride);
    const providerCredential = resolveProviderCredential(provider);
    const providerCredentialRequirement = getProviderCredentialRequirement(provider);
    return (_jsxs(Box, { flexDirection: "column", children: [_jsx(SetupHeader, {}), _jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [_jsx(SetupStep, { label: "Provider", state: process.env[OPENWIKI_PROVIDER_ENV_KEY]
                            ? "done"
                            : step === "provider"
                                ? "current"
                                : "pending", detail: getProviderSetupDetail(provider) }), _jsx(SetupStep, { label: "Provider credential", state: providerCredential !== null
                            ? "done"
                            : step === "api-key"
                                ? "current"
                                : "pending", detail: providerCredential !== null
                            ? `available from ${providerCredential.envKey}`
                            : `save ${providerCredentialRequirement} to ${openWikiEnvPath}` }), providerRequiresBaseUrl(provider) ? (_jsx(SetupStep, { label: "Base URL", state: isBaseUrlConfigured(provider)
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
                            : "optional tracing key" }), _jsx(SetupStep, { label: "OpenWiki", state: "done", detail: "agent setup" })] }), _jsx(SetupPanel, { title: "Prompt", children: step ? (_jsx(Prompt, { input: input, isCustomModelInput: isCustomModelInput, modelSelectionIndex: modelSelectionIndex, provider: provider, providerSelectionIndex: providerSelectionIndex, step: step })) : (_jsx(Text, { children: "Inspecting OpenWiki setup..." })) }), needsCredentialPrompt ? (_jsx(Text, { color: "gray", children: "Secrets are masked and saved only after setup." })) : null, error ? (_jsx(SetupPanel, { title: "Error", children: _jsx(Text, { color: "red", children: error }) })) : null, isSaving ? (_jsx(SetupPanel, { title: "Saving", children: _jsx(Text, { children: "Writing OpenWiki setup..." }) })) : null] }));
}
function SetupHeader() {
    return (_jsxs(Box, { borderStyle: "round", borderColor: "cyan", flexDirection: "column", marginBottom: 1, paddingX: 1, children: [_jsxs(Text, { children: [_jsx(Text, { bold: true, color: "cyan", children: "OpenWiki" }), " ", _jsx(Text, { color: "gray", children: "credential setup" })] }), _jsx(Text, { children: "Configure a model provider and local defaults." })] }));
}
function SetupStep({ label, state, detail }) {
    const color = state === "done"
        ? "green"
        : state === "current"
            ? "yellow"
            : state === "optional"
                ? "cyan"
                : "gray";
    return (_jsxs(Text, { children: [_jsxs(Text, { color: color, children: ["[", state.toUpperCase(), "]"] }), " ", _jsx(Text, { bold: true, children: label.padEnd(16) }), " ", _jsx(Text, { color: "gray", children: detail })] }));
}
function SetupPanel({ title, children }) {
    return (_jsxs(Box, { borderStyle: "single", borderColor: "gray", flexDirection: "column", marginTop: 1, paddingX: 1, children: [_jsx(Text, { bold: true, color: "cyan", children: title }), children] }));
}
function Prompt({ input, isCustomModelInput, modelSelectionIndex, provider, providerSelectionIndex, step, }) {
    if (step === "provider") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: "Choose a model provider." }), SELECTABLE_OPENWIKI_PROVIDERS.map((providerOption, index) => (_jsxs(Text, { children: [_jsx(SelectionMarker, { isSelected: index === providerSelectionIndex }), " ", getProviderLabel(providerOption), _jsxs(Text, { color: "gray", children: [" (", providerOption, ")"] }), providerOption === DEFAULT_PROVIDER ? (_jsx(Text, { color: "gray", children: " default" })) : null] }, providerOption))), _jsx(Text, { color: "gray", children: "Use up/down arrows, then press Enter." })] }));
    }
    if (step === "api-key") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { children: ["Paste your ", getProviderLabel(provider), " API key."] }), provider === "anthropic" ? (_jsx(Text, { color: "gray", children: "For bearer OAuth, set ANTHROPIC_AUTH_TOKEN or CLAUDE_CODE_OAUTH_TOKEN before starting OpenWiki." })) : null, _jsxs(Text, { children: [_jsx(Text, { color: "gray", children: "$" }), " ", getProviderApiKeyEnvKey(provider), "=", " ", _jsx(Text, { color: "yellow", children: mask(input) })] }), _jsx(Text, { color: "gray", children: "Press Enter to save it." })] }));
    }
    if (step === "base-url") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { children: ["Enter the ", getProviderLabel(provider), " base URL."] }), _jsxs(Text, { children: [_jsx(Text, { color: "gray", children: "$" }), " ", getProviderBaseUrlEnvKey(provider), "=", " ", _jsx(Text, { color: "yellow", children: input })] }), _jsx(Text, { color: "gray", children: "For example an OpenAI-compatible gateway endpoint (such as a LiteLLM gateway). Press Enter to save it." })] }));
    }
    if (step === "model") {
        if (isCustomModelInput) {
            return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { children: "Paste a custom model ID." }), _jsxs(Text, { children: [_jsx(Text, { color: "gray", children: "$" }), " ", OPENWIKI_MODEL_ID_ENV_KEY, "=", " ", _jsx(Text, { color: "yellow", children: input })] }), _jsx(Text, { color: "gray", children: "Press Enter to save it." })] }));
        }
        return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { children: ["Choose ", getProviderArticle(provider), " ", getProviderLabel(provider), " ", "model."] }), getModelSelectionOptions(provider).map((option, index) => {
                    if (option.kind === "custom") {
                        return (_jsxs(Text, { children: [_jsx(SelectionMarker, { isSelected: index === modelSelectionIndex }), " ", "Custom model ID"] }, "custom"));
                    }
                    return (_jsxs(Text, { children: [_jsx(SelectionMarker, { isSelected: index === modelSelectionIndex }), " ", option.label, " ", _jsx(Text, { color: "gray", children: option.id }), option.id === getDefaultModelId(provider) ? (_jsx(Text, { color: "gray", children: " default" })) : null] }, option.id));
                }), _jsx(Text, { color: "gray", children: "Use up/down arrows, then press Enter." })] }));
    }
    if (step === "langsmith") {
        return (_jsxs(Text, { children: [_jsx(Text, { color: "gray", children: "$" }), " LANGSMITH_API_KEY optional=", " ", _jsx(Text, { color: "yellow", children: mask(input) })] }));
    }
    return null;
}
function SelectionMarker({ isSelected }) {
    return (_jsx(Text, { color: isSelected ? "cyan" : "gray", children: isSelected ? ">" : " " }));
}
function getInitialStep(modelIdOverride, provider) {
    if (process.env[OPENWIKI_PROVIDER_ENV_KEY] === undefined) {
        return "provider";
    }
    if (resolveProviderCredential(provider) === null) {
        return "api-key";
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
    return null;
}
function getNextStepAfterProvider(provider, modelIdOverride) {
    if (resolveProviderCredential(provider) === null) {
        return "api-key";
    }
    return getNextStepAfterApiKey(provider, modelIdOverride);
}
function getNextStepAfterApiKey(provider, modelIdOverride) {
    if (needsBaseUrlStep(provider)) {
        return "base-url";
    }
    return getNextStepAfterBaseUrl(provider, modelIdOverride);
}
function getNextStepAfterBaseUrl(provider, modelIdOverride) {
    if (modelIdOverride === null &&
        process.env[OPENWIKI_MODEL_ID_ENV_KEY] === undefined) {
        return "model";
    }
    if (process.env.LANGSMITH_API_KEY === undefined) {
        return "langsmith";
    }
    return null;
}
function getProviderSetupDetail(provider) {
    if (process.env[OPENWIKI_PROVIDER_ENV_KEY]) {
        return getProviderLabel(provider);
    }
    return `default ${getProviderLabel(DEFAULT_PROVIDER)}`;
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
function getProviderArticle(provider) {
    return provider === "baseten" || provider === "fireworks" ? "a" : "an";
}
function sanitizeInputChunk(value) {
    return value.replace(/[\r\n]/gu, "");
}
function mask(value) {
    if (value.length === 0) {
        return "";
    }
    return "*".repeat(value.length);
}
