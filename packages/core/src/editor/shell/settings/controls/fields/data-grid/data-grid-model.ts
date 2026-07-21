export type DataGridColumnType = "number" | "text";

export interface DataGridValue {
  columnIds?: string[];
  columnTypes?: DataGridColumnType[];
  headers: string[];
  rowIds?: string[];
  rows: string[][];
}

export const DEFAULT_DATA_GRID_VALUE: DataGridValue = {
  headers: ["Column 1", "Column 2"],
  rows: [["", ""]],
};

export function normalizeDataGridValue(value: unknown): DataGridValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_DATA_GRID_VALUE;
  }

  const record = value as Record<string, unknown>;
  const headers = readStringArray(record["headers"]);
  const rawRows = Array.isArray(record["rows"]) ? record["rows"] : [];
  const width = Math.max(
    headers.length,
    ...rawRows.map((row) => (Array.isArray(row) ? row.length : 0)),
    2,
  );
  const normalizedHeaders = Array.from(
    { length: width },
    (_, index) => headers[index] ?? `Column ${index + 1}`,
  );
  const rows = rawRows
    .filter(Array.isArray)
    .map((row) =>
      normalizedHeaders.map((_, index) => (row[index] == null ? "" : String(row[index]))),
    );

  return {
    ...(readStringArray(record["columnIds"]).length > 0
      ? { columnIds: readStringArray(record["columnIds"]).slice(0, width) }
      : {}),
    ...(readColumnTypes(record["columnTypes"]).length > 0
      ? { columnTypes: readColumnTypes(record["columnTypes"]).slice(0, width) }
      : {}),
    headers: normalizedHeaders,
    ...(readStringArray(record["rowIds"]).length > 0
      ? { rowIds: readStringArray(record["rowIds"]).slice(0, rows.length) }
      : {}),
    rows: rows.length > 0 ? rows : [normalizedHeaders.map(() => "")],
  };
}

export function parseClipboardTable(text: string): string[][] {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line, index, all) => line.length > 0 || index < all.length - 1);
  if (lines.some((line) => line.includes("\t"))) {
    return lines.map((line) => line.split("\t"));
  }
  return lines.map((line) => splitCsvLine(line));
}

export function inferDataGridColumnTypes(
  rows: readonly (readonly string[])[],
  width: number,
): DataGridColumnType[] {
  return Array.from({ length: width }, (_, columnIndex) =>
    inferDataGridColumnType(rows.map((row) => row[columnIndex] ?? "")),
  );
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function readColumnTypes(value: unknown): DataGridColumnType[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is DataGridColumnType => entry === "number" || entry === "text")
    : [];
}

function inferDataGridColumnType(values: readonly string[]): DataGridColumnType {
  const populated = values.map((value) => value.trim()).filter(Boolean);
  if (populated.length === 0) return "text";
  return populated.every(isNumericCell) ? "number" : "text";
}

function isNumericCell(value: string): boolean {
  const normalized = value.trim().replace(/,/g, "").replace(/%$/, "");
  return normalized !== "" && Number.isFinite(Number(normalized));
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const ch = line[index];
    if (ch === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }

  cells.push(current.trim());
  return cells;
}
