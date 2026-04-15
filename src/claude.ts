import Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Singleton client
// ---------------------------------------------------------------------------

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY environment variable is required. " +
          "Set it in your environment or copy .env.example to .env and fill it in."
      );
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

const DEFAULT_MODEL = "claude-opus-4-6";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function chat(prompt: string, maxTokens: number): Promise<string> {
  const response = await getClient().messages.create({
    model: DEFAULT_MODEL,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });
  const block = response.content[0];
  if (block.type !== "text") throw new Error("Unexpected non-text response from Claude");
  return block.text;
}

// ---------------------------------------------------------------------------
// summarizeDocument
// ---------------------------------------------------------------------------

export interface SummarizeOptions {
  text: string;
  /** Target word-count for the summary (default: 500) */
  maxLength?: number;
  style?: "concise" | "detailed" | "bullet-points";
  /** Optional topic focus */
  focusArea?: string;
}

export async function summarizeDocument(options: SummarizeOptions): Promise<string> {
  const { text, maxLength = 500, style = "concise", focusArea } = options;

  const styleInstructions: Record<typeof style, string> = {
    concise: "Write a concise summary in 2–3 paragraphs.",
    detailed: "Write a detailed, comprehensive summary covering all major points.",
    "bullet-points": "Write the summary as a bulleted list of key points.",
  };

  const focusLine = focusArea ? `\nFocus especially on: ${focusArea}` : "";

  const prompt =
    `Please summarize the following document.\n\n` +
    `${styleInstructions[style]}${focusLine}\n` +
    `Target length: approximately ${maxLength} words.\n\n` +
    `Document:\n${text}`;

  // Allow up to 2× the target word count in tokens (rough heuristic)
  return chat(prompt, Math.min(maxLength * 3, 4096));
}

// ---------------------------------------------------------------------------
// parseFields
// ---------------------------------------------------------------------------

export interface ParseFieldsOptions {
  text: string;
  /** Names of the fields to extract */
  fields: string[];
  /** Optional per-field descriptions that improve extraction accuracy */
  schema?: Record<string, string>;
}

export async function parseFields(
  options: ParseFieldsOptions
): Promise<Record<string, string | null>> {
  const { text, fields, schema = {} } = options;

  const fieldList = fields
    .map((f) => (schema[f] ? `- ${f}: ${schema[f]}` : `- ${f}`))
    .join("\n");

  const prompt =
    `Extract the following fields from the document below.\n` +
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
    return JSON.parse(cleaned) as Record<string, string | null>;
  } catch {
    throw new Error(
      `Failed to parse field-extraction response as JSON.\nRaw response:\n${raw}`
    );
  }
}

// ---------------------------------------------------------------------------
// analyzeDocument
// ---------------------------------------------------------------------------

export interface AnalyzeOptions {
  text: string;
  question: string;
}

export async function analyzeDocument(options: AnalyzeOptions): Promise<string> {
  const { text, question } = options;

  const prompt =
    `Based on the document below, answer the following question:\n\n` +
    `Question: ${question}\n\n` +
    `Document:\n${text}`;

  return chat(prompt, 2048);
}
