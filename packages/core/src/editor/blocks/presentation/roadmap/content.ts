import { RoadmapDataSchema, type RoadmapData } from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";

export const ROADMAP_NODE = "roadmap";
export const ROADMAP_MILESTONE_NODE = "roadmap_milestone";

export function emptyRoadmapData(overrides: Partial<RoadmapData> = {}): RoadmapData {
  return RoadmapDataSchema.parse(overrides);
}

export function roadmapMilestoneContent(heading?: string, body?: string): JSONContent[] {
  return [
    {
      type: "paragraph",
      ...(heading ? { content: [{ type: "text", text: heading }] } : {}),
    },
    {
      type: "paragraph",
      ...(body ? { content: [{ type: "text", text: body }] } : {}),
    },
  ];
}
