import type { JSONContent } from "@tiptap/core";
import { z } from "zod";
import {
  EmbeddedDataIdSchema,
  ImageHotspotCanvasDataSchema,
  ImageHotspotIdSchema,
  ImageHotspotPayloadSchema,
  SpatialHotspotResponseSchema,
  type AssessmentAnswerKey,
  type AssessmentInteractionContract,
  type AssessmentResponseValue,
  type AssessmentTargetSettings,
  type ImageHotspotCanvasData,
} from "@scaffold/contracts";

import { createEmbeddedDataId } from "@/document/model/identity/stable-ids";
import type { AssessmentBlockAdapter } from "@/editor/blocks/assessment/shared/model/assessment-block-adapter";
import type { AssessmentCapabilityResponseDefinition } from "@/editor/blocks/block-definition";
import {
  childByType,
  cloneJson,
  cloneJsonNodeWithoutContent,
  omitAttrs,
  optionalStringField,
  readAttrs,
  readContent,
  readOptionalString,
  redactCommonAssessmentShellNode,
} from "@/editor/blocks/assessment/shared/publication/projection";

/**
 * Each click records its own stable id, the resolved hotspot id (or null for a
 * miss), plus the raw position for audit / replay.
 */
export const ImageHotspotClickIdSchema = EmbeddedDataIdSchema;

export const ImageHotspotClickResponseSchema = z
  .object({
    id: ImageHotspotClickIdSchema,
    x: z.number(),
    y: z.number(),
    hotspotId: ImageHotspotIdSchema.nullable(),
  })
  .strict();
export type ImageHotspotClickResponse = z.infer<typeof ImageHotspotClickResponseSchema>;

export const ImageHotspotResponseSchema = z
  .object({
    clicks: z.array(ImageHotspotClickResponseSchema).default([]),
  })
  .strict()
  .superRefine((response, context) => {
    const clickIds = new Set<string>();
    response.clicks.forEach((click, clickIndex) => {
      if (clickIds.has(click.id)) {
        context.addIssue({
          code: "custom",
          message: `duplicate image-hotspot click id "${click.id}"`,
          path: ["clicks", clickIndex, "id"],
        });
      }
      clickIds.add(click.id);
    });
  });
export type ImageHotspotResponse = z.infer<typeof ImageHotspotResponseSchema>;

export function projectImageHotspotLearnerNode(node: JSONContent): JSONContent {
  return {
    ...cloneJsonNodeWithoutContent(node),
    attrs: omitAttrs(node, ["assessment"]),
    content: readContent(node).map((child) =>
      child.type === "image_hotspot_canvas"
        ? projectImageHotspotCanvasLearnerNode(child)
        : redactCommonAssessmentShellNode(child),
    ),
  };
}

export function projectImageHotspotInteraction(node: JSONContent): AssessmentInteractionContract {
  const { canvas } = readImageHotspotPayload(node);

  return {
    kind: "spatial-hotspot",
    hotspots: canvas.hotspots.map((hotspot) => ({
      id: hotspot.id,
      ...(hotspot.label ? { label: hotspot.label } : {}),
      geometry: {
        kind: "circle",
        centerX: hotspot.centerX,
        centerY: hotspot.centerY,
        radius: hotspot.radius,
      },
    })),
    maxSelections: canvas.maxClicks,
  };
}

export function projectImageHotspotAssessment(node: JSONContent): AssessmentAnswerKey {
  const { assessment } = readImageHotspotPayload(node);

  return {
    kind: "spatial-hotspot",
    gradingMode: assessment.gradingMode,
    correctHotspotIds: assessment.correctHotspotIds,
    feedbackByHotspotId: assessment.feedbackByHotspotId,
    ...(assessment.missFeedback ? { missFeedback: assessment.missFeedback } : {}),
    summaryFeedback: assessment.summaryFeedback,
  };
}

export function projectImageHotspotSettings(settings: unknown): Partial<AssessmentTargetSettings> {
  return optionalStringField("legend", readOptionalString(settings, "legend"));
}

