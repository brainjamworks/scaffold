import { useFormContext, useWatch, type FieldValues } from "react-hook-form";

import type {
  SettingsSheetOptionSource,
  SettingsSheetSelectOption,
} from "@/editor/configuration/settings-sheet";

interface SettingsOptionDescriptor {
  name: string;
  options?: readonly SettingsSheetSelectOption[];
  optionsSource?: SettingsSheetOptionSource;
}

interface DataGridColumnLike {
  columnIds?: unknown;
  columnTypes?: unknown;
  headers?: unknown;
}

export function useSettingsFieldOptions(
  descriptor: SettingsOptionDescriptor,
): readonly SettingsSheetSelectOption[] {
  const form = useFormContext<FieldValues>();
  const sourceValue = useWatch({
    control: form.control,
    name: descriptor.optionsSource?.name ?? descriptor.name,
  });

  if (!descriptor.optionsSource) return descriptor.options ?? [];

  return [
    ...(descriptor.options ?? []),
    ...resolveOptionsSource(descriptor.optionsSource, sourceValue),
  ];
}

function resolveOptionsSource(
  source: SettingsSheetOptionSource,
  value: unknown,
): SettingsSheetSelectOption[] {
  switch (source.kind) {
    case "dataGridColumns":
      return dataGridColumnOptions(value, source.columnTypes);
  }
  return [];
}

function dataGridColumnOptions(
  value: unknown,
  columnTypes: SettingsSheetOptionSource["columnTypes"],
): SettingsSheetSelectOption[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const grid = value as DataGridColumnLike;
  const headers = readStringArray(grid.headers);
  const columnIds = readStringArray(grid.columnIds);
  const types = readStringArray(grid.columnTypes);

  return headers.flatMap((header, index) => {
    const type = types[index] === "number" ? "number" : "text";
    if (columnTypes && !columnTypes.includes(type)) return [];
    const value = columnIds[index] ?? header.trim();
    if (!value) return [];
    return [
      {
        value,
        label: header.trim() || `Column ${index + 1}`,
      },
    ];
  });
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
