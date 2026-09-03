import { z } from "zod";

import { AssessmentFeedbackContentSchema } from "./assessment-feedback";
import { AssessmentCommonSettingsSchema } from "./assessment-settings";
import { EmbeddedDataIdSchema, type EmbeddedDataId } from "./embedded-id";
import { ImageBlockAttrsSchema, ManagedMediaSourceSchema } from "./media";

const EmbeddedDataRecordKeySchema = EmbeddedDataIdSchema.unwrap().unwrap();
const PositiveAspectRatioSchema = z.number().finite().positive();
const SpatialPlacementCoordinateSchema = z.number().finite().min(0).max(100);

function addDuplicateDataIdIssues<Item>(
  items: readonly Item[],
  dataIdFor: (item: Item) => EmbeddedDataId,
  context: z.RefinementCtx,
  field: string,
  label: string,
): void {
  const seen = new Set<EmbeddedDataId>();
  items.forEach((item, index) => {
    const dataId = dataIdFor(item);
    if (seen.has(dataId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `duplicate ${label} "${dataId}"`,
        path: [index, field],
      });
    }
    seen.add(dataId);
  });
}

export const MarkerPresetIdSchema = z.enum(["cross", "pin", "dot", "flag", "check"]);
export type MarkerPresetId = z.infer<typeof MarkerPresetIdSchema>;

export const MarkerVisualSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("preset"),
      preset: MarkerPresetIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("custom"),
      source: ManagedMediaSourceSchema.strict(),
    })
    .strict(),
]);
export type MarkerVisual = z.infer<typeof MarkerVisualSchema>;

export const SpatialPlacementPointSchema = z
  .object({
    x: SpatialPlacementCoordinateSchema,
    y: SpatialPlacementCoordinateSchema,
  })
  .strict();
export type SpatialPlacementPoint = z.infer<typeof SpatialPlacementPointSchema>;

export const SpatialPlacementCircleSchema = z
  .object({
    kind: z.literal("circle"),
    centerX: SpatialPlacementCoordinateSchema,
    centerY: SpatialPlacementCoordinateSchema,
    radius: z.number().finite().positive(),
  })
  .strict();
export type SpatialPlacementCircle = z.infer<typeof SpatialPlacementCircleSchema>;

export const DragDropMarkerSchema = z
  .object({
    id: EmbeddedDataIdSchema,
    label: z.string().trim().regex(/\S/u),
    visualOverride: MarkerVisualSchema.nullable(),
  })
  .strict();
export type DragDropMarker = z.infer<typeof DragDropMarkerSchema>;

const DragDropMarkersSchema = z.array(DragDropMarkerSchema).superRefine((markers, context) => {
  addDuplicateDataIdIssues(
    markers,
    (marker) => marker.id,
    context,
    "id",
    "drag-and-drop marker id",
  );
});

export const DragDropCanvasDataSchema = z
  .object({
    image: ImageBlockAttrsSchema.nullable().default(null),
    imageAspectRatio: PositiveAspectRatioSchema.nullable().default(null),
    defaultMarkerVisual: MarkerVisualSchema,
    markers: DragDropMarkersSchema.default([]),
  })
  .strict()
  .superRefine((canvas, context) => {
    if (canvas.imageAspectRatio === null && (canvas.image !== null || canvas.markers.length > 0)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "image aspect ratio is required when an image or marker exists",
        path: ["imageAspectRatio"],
      });
    }
  });
export type DragDropCanvasData = z.infer<typeof DragDropCanvasDataSchema>;

export const SpatialPlacementCorrectPlacementSchema = z
  .object({
    markerId: EmbeddedDataIdSchema,
    geometry: SpatialPlacementCircleSchema,
  })
  .strict();
export type SpatialPlacementCorrectPlacement = z.infer<
  typeof SpatialPlacementCorrectPlacementSchema
>;

const SpatialPlacementCorrectPlacementsSchema = z
  .array(SpatialPlacementCorrectPlacementSchema)
  .superRefine((placements, context) => {
    addDuplicateDataIdIssues(
      placements,
      (placement) => placement.markerId,
      context,
      "markerId",
      "correct-placement marker id",
    );
  });

export const DragDropPrivateAssessmentSchema = z
  .object({
    correctPlacements: SpatialPlacementCorrectPlacementsSchema.default([]),
    feedbackByMarkerId: z
      .record(EmbeddedDataRecordKeySchema, AssessmentFeedbackContentSchema)
      .default({}),
    summaryFeedback: AssessmentFeedbackContentSchema.nullable().default(null),
  })
  .strict();
export type DragDropPrivateAssessment = z.infer<typeof DragDropPrivateAssessmentSchema>;

