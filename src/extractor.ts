import fs from "fs";
import path from "path";

// Lazy-loaded to avoid top-level import issues with CJS/ESM boundaries
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodeFetch = (...args: Parameters<typeof fetch>) =>
  import("node-fetch").then(({ default: f }) => (f as unknown as typeof fetch)(...args));

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await nodeFetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function resolveBuffer(source: string | Buffer): Promise<Buffer> {
  if (Buffer.isBuffer(source)) return source;
  if (source.startsWith("http://") || source.startsWith("https://")) {
    return fetchBuffer(source);
  }
  return fs.promises.readFile(source);
}

// ---------------------------------------------------------------------------
// Format-specific extractors
// ---------------------------------------------------------------------------

async function extractPDF(source: string | Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
  const buf = await resolveBuffer(source);
  const data = await pdfParse(buf);
  return data.text;
}

async function extractDOCX(source: string | Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mammoth = require("mammoth") as {
    extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>;
  };
  const buf = await resolveBuffer(source);
  const result = await mammoth.extractRawText({ buffer: buf });
  return result.value;
}

async function extractImage(source: string | Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createWorker } = require("tesseract.js") as {
    createWorker: (lang: string) => Promise<{
      recognize: (img: string | Buffer) => Promise<{ data: { text: string } }>;
      terminate: () => Promise<void>;
    }>;
  };
  const worker = await createWorker("eng");
  try {
    const img: string | Buffer = Buffer.isBuffer(source)
      ? source
      : source.startsWith("http://") || source.startsWith("https://")
      ? await fetchBuffer(source)
      : source;
    const { data } = await worker.recognize(img);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

async function extractExcel(source: string | Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const XLSX = require("xlsx") as {
    readFile: (p: string) => XLSXWorkbook;
    read: (buf: Buffer, opts: { type: "buffer" }) => XLSXWorkbook;
    utils: { sheet_to_csv: (sheet: unknown) => string };
  };

  interface XLSXWorkbook {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
  }

  let workbook: XLSXWorkbook;
  if (Buffer.isBuffer(source)) {
    workbook = XLSX.read(source, { type: "buffer" });
  } else if (source.startsWith("http://") || source.startsWith("https://")) {
    const buf = await fetchBuffer(source);
    workbook = XLSX.read(buf, { type: "buffer" });
  } else {
    workbook = XLSX.readFile(source);
  }

  const sheets: string[] = workbook.SheetNames.map((name) => {
    const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name]);
    return `=== Sheet: ${name} ===\n${csv}`;
  });
  return sheets.join("\n\n");
}

async function extractPlainText(source: string | Buffer): Promise<string> {
  if (Buffer.isBuffer(source)) return source.toString("utf-8");
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const res = await nodeFetch(source);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${source}`);
    return res.text();
  }
  return fs.promises.readFile(source, "utf-8");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type DocumentType = "pdf" | "docx" | "image" | "excel" | "text" | "auto";

export interface ExtractOptions {
  /** Document type override; defaults to "auto" */
  type?: DocumentType;
  /** Remote URL to fetch the document from */
  url?: string;
  /** Absolute local file path */
  filePath?: string;
  /** Base64-encoded document bytes */
  base64?: string;
  /** MIME type hint used when type is "auto" */
  mimeType?: string;
}

export interface ExtractResult {
  text: string;
  type: DocumentType;
  characterCount: number;
  wordCount: number;
}

function detectType(filePath?: string, mimeType?: string): DocumentType {
  if (mimeType) {
    if (mimeType.includes("pdf")) return "pdf";
    if (
      mimeType.includes("wordprocessingml") ||
      mimeType.includes("msword") ||
      mimeType.includes("docx")
    )
      return "docx";
    if (mimeType.startsWith("image/")) return "image";
    if (
      mimeType.includes("spreadsheetml") ||
      mimeType.includes("excel") ||
      mimeType.includes("csv")
    )
      return "excel";
    if (mimeType.startsWith("text/")) return "text";
  }
  if (filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".pdf") return "pdf";
    if (ext === ".docx" || ext === ".doc") return "docx";
    if ([".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".webp"].includes(ext)) return "image";
    if ([".xlsx", ".xls"].includes(ext)) return "excel";
    if ([".txt", ".md", ".csv"].includes(ext)) return "text";
  }
  return "text";
}

/**
 * Extract plain text from a document.
 *
 * Exactly one of `url`, `filePath`, or `base64` must be provided.
 */
export async function extractDocument(options: ExtractOptions): Promise<ExtractResult> {
  const { type = "auto", url, filePath, base64, mimeType } = options;

  if (!url && !filePath && !base64) {
    throw new Error("Must provide exactly one of: url, filePath, or base64");
  }

  const resolvedType: DocumentType =
    type === "auto" ? detectType(filePath ?? url, mimeType) : type;

  // Build the source the individual extractors understand
  let source: string | Buffer;
  if (base64) {
    source = Buffer.from(base64, "base64");
  } else if (url) {
    source = url;
  } else {
    source = filePath!;
  }

  let text: string;
  switch (resolvedType) {
    case "pdf":
      text = await extractPDF(source);
      break;
    case "docx":
      text = await extractDOCX(source);
      break;
    case "image":
      text = await extractImage(source);
      break;
    case "excel":
      text = await extractExcel(source);
      break;
    default:
      text = await extractPlainText(source);
  }

  const trimmed = text.trim();
  return {
    text: trimmed,
    type: resolvedType,
    characterCount: trimmed.length,
    wordCount: trimmed.split(/\s+/).filter(Boolean).length,
  };
}
