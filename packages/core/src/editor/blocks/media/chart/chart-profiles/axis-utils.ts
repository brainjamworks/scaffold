/**
 * Tiny axis introspection helpers shared by chart profiles + responsive
 * transforms. Kept in their own module so bar.ts and zoom.ts don't
 * each carry near-identical copies.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isAxisRecordOfType(value: unknown, type: string): value is Record<string, unknown> {
  return isRecord(value) && value["type"] === type;
}

export function findCategoryAxis(
  option: Record<string, unknown>,
): { axis: "xAxis" | "yAxis"; data: unknown[] } | null {
  const xAxis = option["xAxis"];
  if (isAxisRecordOfType(xAxis, "category") && Array.isArray(xAxis["data"])) {
    return { axis: "xAxis", data: xAxis["data"] };
  }
  const yAxis = option["yAxis"];
  if (isAxisRecordOfType(yAxis, "category") && Array.isArray(yAxis["data"])) {
    return { axis: "yAxis", data: yAxis["data"] };
  }
  return null;
}
