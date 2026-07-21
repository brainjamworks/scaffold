import { MarginaliaDataSchema, type MarginaliaData } from "@scaffold/contracts";

export function emptyMarginaliaData(overrides: Partial<MarginaliaData> = {}): MarginaliaData {
  return MarginaliaDataSchema.parse(overrides);
}