export const DragDropPayloadSchema = z
  .object({
    canvas: DragDropCanvasDataSchema,
    assessment: DragDropPrivateAssessmentSchema,
  })
  .strict()
  .superRefine((payload, context) => {
    const markerIds = new Set(payload.canvas.markers.map((marker) => marker.id));
    const answerIds = new Set(
      payload.assessment.correctPlacements.map((placement) => placement.markerId),
    );

    payload.canvas.markers.forEach((marker, markerIndex) => {
      if (!answerIds.has(marker.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `marker is missing a correct placement "${marker.id}"`,
          path: ["canvas", "markers", markerIndex, "id"],
        });
      }
    });
    payload.assessment.correctPlacements.forEach((placement, placementIndex) => {
      if (!markerIds.has(placement.markerId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `correct placement references missing marker "${placement.markerId}"`,
          path: ["assessment", "correctPlacements", placementIndex, "markerId"],
        });
      }
    });
    Object.keys(payload.assessment.feedbackByMarkerId).forEach((markerId) => {
      if (!markerIds.has(markerId as EmbeddedDataId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `feedback key references missing marker "${markerId}"`,
          path: ["assessment", "feedbackByMarkerId", markerId],
        });
      }
    });
    if (
      payload.canvas.imageAspectRatio === null &&
      payload.assessment.correctPlacements.length > 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "image aspect ratio is required when a correct placement exists",
        path: ["canvas", "imageAspectRatio"],
      });
    }
  });
export type DragDropPayload = z.infer<typeof DragDropPayloadSchema>;

export const DragDropSettingsSchema = AssessmentCommonSettingsSchema.extend({
  gradingMode: z.enum(["partial-credit", "all-or-nothing"]).default("partial-credit"),
  legend: z.string().optional(),
  points: z.number().int().nonnegative().default(1),
  maxAttempts: z.number().int().positive().nullable().default(null),
});
export type DragDropSettings = z.infer<typeof DragDropSettingsSchema>;

export const SpatialPlacementMarkerSchema = z
  .object({
    id: EmbeddedDataIdSchema,
    label: z.string().trim().regex(/\S/u),
  })
  .strict();
export type SpatialPlacementMarker = z.infer<typeof SpatialPlacementMarkerSchema>;

const SpatialPlacementMarkersSchema = z
  .array(SpatialPlacementMarkerSchema)
  .superRefine((markers, context) => {
    addDuplicateDataIdIssues(
      markers,
      (marker) => marker.id,
      context,
      "id",
      "spatial-placement marker id",
    );
  });

export const SpatialPlacementInteractionSchema = z
  .object({
    kind: z.literal("spatial-placement"),
    markers: SpatialPlacementMarkersSchema,
  })
  .strict();
export type SpatialPlacementInteraction = z.infer<typeof SpatialPlacementInteractionSchema>;

export const SpatialPlacementAssessmentUnionMemberSchema = z
  .object({
    kind: z.literal("spatial-placement"),
    gradingMode: z.enum(["partial-credit", "all-or-nothing"]),
    imageAspectRatio: PositiveAspectRatioSchema.nullable(),
    correctPlacements: SpatialPlacementCorrectPlacementsSchema,
    feedbackByMarkerId: z
      .record(EmbeddedDataRecordKeySchema, AssessmentFeedbackContentSchema)
      .default({}),
    summaryFeedback: AssessmentFeedbackContentSchema.nullable().optional(),
  })
  .strict();
type SpatialPlacementAssessmentUnionMember = z.infer<
  typeof SpatialPlacementAssessmentUnionMemberSchema
>;

export function refineSpatialPlacementAssessment(
  assessment: SpatialPlacementAssessmentUnionMember,
  context: z.RefinementCtx,
): void {
  if (assessment.imageAspectRatio === null && assessment.correctPlacements.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "image aspect ratio is required when a correct placement exists",
      path: ["imageAspectRatio"],
    });
  }
}

export const SpatialPlacementAssessmentSchema =
  SpatialPlacementAssessmentUnionMemberSchema.superRefine(refineSpatialPlacementAssessment);
export type SpatialPlacementAssessment = z.infer<typeof SpatialPlacementAssessmentSchema>;

export const SpatialPlacementPlacementSchema = SpatialPlacementPointSchema.extend({
  markerId: EmbeddedDataIdSchema,
}).strict();
export type SpatialPlacementPlacement = z.infer<typeof SpatialPlacementPlacementSchema>;

const SpatialPlacementPlacementsSchema = z
  .array(SpatialPlacementPlacementSchema)
  .superRefine((placements, context) => {
    addDuplicateDataIdIssues(
      placements,
      (placement) => placement.markerId,
      context,
      "markerId",
      "response marker id",
    );
  });

export const SpatialPlacementResponseSchema = z
  .object({
    kind: z.literal("spatial-placement"),
    placements: SpatialPlacementPlacementsSchema,
  })
  .strict();
export type SpatialPlacementResponse = z.infer<typeof SpatialPlacementResponseSchema>;
