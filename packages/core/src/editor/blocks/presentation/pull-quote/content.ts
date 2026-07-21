import { PullQuoteDataSchema, type PullQuoteData } from "@scaffold/contracts";

export function emptyPullQuoteData(overrides: Partial<PullQuoteData> = {}): PullQuoteData {
  return PullQuoteDataSchema.parse(overrides);
}
