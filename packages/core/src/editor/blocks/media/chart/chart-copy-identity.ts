import type { EmbeddedDataId } from "@scaffold/contracts";

import type { BlockDuplicationOperation } from "@/document/model/identity/clone-with-new-ids";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function rewriteColumnReferences(
  value: unknown,
  columnIdChanges: ReadonlyMap<EmbeddedDataId, EmbeddedDataId>,
): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => rewriteColumnReferences(entry, columnIdChanges));
  }

  const record = asRecord(value);
  if (!record) return value;

  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => [
      key,
      key === "columnId" && typeof entry === "string"
        ? (columnIdChanges.get(entry as EmbeddedDataId) ?? entry)
        : rewriteColumnReferences(entry, columnIdChanges),
    ]),
  );
}

export const rewriteChartCopiedContent: BlockDuplicationOperation = ({ content, generators }) => {
  const attrs = asRecord(content.attrs);
  const chart = asRecord(attrs?.["data"]);
  const table = asRecord(chart?.["data"]);
  const columns = table?.["columns"];
  const rows = table?.["rows"];
  if (!attrs || !chart || !table || !Array.isArray(columns) || !Array.isArray(rows)) {
    return content;
  }

  const columnIdChanges = new Map<EmbeddedDataId, EmbeddedDataId>();
  const nextColumns = columns.map((column) => {
    const record = asRecord(column);
    const previousId = record?.["id"];
    if (!record || typeof previousId !== "string") return column;

    const nextId = generators.createDataId();
    columnIdChanges.set(previousId as EmbeddedDataId, nextId);
    return { ...record, id: nextId };
  });
  const nextRows = rows.map((row) => {
    const record = asRecord(row);
    const previousId = record?.["id"];
    if (!record || typeof previousId !== "string") return row;

    const cells = asRecord(record["cells"]);
    const nextId = generators.createDataId();
    return {
      ...record,
      id: nextId,
      ...(cells
        ? {
            cells: Object.fromEntries(
              Object.entries(cells).map(([columnId, value]) => [
                columnIdChanges.get(columnId as EmbeddedDataId) ?? columnId,
                value,
              ]),
            ),
          }
        : {}),
    };
  });

  return {
    ...content,
    attrs: {
      ...attrs,
      data: {
        ...chart,
        data: {
          ...table,
          columns: nextColumns,
          rows: nextRows,
        },
        encoding: rewriteColumnReferences(chart["encoding"], columnIdChanges),
      },
    },
  };
};
