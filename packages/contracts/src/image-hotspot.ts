import { z } from "zod";

import { AssessmentFeedbackContentSchema } from "./assessment-feedback";
import { AssessmentCommonSettingsSchema } from "./assessment-settings";
import { ImageBlockAttrsSchema } from "./media";

/** Block settings configuration. */
export const ImageHotspotSettingsSchema = AssessmentCommonSettingsSchema.extend({
  legend: z.string().optional(),
  points: z.number().int().nonnegative().default(1),
  maxAttempts: z.number().int().positive().nullable().default(null),
});
export type ImageHotspotSettings = z.infer<typeof ImageHotspotSettingsSchema>;

/**
 * One hotspot region. Geometry is normalized to image dimensions:
 *  - centerX / centerY: % of image width / height respectively (0..100)
 *  - radius: % of image WIDTH (NOT height — y-distance must be scaled by
 *    the image's aspect ratio at hit-test time so circles appear circular
 *    on non-square images)
 *
 * This is public canvas geometry. Correctness and gated feedback live
 * on the parent image_hotspot node's private attrs.assessment payload.
 */
export const HotspotItemSchema = z.object({
  id: z.string(),
  centerX: z.number().min(0).max(100),
  centerY: z.number().min(0).max(100),
  radius: z.number().min(0).max(100),
  label: z.string().default(""),
});
export type HotspotItem = z.infer<typeof HotspotItemSchema>;

/**
 * Persisted data for the atomic ProseMirror canvas node. Hotspots are stored
 * in the canvas attrs rather than as ProseMirror children.
 */
export const ImageHotspotCanvasDataSchema = z.object({
  image: ImageBlockAttrsSchema.nullable().default(null),
  hotspots: z.array(HotspotItemSchema).default([]),
  maxClicks: z.number().int().positive().nullable().default(null),
  debug: z.boolean().default(false),
});
export type ImageHotspotCanvasData = z.infer<typeof ImageHotspotCanvasDataSchema>;

export const ImageHotspotPrivateAssessmentSchema = z.object({
  gradingMode: z.enum(["partial-credit", "all-or-nothing"]).default("partial-credit"),
  correctHotspotIds: z.array(z.string()).default([]),
  feedbackByHotspotId: z.record(z.string(), AssessmentFeedbackContentSchema).default({}),
  missFeedback: AssessmentFeedbackContentSchema.nullable().default(null),
  summaryFeedback: AssessmentFeedbackContentSchema.nullable().default(null),
});
export type ImageHotspotPrivateAssessment = z.infer<typeof ImageHotspotPrivateAssessmentSchema>;
