#!/usr/bin/env node
import "dotenv/config";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import express, { Request, Response } from "express";

import { TOOL_DEFINITIONS } from "./tools/definitions";
import { handleToolCall } from "./tools/handler";

// ---------------------------------------------------------------------------
// MCP Server factory
// ---------------------------------------------------------------------------

/**
 * Create a fresh Server instance.  For stateless HTTP mode we call this once
 * per request so each transport gets its own server with no shared state.
 */
function createServer(): Server {
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

  return server;
}

// ---------------------------------------------------------------------------
// Transport selection
// ---------------------------------------------------------------------------

const TRANSPORT = (process.env["TRANSPORT"] ?? "stdio").toLowerCase();
const PORT = parseInt(process.env["PORT"] ?? "3000", 10);

async function startStdio(): Promise<void> {
  const transport = new StdioServerTransport();
  await createServer().connect(transport);
  process.stderr.write("[docpulse-mcp] Running on stdio transport\n");
}

/**
 * Stateless StreamableHTTP mode — required by Smithery and other hosted
 * MCP runtimes.
 *
 * A new transport (and server) instance is created per POST request so there
 * is no shared transport state across calls.  This is the pattern documented
 * in the MCP SDK for stateless deployments:
 *
 *   sessionIdGenerator: undefined  →  stateless (no Mcp-Session-Id header)
 */
function startHTTP(): void {
  const app = express();
  app.use(express.json());

  // ----- MCP endpoint -------------------------------------------------------
  app.post("/mcp", async (req: Request, res: Response) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await createServer().connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  // ----- Health check -------------------------------------------------------
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", name: "docpulse-mcp", version: "1.0.0" });
  });

  app.listen(PORT, () => {
    process.stderr.write(
      `[docpulse-mcp] HTTP server listening on port ${PORT}\n` +
        `  POST /mcp    — StreamableHTTP MCP endpoint\n` +
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
