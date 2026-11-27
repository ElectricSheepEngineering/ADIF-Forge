export interface AdifDocument {
  header_text: string;
  headers: Record<string, string>;
  columns: string[];
  records: Record<string, string>[];
}

export interface ParseOutcome {
  document: AdifDocument;
  warnings: string[];
}
