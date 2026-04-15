#!/usr/bin/env node
import "dotenv/config";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import http from "http";

import { TOOL_DEFINITIONS } from "./tools/definitions";
import { handleToolCall } from "./tools/handler";

// ---------------------------------------------------------------------------
// MCP Server setup
// ---------------------------------------------------------------------------

const server = new Server(
  { name: "docpulse-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOL_DEFINITIONS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const text = await handleToolCall(name, args ?? {});
    return { content: [{ type: "text" as const, text }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text" as const, text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// ---------------------------------------------------------------------------
// Transport selection
// ---------------------------------------------------------------------------

const TRANSPORT = (process.env["TRANSPORT"] ?? "stdio").toLowerCase();
const PORT = parseInt(process.env["PORT"] ?? "3000", 10);

async function startStdio(): Promise<void> {
  const transport = new StdioServerTransport();
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
function startHTTP(): void {
  const httpServer = http.createServer((req, res) => {
    // Health check
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", name: "docpulse-mcp", version: "1.0.0" }));
      return;
    }

    // MCP JSON-RPC endpoint
    if (req.method === "POST" && req.url === "/mcp") {
      let body = "";
      req.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on("end", async () => {
        try {
          const parsed = JSON.parse(body) as {
            tool?: string;
            arguments?: unknown;
            [key: string]: unknown;
          };
          const toolName = String(parsed["tool"] ?? "");
          const toolArgs = parsed["arguments"] ?? {};
          const result = await handleToolCall(toolName, toolArgs);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ result }));
        } catch (err) {
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
    process.stderr.write(
      `[docpulse-mcp] HTTP server listening on port ${PORT}\n` +
        `  POST /mcp   — call a tool\n` +
        `  GET  /health — health check\n`
    );
  });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (TRANSPORT === "http") {
    startHTTP();
  } else {
    await startStdio();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(
    `[docpulse-mcp] Fatal error: ${err instanceof Error ? err.stack : String(err)}\n`
  );
  process.exit(1);
});
