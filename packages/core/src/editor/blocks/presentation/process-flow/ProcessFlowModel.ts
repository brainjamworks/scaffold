import { ProcessFlowDataSchema, type ProcessFlowData } from "@scaffold/contracts";

import { emptyProcessFlowData } from "./content";

export function parseProcessFlowData(raw: unknown): ProcessFlowData {
  const parsed = ProcessFlowDataSchema.safeParse(raw);
  return parsed.success ? parsed.data : emptyProcessFlowData();
}