function projectImageHotspotCanvasLearnerNode(node: JSONContent): JSONContent {
  return {
    ...cloneJsonNodeWithoutContent(node),
    attrs: redactImageHotspotCanvasAttrs(node),
  };
}

function redactImageHotspotCanvasAttrs(node: JSONContent): Record<string, unknown> | undefined {
  const attrs = readAttrs(node);
  const parsed = ImageHotspotCanvasDataSchema.safeParse(attrs["data"] ?? {});
  const data = parsed.success
    ? redactParsedImageHotspotCanvasData(parsed.data)
    : redactUnsafeImageHotspotCanvasData(attrs["data"]);

  return {
    ...(cloneJson(attrs) as Record<string, unknown>),
    data,
  };
}

function redactParsedImageHotspotCanvasData(data: ImageHotspotCanvasData) {
  return {
    ...data,
    debug: false,
    hotspots: data.hotspots.map((hotspot) => ({
      id: hotspot.id,
      centerX: hotspot.centerX,
      centerY: hotspot.centerY,
      radius: hotspot.radius,
      label: hotspot.label,
    })),
  };
}

function redactUnsafeImageHotspotCanvasData(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ImageHotspotCanvasDataSchema.parse({});
  }

  const data = cloneJson(value) as Record<string, unknown>;
  data["debug"] = false;
  delete data["missFeedback"];
  delete data["gradingMode"];
  data["hotspots"] = Array.isArray(data["hotspots"])
    ? data["hotspots"].map(redactUnsafeHotspot)
    : [];
  return data;
}

function redactUnsafeHotspot(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const hotspot = cloneJson(value) as Record<string, unknown>;
  delete hotspot["isCorrect"];
  delete hotspot["feedback"];
  return hotspot;
}

function readImageHotspotPayload(node: JSONContent) {
  const canvas = childByType(node, "image_hotspot_canvas");
  return ImageHotspotPayloadSchema.parse({
    canvas: canvas ? readAttrs(canvas)["data"] ?? {} : {},
    assessment: readAttrs(node)["assessment"] ?? {},
  });
}

export function readImageHotspotResponse(response: unknown): ImageHotspotResponse {
  return ImageHotspotResponseSchema.parse(response);
}

function assertUniqueHotspotSelections(
  selections: readonly { hotspotId: string | null; x: number; y: number }[],
): void {
  const keys = selections.map(
    ({ hotspotId, x, y }) => `${hotspotId ?? "<miss>"}\u0000${x}\u0000${y}`,
  );
  if (new Set(keys).size !== keys.length) {
    throw new Error("Image-hotspot canonical selections must be unique.");
  }
}

export function toImageHotspotContractResponse(response: unknown) {
  const local = readImageHotspotResponse(response);
  const selections = local.clicks.map((click) => ({
    hotspotId: click.hotspotId,
    x: click.x,
    y: click.y,
  }));
  assertUniqueHotspotSelections(selections);
  return SpatialHotspotResponseSchema.parse({ kind: "spatial-hotspot", selections });
}

export function fromImageHotspotContractResponse(
  response: AssessmentResponseValue,
): ImageHotspotResponse {
  const canonical = SpatialHotspotResponseSchema.parse(response);
  assertUniqueHotspotSelections(canonical.selections);
  return ImageHotspotResponseSchema.parse({
    clicks: canonical.selections.map((selection) => ({
      id: createEmbeddedDataId(),
      ...selection,
    })),
  });
}

export function hasImageHotspotResponse(response: unknown): boolean {
  return readImageHotspotResponse(response).clicks.length > 0;
}

export const imageHotspotResponseCodec: AssessmentCapabilityResponseDefinition<ImageHotspotResponse> =
  {
    schema: ImageHotspotResponseSchema,
    toContractResponse: toImageHotspotContractResponse,
    fromContractResponse: fromImageHotspotContractResponse,
    hasResponse: hasImageHotspotResponse,
  };

export const imageHotspotAssessmentAdapter: AssessmentBlockAdapter = {
  interactionKind: "spatial-hotspot",
  choiceMode: null,
  response: imageHotspotResponseCodec,
};
