import { LocalShellBackend, } from "deepagents";
import { OPEN_WIKI_DIR } from "../constants.js";
export class OpenWikiLocalShellBackend extends LocalShellBackend {
    docsOnly;
    outputMode;
    constructor(options) {
        super(options);
        this.docsOnly = options.docsOnly === true;
        this.outputMode = options.outputMode ?? "repository";
    }
    async write(filePath, content) {
        const error = this.getDocsOnlyWriteError(filePath);
        if (error) {
            return { error };
        }
        return super.write(filePath, content);
    }
    async edit(filePath, oldString, newString, replaceAll) {
        const error = this.getDocsOnlyWriteError(filePath);
        if (error) {
            return { error };
        }
        return super.edit(filePath, oldString, newString, replaceAll);
    }
    getDocsOnlyWriteError(filePath) {
        if (!this.docsOnly ||
            this.outputMode === "local-wiki" ||
            isOpenWikiDocsPath(filePath)) {
            return null;
        }
        return `OpenWiki repository init/update runs may only write under /${OPEN_WIKI_DIR}/. Refused path: ${filePath}`;
    }
}
export function isOpenWikiDocsPath(filePath) {
    const normalizedPath = filePath.trim().replace(/\\/gu, "/");
    const virtualPath = normalizedPath.replace(/^\/+/u, "");
    return (virtualPath === OPEN_WIKI_DIR || virtualPath.startsWith(`${OPEN_WIKI_DIR}/`));
}
