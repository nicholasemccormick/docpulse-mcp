export interface SummarizeOptions {
    text: string;
    /** Target word-count for the summary (default: 500) */
    maxLength?: number;
    style?: "concise" | "detailed" | "bullet-points";
    /** Optional topic focus */
    focusArea?: string;
}
export declare function summarizeDocument(options: SummarizeOptions): Promise<string>;
export interface ParseFieldsOptions {
    text: string;
    /** Names of the fields to extract */
    fields: string[];
    /** Optional per-field descriptions that improve extraction accuracy */
    schema?: Record<string, string>;
}
export declare function parseFields(options: ParseFieldsOptions): Promise<Record<string, string | null>>;
export interface AnalyzeOptions {
    text: string;
    question: string;
}
export declare function analyzeDocument(options: AnalyzeOptions): Promise<string>;
//# sourceMappingURL=claude.d.ts.map