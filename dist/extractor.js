"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractDocument = extractDocument;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// Lazy-loaded to avoid top-level import issues with CJS/ESM boundaries
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodeFetch = (...args) => Promise.resolve().then(() => __importStar(require("node-fetch"))).then(({ default: f }) => f(...args));
async function fetchBuffer(url) {
    const res = await nodeFetch(url);
    if (!res.ok)
        throw new Error(`HTTP ${res.status} fetching ${url}`);
    return Buffer.from(await res.arrayBuffer());
}
async function resolveBuffer(source) {
    if (Buffer.isBuffer(source))
        return source;
    if (source.startsWith("http://") || source.startsWith("https://")) {
        return fetchBuffer(source);
    }
    return fs_1.default.promises.readFile(source);
}
// ---------------------------------------------------------------------------
// Format-specific extractors
// ---------------------------------------------------------------------------
async function extractPDF(source) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require("pdf-parse");
    const buf = await resolveBuffer(source);
    const data = await pdfParse(buf);
    return data.text;
}
async function extractDOCX(source) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mammoth = require("mammoth");
    const buf = await resolveBuffer(source);
    const result = await mammoth.extractRawText({ buffer: buf });
    return result.value;
}
async function extractImage(source) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createWorker } = require("tesseract.js");
    const worker = await createWorker("eng");
    try {
        const img = Buffer.isBuffer(source)
            ? source
            : source.startsWith("http://") || source.startsWith("https://")
                ? await fetchBuffer(source)
                : source;
        const { data } = await worker.recognize(img);
        return data.text;
    }
    finally {
        await worker.terminate();
    }
}
async function extractExcel(source) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const XLSX = require("xlsx");
    let workbook;
    if (Buffer.isBuffer(source)) {
        workbook = XLSX.read(source, { type: "buffer" });
    }
    else if (source.startsWith("http://") || source.startsWith("https://")) {
        const buf = await fetchBuffer(source);
        workbook = XLSX.read(buf, { type: "buffer" });
    }
    else {
        workbook = XLSX.readFile(source);
    }
    const sheets = workbook.SheetNames.map((name) => {
        const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name]);
        return `=== Sheet: ${name} ===\n${csv}`;
    });
    return sheets.join("\n\n");
}
async function extractPlainText(source) {
    if (Buffer.isBuffer(source))
        return source.toString("utf-8");
    if (source.startsWith("http://") || source.startsWith("https://")) {
        const res = await nodeFetch(source);
        if (!res.ok)
            throw new Error(`HTTP ${res.status} fetching ${source}`);
        return res.text();
    }
    return fs_1.default.promises.readFile(source, "utf-8");
}
function detectType(filePath, mimeType) {
    if (mimeType) {
        if (mimeType.includes("pdf"))
            return "pdf";
        if (mimeType.includes("wordprocessingml") ||
            mimeType.includes("msword") ||
            mimeType.includes("docx"))
            return "docx";
        if (mimeType.startsWith("image/"))
            return "image";
        if (mimeType.includes("spreadsheetml") ||
            mimeType.includes("excel") ||
            mimeType.includes("csv"))
            return "excel";
        if (mimeType.startsWith("text/"))
            return "text";
    }
    if (filePath) {
        const ext = path_1.default.extname(filePath).toLowerCase();
        if (ext === ".pdf")
            return "pdf";
        if (ext === ".docx" || ext === ".doc")
            return "docx";
        if ([".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".webp"].includes(ext))
            return "image";
        if ([".xlsx", ".xls"].includes(ext))
            return "excel";
        if ([".txt", ".md", ".csv"].includes(ext))
            return "text";
    }
    return "text";
}
/**
 * Extract plain text from a document.
 *
 * Exactly one of `url`, `filePath`, or `base64` must be provided.
 */
async function extractDocument(options) {
    const { type = "auto", url, filePath, base64, mimeType } = options;
    if (!url && !filePath && !base64) {
        throw new Error("Must provide exactly one of: url, filePath, or base64");
    }
    const resolvedType = type === "auto" ? detectType(filePath ?? url, mimeType) : type;
    // Build the source the individual extractors understand
    let source;
    if (base64) {
        source = Buffer.from(base64, "base64");
    }
    else if (url) {
        source = url;
    }
    else {
        source = filePath;
    }
    let text;
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
//# sourceMappingURL=extractor.js.map