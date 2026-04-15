"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleToolCall = handleToolCall;
const extractor_1 = require("../extractor");
const claude_1 = require("../claude");
// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
/**
 * Build ExtractOptions from raw tool arguments (snake_case from MCP callers).
 */
function buildExtractOptions(a) {
    return {
        url: a["url"],
        filePath: a["file_path"],
        base64: a["base64"],
        mimeType: a["mime_type"],
        type: a["document_type"] ?? "auto",
    };
}
/**
 * Return pre-extracted text if provided, otherwise extract it from the
 * document source embedded in the arguments.
 */
async function resolveText(a) {
    if (typeof a["text"] === "string" && a["text"].length > 0) {
        return a["text"];
    }
    if (!a["url"] && !a["file_path"] && !a["base64"]) {
        throw new Error("Must provide one of: text (pre-extracted), url, file_path, or base64.");
    }
    const result = await (0, extractor_1.extractDocument)(buildExtractOptions(a));
    return result.text;
}
// ---------------------------------------------------------------------------
// Tool dispatcher
// ---------------------------------------------------------------------------
/**
 * Route an MCP tool call to the appropriate handler and return a plain string
 * result. Throws on validation or processing errors.
 */
async function handleToolCall(name, args) {
    const a = (args ?? {});
    switch (name) {
        // -----------------------------------------------------------------------
        case "extract_document": {
            const opts = buildExtractOptions(a);
            if (!opts.url && !opts.filePath && !opts.base64) {
                throw new Error("Must provide one of: url, file_path, or base64.");
            }
            const result = await (0, extractor_1.extractDocument)(opts);
            return JSON.stringify({
                text: result.text,
                type: result.type,
                character_count: result.characterCount,
                word_count: result.wordCount,
            }, null, 2);
        }
        // -----------------------------------------------------------------------
        case "summarize_document": {
            const text = await resolveText(a);
            const style = a["style"];
            return (0, claude_1.summarizeDocument)({
                text,
                maxLength: typeof a["max_length"] === "number" ? a["max_length"] : undefined,
                style: style ?? "concise",
                focusArea: a["focus_area"],
            });
        }
        // -----------------------------------------------------------------------
        case "parse_fields": {
            const rawFields = a["fields"];
            if (!Array.isArray(rawFields) || rawFields.length === 0) {
                throw new Error('"fields" must be a non-empty array of strings.');
            }
            const fields = rawFields.map((f) => String(f));
            const rawSchema = a["schema"];
            const schema = rawSchema && typeof rawSchema === "object" && !Array.isArray(rawSchema)
                ? rawSchema
                : {};
            const text = await resolveText(a);
            const extracted = await (0, claude_1.parseFields)({ text, fields, schema });
            return JSON.stringify(extracted, null, 2);
        }
        // -----------------------------------------------------------------------
        case "analyze_document": {
            if (typeof a["question"] !== "string" || a["question"].trim() === "") {
                throw new Error('"question" is required and must be a non-empty string.');
            }
            const text = await resolveText(a);
            return (0, claude_1.analyzeDocument)({ text, question: a["question"] });
        }
        // -----------------------------------------------------------------------
        default:
            throw new Error(`Unknown tool: "${name}"`);
    }
}
//# sourceMappingURL=handler.js.map