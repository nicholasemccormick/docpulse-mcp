import { extractDocument, ExtractOptions } from "../extractor";
import { summarizeDocument, parseFields, analyzeDocument } from "../claude";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Build ExtractOptions from raw tool arguments (snake_case from MCP callers).
 */
function buildExtractOptions(a: Record<string, unknown>): ExtractOptions {
  return {
    url: a["url"] as string | undefined,
    filePath: a["file_path"] as string | undefined,
    base64: a["base64"] as string | undefined,
    mimeType: a["mime_type"] as string | undefined,
    type: (a["document_type"] as ExtractOptions["type"]) ?? "auto",
  };
}

/**
 * Return pre-extracted text if provided, otherwise extract it from the
 * document source embedded in the arguments.
 */
async function resolveText(a: Record<string, unknown>): Promise<string> {
  if (typeof a["text"] === "string" && a["text"].length > 0) {
    return a["text"];
  }

  if (!a["url"] && !a["file_path"] && !a["base64"]) {
    throw new Error(
      "Must provide one of: text (pre-extracted), url, file_path, or base64."
    );
  }

  const result = await extractDocument(buildExtractOptions(a));
  return result.text;
}

// ---------------------------------------------------------------------------
// Tool dispatcher
// ---------------------------------------------------------------------------

/**
 * Route an MCP tool call to the appropriate handler and return a plain string
 * result. Throws on validation or processing errors.
 */
export async function handleToolCall(
  name: string,
  args: unknown
): Promise<string> {
  const a = (args ?? {}) as Record<string, unknown>;

  switch (name) {
    // -----------------------------------------------------------------------
    case "extract_document": {
      const opts = buildExtractOptions(a);
      if (!opts.url && !opts.filePath && !opts.base64) {
        throw new Error("Must provide one of: url, file_path, or base64.");
      }
      const result = await extractDocument(opts);
      return JSON.stringify(
        {
          text: result.text,
          type: result.type,
          character_count: result.characterCount,
          word_count: result.wordCount,
        },
        null,
        2
      );
    }

    // -----------------------------------------------------------------------
    case "summarize_document": {
      const text = await resolveText(a);

      const style = a["style"] as
        | "concise"
        | "detailed"
        | "bullet-points"
        | undefined;

      return summarizeDocument({
        text,
        maxLength: typeof a["max_length"] === "number" ? a["max_length"] : undefined,
        style: style ?? "concise",
        focusArea: a["focus_area"] as string | undefined,
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
      const schema: Record<string, string> =
        rawSchema && typeof rawSchema === "object" && !Array.isArray(rawSchema)
          ? (rawSchema as Record<string, string>)
          : {};

      const text = await resolveText(a);
      const extracted = await parseFields({ text, fields, schema });
      return JSON.stringify(extracted, null, 2);
    }

    // -----------------------------------------------------------------------
    case "analyze_document": {
      if (typeof a["question"] !== "string" || a["question"].trim() === "") {
        throw new Error('"question" is required and must be a non-empty string.');
      }
      const text = await resolveText(a);
      return analyzeDocument({ text, question: a["question"] });
    }

    // -----------------------------------------------------------------------
    default:
      throw new Error(`Unknown tool: "${name}"`);
  }
}
