import type { ConnectorId, ConnectorRuntime } from "./types.js";
export declare const CONNECTOR_IDS: readonly ["git-repo", "notion", "x", "google", "web-search", "hackernews", "slack"];
export declare function createConnectorRegistry(): Record<ConnectorId, ConnectorRuntime>;
export declare function isConnectorId(value: string): value is ConnectorId;
