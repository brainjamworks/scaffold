export { countChecklistCompleted, countChecklistItems, readNodeId } from "./ChecklistModel";

export const EMPTY_CHECKED: Readonly<Record<string, boolean>> = Object.freeze({});

export const CHECKLIST_INITIAL_ACTIVITY = {
  data: { checked: {} },
  completed: false,
};

export interface ChecklistActivityData {
  [key: string]: unknown;
  checked: Record<string, boolean>;
}

export function readChecklistActivityData(data: unknown): ChecklistActivityData {
  const raw =
    data !== null && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  const checked =
    raw["checked"] !== null && typeof raw["checked"] === "object" && !Array.isArray(raw["checked"])
      ? readBooleanRecord(raw["checked"] as Record<string, unknown>)
      : EMPTY_CHECKED;

  return { checked };
}

function readBooleanRecord(value: Record<string, unknown>): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === true) result[key] = true;
  }
  return result;
}
