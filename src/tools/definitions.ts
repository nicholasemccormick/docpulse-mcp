import { Tool } from "@modelcontextprotocol/sdk/types.js";

// ---------------------------------------------------------------------------
// Shared sub-schemas (reused across tools)
// ---------------------------------------------------------------------------

const documentSourceProperties = {
  url: {
    type: "string" as const,
    description: "Remote URL to fetch the document from (http/https).",
  },
  file_path: {
    type: "string" as const,
    description: "Absolute local file path of the document.",
  },
  base64: {
    type: "string" as const,
    description: "Base64-encoded document bytes.",
  },
  mime_type: {
    type: "string" as const,
    description:
      "MIME type hint used for format auto-detection " +
      "(e.g. application/pdf, image/png, application/vnd.openxmlformats-officedocument.wordprocessingml.document).",
  },
  document_type: {
    type: "string" as const,
    enum: ["pdf", "docx", "image", "excel", "text", "auto"],
    default: "auto",
    description:
      'Explicit document format. Use "auto" (default) to detect from mime_type or file extension.',
  },
};

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export const TOOL_DEFINITIONS: Tool[] = [
  {
    name: "extract_document",
    description:
      "Extract raw text content from a document. " +
      "Supports PDF (pdf-parse), Word/DOCX (mammoth), images via OCR (tesseract.js), " +
      "Excel/CSV (xlsx), and plain text. " +
      "Accepts a remote URL, a local file path, or base64-encoded bytes. " +
      "Returns the extracted text plus character and word counts.",
    inputSchema: {
      type: "object",
      properties: documentSourceProperties,
      additionalProperties: false,
    },
  },

  {
    name: "summarize_document",
    description:
      "Extract text from a document and summarize it with Claude AI. " +
      "Works with any supported format (PDF, DOCX, image, Excel, plain text). " +
      "You can also pass pre-extracted text directly via the `text` field. " +
      "Offers three styles: concise (default), detailed, and bullet-points.",
    inputSchema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "Pre-extracted text to summarize (skips document loading).",
        },
        ...documentSourceProperties,
        max_length: {
          type: "number",
          default: 500,
          description: "Target word count for the summary (default: 500).",
        },
        style: {
          type: "string",
          enum: ["concise", "detailed", "bullet-points"],
          default: "concise",
          description: "Summary style (default: concise).",
        },
        focus_area: {
          type: "string",
          description: "Optional topic or section to focus the summary on.",
        },
      },
      additionalProperties: false,
    },
  },

  {
    name: "parse_fields",
    description:
      "Extract specific named fields from a document using Claude AI. " +
      "Returns a JSON object with the requested field names as keys and extracted values as strings " +
      "(null when a field is not found). " +
      "Ideal for structured extraction from invoices, contracts, receipts, forms, etc. " +
      "You can pass pre-extracted text via `text` or provide a document source.",
    inputSchema: {
      type: "object",
      required: ["fields"],
      properties: {
        text: {
          type: "string",
          description: "Pre-extracted text to parse (skips document loading).",
        },
        ...documentSourceProperties,
        fields: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          description: 'Field names to extract, e.g. ["invoice_number","total_amount","vendor_name"].',
        },
        schema: {
          type: "object",
          additionalProperties: { type: "string" },
          description:
            "Optional per-field descriptions that improve extraction accuracy, " +
            'e.g. {"total_amount": "The grand total including taxes"}.',
        },
      },
      additionalProperties: false,
    },
  },

  {
    name: "analyze_document",
    description:
      "Answer a specific question about a document using Claude AI. " +
      "Works with any supported format (PDF, DOCX, image, Excel, plain text). " +
      "You can also pass pre-extracted text directly via the `text` field.",
    inputSchema: {
      type: "object",
      required: ["question"],
      properties: {
        text: {
          type: "string",
          description: "Pre-extracted text to analyze (skips document loading).",
        },
        ...documentSourceProperties,
        question: {
          type: "string",
          description: "The question to answer about the document.",
        },
      },
      additionalProperties: false,
    },
  },
];
