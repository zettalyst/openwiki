import { spawn } from "node:child_process";
import { OPENWIKI_VERSION } from "../constants.js";
import { getOAuthAccessToken, getOAuthProviderIdForAccessTokenEnvKey, } from "../auth/tokens.js";
export async function executeMcpReadOnlyOperations(config) {
    validateMcpConfig(config);
    if (config.transport?.type === "stdio") {
        return executeStdioMcp(config);
    }
    return executeHttpMcp(config);
}
export async function listMcpTools(config) {
    validateMcpTransport(config);
    if (config.transport?.type === "stdio") {
        return listStdioMcpTools(config);
    }
    return listHttpMcpTools(config);
}
export async function executeMcpTool(config, name, args = {}) {
    validateMcpTransport(config);
    validateMcpOperationName(name);
    validateMcpArgs(args);
    if (config.transport?.type === "stdio") {
        return executeStdioMcpTool(config, name, args);
    }
    return executeHttpMcpTool(config, name, args);
}
function validateMcpConfig(config) {
    validateMcpTransport(config);
    if (!Array.isArray(config.readOnlyOperations) ||
        config.readOnlyOperations.length === 0) {
        throw new Error("MCP config requires at least one readOnlyOperation.");
    }
    for (const operation of config.readOnlyOperations) {
        validateMcpOperation(operation);
    }
}
function validateMcpOperation(operation) {
    if (operation.type !== "resource" && operation.type !== "tool") {
        throw new Error(`Invalid MCP operation type: ${String(operation.type)}`);
    }
    if (operation.type === "tool") {
        validateMcpOperationName(operation.name);
        return;
    }
    const uri = typeof operation.args?.uri === "string"
        ? operation.args.uri
        : operation.name;
    if (!uri) {
        throw new Error("MCP resource operation requires a resource URI in name or args.uri.");
    }
    if (!/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(uri)) {
        throw new Error(`Invalid MCP resource URI: ${uri}`);
    }
}
function validateMcpOperationName(name) {
    if (typeof name !== "string" ||
        !/^[A-Za-z0-9._:/#?=&-]{1,300}$/u.test(name)) {
        throw new Error(`Invalid MCP operation name: ${name}`);
    }
}
function validateMcpArgs(args) {
    for (const key of Object.keys(args)) {
        if (!/^[A-Za-z0-9._-]{1,200}$/u.test(key)) {
            throw new Error(`Invalid MCP tool argument name: ${key}`);
        }
    }
}
function validateMcpTransport(config) {
    if (!config.transport) {
        throw new Error("MCP config requires a transport.");
    }
}
async function executeStdioMcp(config) {
    const transport = config.transport;
    if (transport?.type !== "stdio" || !transport.command) {
        throw new Error("stdio MCP transport requires a command.");
    }
    validateCommand(transport.command);
    for (const arg of transport.args ?? []) {
        validateCommandArg(arg);
    }
    const child = spawn(transport.command, transport.args ?? [], {
        env: {
            ...process.env,
            ...resolveChildEnv(transport.env ?? {}),
        },
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
    });
    const client = new StdioJsonRpcClient(child);
    try {
        await client.initialize();
        const operations = [];
        for (const operation of config.readOnlyOperations ?? []) {
            operations.push({
                name: operation.name,
                result: await client.executeOperation(operation),
                type: operation.type,
            });
        }
        return {
            operations,
            transport: {
                command: transport.command,
                type: "stdio",
            },
        };
    }
    finally {
        client.close();
    }
}
async function executeStdioMcpTool(config, name, args) {
    const transport = config.transport;
    if (transport?.type !== "stdio" || !transport.command) {
        throw new Error("stdio MCP transport requires a command.");
    }
    validateCommand(transport.command);
    for (const arg of transport.args ?? []) {
        validateCommandArg(arg);
    }
    const child = spawn(transport.command, transport.args ?? [], {
        env: {
            ...process.env,
            ...resolveChildEnv(transport.env ?? {}),
        },
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
    });
    const client = new StdioJsonRpcClient(child);
    try {
        await client.initialize();
        return await client.executeOperation({
            args,
            name,
            type: "tool",
        });
    }
    finally {
        client.close();
    }
}
async function listStdioMcpTools(config) {
    const transport = config.transport;
    if (transport?.type !== "stdio" || !transport.command) {
        throw new Error("stdio MCP transport requires a command.");
    }
    validateCommand(transport.command);
    for (const arg of transport.args ?? []) {
        validateCommandArg(arg);
    }
    const child = spawn(transport.command, transport.args ?? [], {
        env: {
            ...process.env,
            ...resolveChildEnv(transport.env ?? {}),
        },
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
    });
    const client = new StdioJsonRpcClient(child);
    try {
        await client.initialize();
        return {
            tools: extractTools(await client.listTools()),
            transport: {
                command: transport.command,
                type: "stdio",
            },
        };
    }
    finally {
        client.close();
    }
}
async function executeHttpMcp(config) {
    const transport = config.transport;
    if (transport?.type !== "http" || !transport.url) {
        throw new Error("HTTP MCP transport requires a URL.");
    }
    const url = validateMcpUrl(transport.url);
    const client = new HttpJsonRpcClient(url, await resolveHeaders(transport.headers ?? {}));
    await client.initialize();
    const operations = [];
    for (const operation of config.readOnlyOperations ?? []) {
        operations.push({
            name: operation.name,
            result: await client.executeOperation(operation),
            type: operation.type,
        });
    }
    return {
        operations,
        transport: {
            type: "http",
            url,
        },
    };
}
async function executeHttpMcpTool(config, name, args) {
    const transport = config.transport;
    if (transport?.type !== "http" || !transport.url) {
        throw new Error("HTTP MCP transport requires a URL.");
    }
    const url = validateMcpUrl(transport.url);
    const client = new HttpJsonRpcClient(url, await resolveHeaders(transport.headers ?? {}));
    await client.initialize();
    return await client.executeOperation({
        args,
        name,
        type: "tool",
    });
}
async function listHttpMcpTools(config) {
    const transport = config.transport;
    if (transport?.type !== "http" || !transport.url) {
        throw new Error("HTTP MCP transport requires a URL.");
    }
    const url = validateMcpUrl(transport.url);
    const client = new HttpJsonRpcClient(url, await resolveHeaders(transport.headers ?? {}));
    await client.initialize();
    return {
        tools: extractTools(await client.listTools()),
        transport: {
            type: "http",
            url,
        },
    };
}
function extractTools(value) {
    return extractToolValues(value)
        .map(normalizeMcpTool)
        .filter((tool) => tool !== null);
}
function extractToolValues(value) {
    if (value !== null &&
        typeof value === "object" &&
        "tools" in value &&
        Array.isArray(value.tools)) {
        return value.tools;
    }
    return [];
}
function normalizeMcpTool(value) {
    if (value === null || typeof value !== "object") {
        return null;
    }
    const record = value;
    if (typeof record.name !== "string") {
        return null;
    }
    try {
        validateMcpOperationName(record.name);
    }
    catch {
        return null;
    }
    return {
        annotations: record.annotations !== null && typeof record.annotations === "object"
            ? record.annotations
            : undefined,
        description: typeof record.description === "string" ? record.description : undefined,
        inputSchema: record.inputSchema,
        name: record.name,
    };
}
class StdioJsonRpcClient {
    child;
    buffer = "";
    nextId = 1;
    pending = new Map();
    constructor(child) {
        this.child = child;
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk) => {
            this.buffer += chunk;
            this.flushLines();
        });
        child.stderr.on("data", () => undefined);
        child.on("error", (error) => {
            this.rejectAll(error instanceof Error ? error : new Error(String(error)));
        });
        child.on("exit", (code, signal) => {
            this.rejectAll(new Error(`MCP stdio process exited early: code=${code} signal=${signal}`));
        });
    }
    async initialize() {
        await this.request("initialize", {
            capabilities: {},
            clientInfo: {
                name: "openwiki",
                version: OPENWIKI_VERSION,
            },
            protocolVersion: "2025-06-18",
        });
        this.notify("notifications/initialized");
    }
    executeOperation(operation) {
        if (operation.type === "tool") {
            return this.request("tools/call", {
                arguments: operation.args ?? {},
                name: operation.name,
            });
        }
        return this.request("resources/read", {
            uri: getResourceUri(operation),
        });
    }
    listTools() {
        return this.request("tools/list", {});
    }
    close() {
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timeout);
        }
        this.pending.clear();
        this.child.stdin.end();
        setTimeout(() => {
            if (this.child.exitCode === null) {
                this.child.kill();
            }
        }, 1_000).unref();
    }
    notify(method) {
        this.write({
            jsonrpc: "2.0",
            method,
        });
    }
    request(method, params) {
        const id = this.nextId;
        this.nextId += 1;
        const promise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`Timed out waiting for MCP response to ${method}.`));
            }, 60_000);
            this.pending.set(id, {
                reject,
                resolve,
                timeout,
            });
        });
        this.write({
            id,
            jsonrpc: "2.0",
            method,
            params,
        });
        return promise;
    }
    write(message) {
        this.child.stdin.write(`${JSON.stringify(message)}\n`);
    }
    flushLines() {
        let newlineIndex = this.buffer.indexOf("\n");
        while (newlineIndex >= 0) {
            const line = this.buffer.slice(0, newlineIndex).trim();
            this.buffer = this.buffer.slice(newlineIndex + 1);
            if (line.length > 0) {
                this.handleLine(line);
            }
            newlineIndex = this.buffer.indexOf("\n");
        }
    }
    handleLine(line) {
        let response;
        try {
            response = JSON.parse(line);
        }
        catch {
            return;
        }
        if (typeof response.id !== "number") {
            return;
        }
        const pending = this.pending.get(response.id);
        if (!pending) {
            return;
        }
        clearTimeout(pending.timeout);
        this.pending.delete(response.id);
        if (response.error) {
            pending.reject(new Error(response.error.message ?? "MCP request failed."));
            return;
        }
        pending.resolve(response.result);
    }
    rejectAll(error) {
        for (const [id, pending] of this.pending.entries()) {
            clearTimeout(pending.timeout);
            pending.reject(error);
            this.pending.delete(id);
        }
    }
}
class HttpJsonRpcClient {
    url;
    headers;
    nextId = 1;
    sessionId = null;
    constructor(url, headers) {
        this.url = url;
        this.headers = headers;
    }
    async initialize() {
        await this.request("initialize", {
            capabilities: {},
            clientInfo: {
                name: "openwiki",
                version: OPENWIKI_VERSION,
            },
            protocolVersion: "2025-06-18",
        });
        await this.notify("notifications/initialized");
    }
    executeOperation(operation) {
        if (operation.type === "tool") {
            return this.request("tools/call", {
                arguments: operation.args ?? {},
                name: operation.name,
            });
        }
        return this.request("resources/read", {
            uri: getResourceUri(operation),
        });
    }
    listTools() {
        return this.request("tools/list", {});
    }
    async notify(method) {
        await this.post({
            jsonrpc: "2.0",
            method,
        });
    }
    async request(method, params) {
        const id = this.nextId;
        this.nextId += 1;
        const response = await this.post({
            id,
            jsonrpc: "2.0",
            method,
            params,
        });
        if (response.error) {
            throw new Error(response.error.message ?? "MCP request failed.");
        }
        return response.result;
    }
    async post(message) {
        const response = await fetch(this.url, {
            body: JSON.stringify(message),
            headers: {
                Accept: "application/json, text/event-stream",
                "Content-Type": "application/json",
                "MCP-Protocol-Version": "2025-06-18",
                ...this.headers,
                ...(this.sessionId ? { "Mcp-Session-Id": this.sessionId } : {}),
            },
            method: "POST",
        });
        const sessionId = response.headers.get("mcp-session-id");
        if (sessionId) {
            this.sessionId = sessionId;
        }
        if (response.status === 202) {
            return {};
        }
        if (!response.ok) {
            throw new Error(`MCP HTTP request failed: ${response.status}`);
        }
        return parseHttpMcpResponse(await response.text(), response.headers.get("content-type") ?? "");
    }
}
function parseHttpMcpResponse(content, contentType) {
    if (content.trim().length === 0) {
        return {};
    }
    if (contentType.includes("text/event-stream")) {
        for (const eventData of parseSseDataLines(content)) {
            const response = JSON.parse(eventData);
            if (response.id !== undefined ||
                response.result !== undefined ||
                response.error) {
                return response;
            }
        }
        return {};
    }
    return JSON.parse(content);
}
function parseSseDataLines(content) {
    const events = [];
    let current = "";
    for (const line of content.split(/\r?\n/u)) {
        if (line.startsWith("data:")) {
            current += line.slice("data:".length).trim();
        }
        else if (line.trim().length === 0 && current.length > 0) {
            events.push(current);
            current = "";
        }
    }
    if (current.length > 0) {
        events.push(current);
    }
    return events;
}
function resolveChildEnv(envRefs) {
    return Object.fromEntries(Object.entries(envRefs).map(([key, value]) => {
        validateEnvKey(key);
        return [key, resolveEnvReference(value)];
    }));
}
async function resolveHeaders(headers) {
    const resolvedEntries = [];
    for (const [key, value] of Object.entries(headers)) {
        resolvedEntries.push([
            validateHeaderName(key),
            await resolveTemplateEnvReferences(value, key),
        ]);
    }
    return Object.fromEntries(resolvedEntries);
}
async function resolveTemplateEnvReferences(value, key) {
    if (!value.includes("${")) {
        if (/(token|secret|authorization|api[-_]?key|bearer)/iu.test(`${key} ${value}`)) {
            throw new Error(`Header ${key} must reference credentials with \${ENV_VAR}, not a literal value.`);
        }
        return value;
    }
    let resolvedValue = value;
    const envRefs = value.matchAll(/\$\{([A-Z_][A-Z0-9_]*)\}/gu);
    for (const match of envRefs) {
        const envKey = match[1];
        const envValue = await resolveHeaderEnvReference(envKey);
        resolvedValue = resolvedValue.replace(match[0], envValue);
    }
    return resolvedValue;
}
async function resolveHeaderEnvReference(envKey) {
    validateEnvKey(envKey);
    const providerId = getOAuthProviderIdForAccessTokenEnvKey(envKey);
    if (providerId) {
        return await getOAuthAccessToken(providerId);
    }
    return resolveEnvReference(envKey);
}
function resolveEnvReference(value) {
    const envKey = value.startsWith("${") && value.endsWith("}") ? value.slice(2, -1) : value;
    validateEnvKey(envKey);
    const envValue = process.env[envKey];
    if (!envValue) {
        throw new Error(`${envKey} is required for MCP connector ingestion.`);
    }
    return envValue;
}
function getResourceUri(operation) {
    const uri = typeof operation.args?.uri === "string"
        ? operation.args.uri
        : operation.name;
    if (!/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(uri)) {
        throw new Error(`Invalid MCP resource URI: ${uri}`);
    }
    return uri;
}
function validateCommand(command) {
    if (!/^[A-Za-z0-9._/@+-]{1,300}$/u.test(command)) {
        throw new Error(`Invalid MCP stdio command: ${command}`);
    }
}
function validateCommandArg(arg) {
    if (Array.from(arg).some((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint === 0 || codePoint === 10 || codePoint === 13;
    })) {
        throw new Error("MCP stdio command args must not contain control characters.");
    }
}
function validateEnvKey(key) {
    if (!/^[A-Z_][A-Z0-9_]*$/u.test(key)) {
        throw new Error(`Invalid env var reference: ${key}`);
    }
    return key;
}
function validateHeaderName(key) {
    if (!/^[A-Za-z0-9-]{1,100}$/u.test(key)) {
        throw new Error(`Invalid HTTP header name: ${key}`);
    }
    return key;
}
function validateMcpUrl(value) {
    const url = new URL(value);
    const isLocalhost = url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "::1";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalhost)) {
        throw new Error("HTTP MCP URLs must use https, except localhost http.");
    }
    return url.toString();
}
