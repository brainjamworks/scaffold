import { z } from "zod";

import { OptionalIconValueSchema } from "./icon-value";

export const RoadmapMilestoneStatusSchema = z.enum(["upcoming", "current", "done"]);
export type RoadmapMilestoneStatus = z.infer<typeof RoadmapMilestoneStatusSchema>;

export const RoadmapOrientationSchema = z.enum(["vertical", "horizontal"]);
export type RoadmapOrientation = z.infer<typeof RoadmapOrientationSchema>;

export const RoadmapDataSchema = z.object({
  type: z.literal("roadmap").default("roadmap"),
  orientation: RoadmapOrientationSchema.default("vertical"),
  useIconMarkers: z.boolean().default(false),
  icon: OptionalIconValueSchema,
});
export type RoadmapData = z.infer<typeof RoadmapDataSchema>;

export const RoadmapAttrsSchema = z.object({
  data: RoadmapDataSchema.default({}),
});
export type RoadmapAttrs = z.infer<typeof RoadmapAttrsSchema>;
