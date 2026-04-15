"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.summarizeDocument = summarizeDocument;
exports.parseFields = parseFields;
exports.analyzeDocument = analyzeDocument;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
// ---------------------------------------------------------------------------
// Singleton client
// ---------------------------------------------------------------------------
let _client = null;
function getClient() {
    if (!_client) {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            throw new Error("ANTHROPIC_API_KEY environment variable is required. " +
                "Set it in your environment or copy .env.example to .env and fill it in.");
        }
        _client = new sdk_1.default({ apiKey });
    }
    return _client;
}
const DEFAULT_MODEL = "claude-opus-4-6";
// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
async function chat(prompt, maxTokens) {
    const response = await getClient().messages.create({
        model: DEFAULT_MODEL,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
    });
    const block = response.content[0];
    if (block.type !== "text")
        throw new Error("Unexpected non-text response from Claude");
    return block.text;
}
async function summarizeDocument(options) {
    const { text, maxLength = 500, style = "concise", focusArea } = options;
    const styleInstructions = {
        concise: "Write a concise summary in 2–3 paragraphs.",
        detailed: "Write a detailed, comprehensive summary covering all major points.",
        "bullet-points": "Write the summary as a bulleted list of key points.",
    };
    const focusLine = focusArea ? `\nFocus especially on: ${focusArea}` : "";
    const prompt = `Please summarize the following document.\n\n` +
        `${styleInstructions[style]}${focusLine}\n` +
        `Target length: approximately ${maxLength} words.\n\n` +
        `Document:\n${text}`;
    // Allow up to 2× the target word count in tokens (rough heuristic)
    return chat(prompt, Math.min(maxLength * 3, 4096));
}
async function parseFields(options) {
    const { text, fields, schema = {} } = options;
    const fieldList = fields
        .map((f) => (schema[f] ? `- ${f}: ${schema[f]}` : `- ${f}`))
        .join("\n");
    const prompt = `Extract the following fields from the document below.\n` +
        `Return a valid JSON object — keys are the field names, values are strings (or null if not found).\n` +
        `Do NOT wrap the JSON in markdown code fences.\n\n` +
        `Fields:\n${fieldList}\n\n` +
        `Document:\n${text}`;
    const raw = await chat(prompt, 2048);
    // Strip accidental markdown code fences
    const cleaned = raw
        .replace(/^```(?:json)?\s*/m, "")
        .replace(/\s*```$/m, "")
        .trim();
    try {
        return JSON.parse(cleaned);
    }
    catch {
        throw new Error(`Failed to parse field-extraction response as JSON.\nRaw response:\n${raw}`);
    }
}
async function analyzeDocument(options) {
    const { text, question } = options;
    const prompt = `Based on the document below, answer the following question:\n\n` +
        `Question: ${question}\n\n` +
        `Document:\n${text}`;
    return chat(prompt, 2048);
}
//# sourceMappingURL=claude.js.map