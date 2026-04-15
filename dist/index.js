#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const http_1 = __importDefault(require("http"));
const definitions_1 = require("./tools/definitions");
const handler_1 = require("./tools/handler");
// ---------------------------------------------------------------------------
// MCP Server setup
// ---------------------------------------------------------------------------
const server = new index_js_1.Server({ name: "docpulse-mcp", version: "1.0.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({
    tools: definitions_1.TOOL_DEFINITIONS,
}));
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        const text = await (0, handler_1.handleToolCall)(name, args ?? {});
        return { content: [{ type: "text", text }] };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
            content: [{ type: "text", text: `Error: ${message}` }],
            isError: true,
        };
    }
});
// ---------------------------------------------------------------------------
// Transport selection
// ---------------------------------------------------------------------------
const TRANSPORT = (process.env["TRANSPORT"] ?? "stdio").toLowerCase();
const PORT = parseInt(process.env["PORT"] ?? "3000", 10);
async function startStdio() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    process.stderr.write("[docpulse-mcp] Running on stdio transport\n");
}
/**
 * Minimal HTTP wrapper that exposes a health endpoint and a JSON-RPC endpoint.
 *
 * For production SSE-based MCP over HTTP you would swap this for the
 * @modelcontextprotocol/sdk SSEServerTransport once your hosting environment
 * supports it.
 */
function startHTTP() {
    const httpServer = http_1.default.createServer((req, res) => {
        // Health check
        if (req.method === "GET" && req.url === "/health") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ status: "ok", name: "docpulse-mcp", version: "1.0.0" }));
            return;
        }
        // MCP JSON-RPC endpoint
        if (req.method === "POST" && req.url === "/mcp") {
            let body = "";
            req.on("data", (chunk) => {
                body += chunk.toString();
            });
            req.on("end", async () => {
                try {
                    const parsed = JSON.parse(body);
                    const toolName = String(parsed["tool"] ?? "");
                    const toolArgs = parsed["arguments"] ?? {};
                    const result = await (0, handler_1.handleToolCall)(toolName, toolArgs);
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ result }));
                }
                catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: message }));
                }
            });
            return;
        }
        res.writeHead(404);
        res.end("Not Found");
    });
    httpServer.listen(PORT, () => {
        process.stderr.write(`[docpulse-mcp] HTTP server listening on port ${PORT}\n` +
            `  POST /mcp   — call a tool\n` +
            `  GET  /health — health check\n`);
    });
}
// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
async function main() {
    if (TRANSPORT === "http") {
        startHTTP();
    }
    else {
        await startStdio();
    }
}
main().catch((err) => {
    process.stderr.write(`[docpulse-mcp] Fatal error: ${err instanceof Error ? err.stack : String(err)}\n`);
    process.exit(1);
});
//# sourceMappingURL=index.js.map