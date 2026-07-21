import { CalloutDataSchema, type CalloutData } from "@scaffold/contracts";

export function emptyCalloutData(overrides: Partial<CalloutData> = {}): CalloutData {
  return CalloutDataSchema.parse(overrides);
}
