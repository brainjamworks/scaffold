import { z } from "zod";

import { AssessmentFeedbackContentSchema } from "./assessment-feedback";
import { AssessmentCommonSettingsSchema } from "./assessment-settings";
import { EmbeddedDataIdSchema, type EmbeddedDataId } from "./embedded-id";
import { ImageBlockAttrsSchema } from "./media";

export const ImageHotspotIdSchema = EmbeddedDataIdSchema;
export type ImageHotspotId = EmbeddedDataId;

const ImageHotspotRecordKeySchema = ImageHotspotIdSchema.unwrap().unwrap();

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
  id: ImageHotspotIdSchema,
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
export const ImageHotspotCanvasDataSchema = z
  .object({
    image: ImageBlockAttrsSchema.nullable().default(null),
    hotspots: z.array(HotspotItemSchema).default([]),
    maxClicks: z.number().int().positive().nullable().default(null),
    debug: z.boolean().default(false),
  })
  .superRefine((data, context) => {
    const owners = new Set<ImageHotspotId>();
    data.hotspots.forEach((hotspot, hotspotIndex) => {
      if (owners.has(hotspot.id)) {
        context.addIssue({
          code: "custom",
          message: `duplicate image-hotspot id "${hotspot.id}"`,
          path: ["hotspots", hotspotIndex, "id"],
        });
      }
      owners.add(hotspot.id);
    });
  });
export type ImageHotspotCanvasData = z.infer<typeof ImageHotspotCanvasDataSchema>;

export const ImageHotspotPrivateAssessmentSchema = z
  .object({
    gradingMode: z.enum(["partial-credit", "all-or-nothing"]).default("partial-credit"),
    correctHotspotIds: z.array(ImageHotspotIdSchema).default([]),
    feedbackByHotspotId: z
      .record(ImageHotspotRecordKeySchema, AssessmentFeedbackContentSchema)
      .default({}),
    missFeedback: AssessmentFeedbackContentSchema.nullable().default(null),
    summaryFeedback: AssessmentFeedbackContentSchema.nullable().default(null),
  })
  .superRefine((assessment, context) => {
    const correctIds = new Set<ImageHotspotId>();
    assessment.correctHotspotIds.forEach((hotspotId, hotspotIndex) => {
      if (correctIds.has(hotspotId)) {
        context.addIssue({
          code: "custom",
          message: `duplicate correct hotspot id "${hotspotId}"`,
          path: ["correctHotspotIds", hotspotIndex],
        });
      }
      correctIds.add(hotspotId);
    });
  });
export type ImageHotspotPrivateAssessment = z.infer<typeof ImageHotspotPrivateAssessmentSchema>;

/** Complete validation view for the local graph split across owner and canvas attrs. */
export const ImageHotspotPayloadSchema = z
  .object({
    canvas: ImageHotspotCanvasDataSchema,
    assessment: ImageHotspotPrivateAssessmentSchema,
  })
  .strict()
  .superRefine((payload, context) => {
    const owners = new Set(payload.canvas.hotspots.map((hotspot) => hotspot.id));
    payload.assessment.correctHotspotIds.forEach((hotspotId, hotspotIndex) => {
      if (!owners.has(hotspotId)) {
        context.addIssue({
          code: "custom",
          message: `correct hotspot id references missing hotspot "${hotspotId}"`,
          path: ["assessment", "correctHotspotIds", hotspotIndex],
        });
      }
    });
    Object.keys(payload.assessment.feedbackByHotspotId).forEach((hotspotId) => {
      if (!owners.has(hotspotId as ImageHotspotId)) {
        context.addIssue({
          code: "custom",
          message: `feedback key references missing hotspot "${hotspotId}"`,
          path: ["assessment", "feedbackByHotspotId", hotspotId],
        });
      }
    });
  });
export type ImageHotspotPayload = z.infer<typeof ImageHotspotPayloadSchema>;
