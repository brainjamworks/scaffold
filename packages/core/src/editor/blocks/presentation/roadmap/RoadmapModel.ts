import { RoadmapDataSchema, type RoadmapData } from "@scaffold/contracts";

import { emptyRoadmapData } from "./content";

export function parseRoadmapData(raw: unknown): RoadmapData {
  const parsed = RoadmapDataSchema.safeParse(raw);
  return parsed.success ? parsed.data : emptyRoadmapData();
}

export function normalizeRoadmapData(next: Partial<RoadmapData>): RoadmapData {
  return RoadmapDataSchema.parse(next);
}
