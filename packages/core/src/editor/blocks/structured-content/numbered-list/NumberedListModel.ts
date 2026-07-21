import { NumberedListDataSchema, type NumberedListData } from "@scaffold/contracts";

import { emptyNumberedListData } from "./content";

export function parseNumberedListData(raw: unknown): NumberedListData {
  const parsed = NumberedListDataSchema.safeParse(raw);
  return parsed.success ? parsed.data : emptyNumberedListData();
}

export function normalizeNumberedListData(next: Partial<NumberedListData>): NumberedListData {
  return NumberedListDataSchema.parse(next);
}
