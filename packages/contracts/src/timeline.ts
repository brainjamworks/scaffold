import { z } from "zod";

export const TimelineAlignmentSchema = z.enum(["alternate", "left", "right"]);
export type TimelineAlignment = z.infer<typeof TimelineAlignmentSchema>;

export const TimelinePresentationSchema = z.enum(["vertical", "carousel"]);
export type TimelinePresentation = z.infer<typeof TimelinePresentationSchema>;

export const TimelineDataSchema = z.object({
  type: z.literal("timeline").default("timeline"),
  showAxis: z.boolean().default(true),
  alignment: TimelineAlignmentSchema.default("alternate"),
  presentation: TimelinePresentationSchema.default("vertical"),
});
export type TimelineData = z.infer<typeof TimelineDataSchema>;
