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
/**
 * Extract plain text from a document.
 *
 * Exactly one of `url`, `filePath`, or `base64` must be provided.
 */
export declare function extractDocument(options: ExtractOptions): Promise<ExtractResult>;
//# sourceMappingURL=extractor.d.ts.map