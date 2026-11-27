export interface AdifDocument {
  header_text: string;
  headers: Record<string, string>;
  columns: string[];
  records: Record<string, string>[];
}

export type BulkOperation =
  | { type: "FILL"; column: string; value: string; onlyEmpty: boolean }
  | { type: "REPLACE"; column: string; find: string; replace: string; useRegex: boolean }
  | { type: "CASE"; column: string; mode: "UPPER" | "LOWER" }
  | { type: "COPY_FROM"; targetColumn: string; sourceColumn: string }
  | { type: "DERIVE_BAND_FROM_FREQ" };
