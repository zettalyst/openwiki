import { createRunId, readConnectorConfig, readConnectorState, updateStateWithRun, writeConnectorState, writeRawJson, } from "../io.js";
import { executeMcpReadOnlyOperations, listMcpTools } from "../mcp-client.js";
import { sanitizeMcpTransport } from "../mcp-runtime.js";
export function createMcpConnector(input) {
    const definition = {
        ...input,
        backend: "mcp-stdio",
        supportsAgenticDiscovery: true,
    };
    return {
        ...definition,
        ingest: () => ingestMcpConnector(input.id, definition),
    };
}
async function ingestMcpConnector(connectorId, definition) {
    const runId = createRunId();
    const state = await readConnectorState(connectorId);
    const config = await readConnectorConfig(connectorId, {
        enabled: false,
        readOnlyOperations: [],
    });
    const warnings = [];
    if (!config.enabled) {
        return {
            connectorId,
            message: `${definition.displayName} is not enabled. Configure ~/.openwiki/connectors/${connectorId}/config.json with an MCP transport.`,
            rawFiles: [],
            runId,
            statePath: `~/.openwiki/connectors/${connectorId}/state.json`,
            status: "skipped",
            warnings,
        };
    }
    if (!config.transport || !Array.isArray(config.readOnlyOperations)) {
        return await finishMcpRun({
            connectorId,
            message: "MCP config must include transport and readOnlyOperations.",
            rawFiles: [],
            runId,
            state,
            status: "error",
            warnings: ["MCP config must include transport and readOnlyOperations."],
        });
    }
    if (config.readOnlyOperations.length === 0) {
        const discovery = await listMcpTools(config);
        const rawFile = await writeRawJson(connectorId, runId, "mcp-tools.json", {
            connectorId,
            generatedAt: new Date().toISOString(),
            note: "No readOnlyOperations are configured. Use these discovered tools to choose read-only operations.",
            tools: discovery.tools,
            transport: sanitizeMcpTransport(config.transport),
        });
        return await finishMcpRun({
            connectorId,
            message: `Discovered ${discovery.tools.length} MCP tool(s). Use openwiki_call_mcp_tool for interactive ingestion or save readOnlyOperations as an optional automation recipe.`,
            rawFiles: [rawFile],
            runId,
            state,
            status: "skipped",
            warnings: [
                "No readOnlyOperations configured; listed available MCP tools instead of guessing.",
            ],
        });
    }
    const execution = await executeMcpReadOnlyOperations(config);
    const rawFile = await writeRawJson(connectorId, runId, "mcp-results.json", {
        connectorId,
        generatedAt: new Date().toISOString(),
        mode: config.mode ?? "mcp-stdio",
        operations: execution.operations,
        readOnlyOperations: config.readOnlyOperations.map((operation) => ({
            args: operation.args,
            name: operation.name,
            type: operation.type,
        })),
        transport: sanitizeMcpTransport(config.transport),
    });
    return await finishMcpRun({
        connectorId,
        message: `Executed ${execution.operations.length} read-only MCP operation(s).`,
        rawFiles: [rawFile],
        runId,
        state,
        status: "success",
        warnings,
    });
}
async function finishMcpRun({ connectorId, message, rawFiles, runId, state, status, warnings, }) {
    await writeConnectorState(connectorId, updateStateWithRun(state, {
        at: new Date().toISOString(),
        rawFiles,
        runId,
        status,
        warnings,
    }));
    return {
        connectorId,
        message,
        rawFiles,
        runId,
        statePath: `~/.openwiki/connectors/${connectorId}/state.json`,
        status,
        warnings,
    };
}
