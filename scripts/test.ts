/**
 * DocPulse MCP — smoke test
 *
 * Calls handler functions directly (no MCP wire protocol) so the test runs
 * without a running server.  Three things are exercised:
 *
 *   1. extract_document  — base64 plain-text fixture → extractor pipeline
 *   2. parse_fields      — pre-extracted text + ANTHROPIC_API_KEY → Claude
 *   3. summarize_document — same text → Claude
 *
 * For PDF/DOCX/image extraction over a live URL, pass SMOKE_PDF_URL=<url>
 * and the first test will fetch and parse it instead of the inline fixture.
 *
 *   SMOKE_PDF_URL=https://www.africau.edu/images/default/sample.pdf \
 *   ts-node scripts/test.ts
 */

import "dotenv/config";
import { handleToolCall } from "../src/tools/handler";

// ---------------------------------------------------------------------------
// Fixture — a plain-text "document" that doubles as the extraction subject
// ---------------------------------------------------------------------------
const FIXTURE_TEXT = `
DocPulse Technical Overview
============================
Title: DocPulse MCP Server
Author: Colossal API Team
Date: 2024-01-15
Subject: Document extraction and summarization via Claude AI

Introduction
------------
DocPulse is a Model Context Protocol (MCP) server that lets AI agents extract
text from PDF, DOCX, images (OCR), and spreadsheets.  It uses Claude AI to
parse structured fields, summarize content, and answer questions about documents.

Key features
------------
- PDF extraction via pdf-parse
- Word/DOCX extraction via mammoth
- Image OCR via tesseract.js
- Excel/CSV parsing via xlsx
- Claude-powered summarization and field extraction
- Dual transport: stdio (default) and HTTP

Usage
-----
Set ANTHROPIC_API_KEY in .env, then run:
  npx ts-node src/index.ts        # stdio transport (for Claude Desktop etc.)
  TRANSPORT=http node dist/index.js  # HTTP transport

Conclusion
----------
DocPulse simplifies document-processing pipelines for AI-powered applications
by exposing a clean MCP interface that any compatible agent can consume.
`.trim();

const FIXTURE_B64 = Buffer.from(FIXTURE_TEXT, "utf-8").toString("base64");

// ---------------------------------------------------------------------------
// Tiny helpers
// ---------------------------------------------------------------------------

const BAR = "─".repeat(62);

function section(label: string): void {
  console.log(`\n${BAR}\n  ${label}\n${BAR}`);
}

function ok(output: string): void {
  console.log("✅  PASS\n");
  console.log(output);
}

function fail(err: unknown): void {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
  console.log("❌  FAIL\n");
  console.log(msg);
}

// ---------------------------------------------------------------------------
// Test 1 — extract_document
// ---------------------------------------------------------------------------
async function testExtract(): Promise<string> {
  const pdfUrl = process.env["SMOKE_PDF_URL"];

  if (pdfUrl) {
    section(`TEST 1 — extract_document  (live PDF URL)\n  ${pdfUrl}`);
    try {
      const raw = await handleToolCall("extract_document", {
        url: pdfUrl,
        document_type: "pdf",
      });
      const result = JSON.parse(raw) as {
        text: string;
        type: string;
        character_count: number;
        word_count: number;
      };
      ok(
        `type            : ${result.type}\n` +
          `character_count : ${result.character_count}\n` +
          `word_count      : ${result.word_count}\n\n` +
          `text (first 300 chars):\n${result.text.slice(0, 300)}…`
      );
      return result.text;
    } catch (err) {
      fail(err);
      return FIXTURE_TEXT; // fall back so later tests still run
    }
  }

  // ---- inline fixture path (default when no live URL is available) --------
  section(
    "TEST 1 — extract_document  (base64 plain-text fixture)\n" +
      "  Note: set SMOKE_PDF_URL=<url> to test PDF extraction over a live URL."
  );

  try {
    const raw = await handleToolCall("extract_document", {
      base64: FIXTURE_B64,
      document_type: "text",
    });
    const result = JSON.parse(raw) as {
      text: string;
      type: string;
      character_count: number;
      word_count: number;
    };
    ok(
      `type            : ${result.type}\n` +
        `character_count : ${result.character_count}\n` +
        `word_count      : ${result.word_count}\n\n` +
        `text (first 200 chars):\n${result.text.slice(0, 200)}…`
    );
    return result.text;
  } catch (err) {
    fail(err);
    return FIXTURE_TEXT;
  }
}

// ---------------------------------------------------------------------------
// Test 2 — parse_fields
// ---------------------------------------------------------------------------
async function testParseFields(text: string): Promise<void> {
  section('TEST 2 — parse_fields\n  fields: ["title","author","date","subject"]');

  try {
    const raw = await handleToolCall("parse_fields", {
      text,
      fields: ["title", "author", "date", "subject"],
      schema: {
        title: "The document or product title",
        author: "The author or team that produced the document",
        date: "Publication or creation date",
        subject: "The subject or topic of the document",
      },
    });
    ok(raw);
  } catch (err) {
    fail(err);
  }
}

// ---------------------------------------------------------------------------
// Test 3 — summarize_document
// ---------------------------------------------------------------------------
async function testSummarize(text: string): Promise<void> {
  section("TEST 3 — summarize_document  (style: concise, max_length: 80)");

  try {
    const summary = await handleToolCall("summarize_document", {
      text,
      style: "concise",
      max_length: 80,
    });
    ok(summary);
  } catch (err) {
    fail(err);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║           DocPulse MCP — smoke test                         ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  if (!process.env["ANTHROPIC_API_KEY"]) {
    console.warn(
      "\n⚠️  ANTHROPIC_API_KEY not set — tests 2 and 3 will fail.\n" +
        "   Copy .env.example to .env and add your key.\n"
    );
  }

  const text = await testExtract();
  await testParseFields(text);
  await testSummarize(text);

  console.log(`\n${BAR}\n  Done.\n${BAR}\n`);
}

main().catch((err: unknown) => {
  console.error("Fatal:", err);
  process.exit(1);
});
