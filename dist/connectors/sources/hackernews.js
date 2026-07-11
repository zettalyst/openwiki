import { createRunId, readConnectorConfig, readConnectorState, updateStateWithRun, writeConnectorState, writeRawJson, } from "../io.js";
const HN_FIREBASE_BASE_URL = "https://hacker-news.firebaseio.com/v0";
const HN_ALGOLIA_SEARCH_URL = "https://hn.algolia.com/api/v1/search_by_date";
const DEFAULT_FEEDS = ["top", "new"];
const definition = {
    backend: "direct-api",
    description: "Fetches Hacker News feeds and query results through public Hacker News APIs.",
    displayName: "Hacker News",
    id: "hackernews",
    requiredEnv: [],
    supportsAgenticDiscovery: false,
};
export function createHackerNewsConnector() {
    return {
        ...definition,
        ingest,
    };
}
async function ingest(options = {}) {
    const runId = createRunId();
    const config = {
        ...(await readConnectorConfig("hackernews", {
            enabled: true,
            feeds: DEFAULT_FEEDS,
            maxItemsPerFeed: 30,
            maxResultsPerQuery: 20,
            queries: [],
            queryTags: ["story"],
        })),
        ...(options.connectorConfig ?? {}),
    };
    const state = await readConnectorState("hackernews");
    const warnings = [];
    const rawFiles = [];
    if (!config.enabled) {
        return {
            connectorId: "hackernews",
            message: "Hacker News connector is not enabled. Set enabled=true in ~/.openwiki/connectors/hackernews/config.json.",
            rawFiles,
            runId,
            statePath: "~/.openwiki/connectors/hackernews/state.json",
            status: "skipped",
            warnings,
        };
    }
    const feedLimit = getOptionLimit(options.limit, config.maxItemsPerFeed, 100);
    const queryLimit = getOptionLimit(options.limit, config.maxResultsPerQuery, 100);
    const feeds = normalizeFeeds(options.streams, config.feeds);
    const windowHours = normalizeWindowHours(options.windowHours);
    const earliestUnixTime = windowHours === null
        ? null
        : Math.floor((Date.now() - windowHours * 60 * 60 * 1000) / 1000);
    const feedResults = [];
    for (const feed of feeds) {
        try {
            const ids = (await hnFirebaseApi(`/${feed}stories.json`)).slice(0, feedLimit);
            const items = [];
            for (const id of ids) {
                const item = await hnFirebaseApi(`/item/${encodeURIComponent(String(id))}.json`);
                if (item && isWithinWindow(item.time, earliestUnixTime)) {
                    items.push(item);
                }
            }
            feedResults.push({
                feed,
                ids,
                items,
            });
        }
        catch (error) {
            warnings.push(`${feed}: ${getErrorMessage(error)}`);
        }
    }
    const queryResults = [];
    const queries = normalizeStringArray(config.queries);
    const tags = normalizeStringArray(config.queryTags);
    for (const query of queries) {
        try {
            queryResults.push({
                query,
                response: await searchHackerNews(query, {
                    earliestUnixTime,
                    hitsPerPage: queryLimit,
                    tags,
                }),
            });
        }
        catch (error) {
            warnings.push(`${query}: ${getErrorMessage(error)}`);
        }
    }
    rawFiles.push(await writeRawJson("hackernews", runId, "hackernews-results.json", {
        feeds: feedResults,
        fetchedAt: new Date().toISOString(),
        instanceId: options.instanceId,
        queryResults,
        windowHours,
    }));
    await writeConnectorState("hackernews", updateStateWithRun(state, {
        at: new Date().toISOString(),
        rawFiles,
        runId,
        status: rawFiles.length > 0 ? "success" : "skipped",
        warnings,
    }));
    return {
        connectorId: "hackernews",
        message: `Fetched ${feedResults.length} Hacker News feed(s) and ${queryResults.length} search quer${queryResults.length === 1 ? "y" : "ies"}.`,
        rawFiles,
        runId,
        statePath: "~/.openwiki/connectors/hackernews/state.json",
        status: rawFiles.length > 0 ? "success" : "skipped",
        warnings,
    };
}
async function hnFirebaseApi(endpointPath) {
    const response = await fetch(`${HN_FIREBASE_BASE_URL}${endpointPath}`);
    if (!response.ok) {
        throw new Error(`Hacker News API request failed: ${response.status} ${response.statusText}`);
    }
    return (await response.json());
}
async function searchHackerNews(query, { earliestUnixTime, hitsPerPage, tags, }) {
    const url = new URL(HN_ALGOLIA_SEARCH_URL);
    url.searchParams.set("query", query);
    url.searchParams.set("hitsPerPage", String(hitsPerPage));
    if (tags.length > 0) {
        url.searchParams.set("tags", tags.join(","));
    }
    if (earliestUnixTime !== null) {
        url.searchParams.set("numericFilters", `created_at_i>${earliestUnixTime}`);
    }
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Hacker News search request failed: ${response.status} ${response.statusText}`);
    }
    return (await response.json());
}
function normalizeFeeds(optionFeeds, configFeeds) {
    const feeds = optionFeeds?.length ? optionFeeds : configFeeds;
    return (feeds?.length ? feeds : DEFAULT_FEEDS).filter(isHackerNewsFeed);
}
function isHackerNewsFeed(value) {
    return (value === "ask" ||
        value === "best" ||
        value === "job" ||
        value === "new" ||
        value === "show" ||
        value === "top");
}
function normalizeStringArray(value) {
    return Array.isArray(value)
        ? value.filter((item) => typeof item === "string" && item.trim().length > 0)
        : [];
}
function isWithinWindow(itemUnixTime, earliestUnixTime) {
    return earliestUnixTime === null || (itemUnixTime ?? 0) >= earliestUnixTime;
}
function normalizeWindowHours(windowHours) {
    if (typeof windowHours !== "number" || !Number.isFinite(windowHours)) {
        return null;
    }
    return Math.max(1, Math.min(168, Math.trunc(windowHours)));
}
function getOptionLimit(optionLimit, configLimit, max) {
    const limit = optionLimit ?? configLimit ?? max;
    return Math.max(1, Math.min(max, Math.trunc(limit)));
}
function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
