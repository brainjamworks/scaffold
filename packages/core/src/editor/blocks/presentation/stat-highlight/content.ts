import { StatHighlightDataSchema, type StatHighlightData } from "@scaffold/contracts";

export function emptyStatHighlightData(
  overrides: Partial<StatHighlightData> = {},
): StatHighlightData {
  return StatHighlightDataSchema.parse(overrides);
}
