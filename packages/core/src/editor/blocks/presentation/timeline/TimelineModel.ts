import { TimelineDataSchema, type TimelineData } from "@scaffold/contracts";

import { emptyTimelineData } from "./content";

export function parseTimelineData(raw: unknown): TimelineData {
  const parsed = TimelineDataSchema.safeParse(raw);
  return parsed.success ? parsed.data : emptyTimelineData();
}
