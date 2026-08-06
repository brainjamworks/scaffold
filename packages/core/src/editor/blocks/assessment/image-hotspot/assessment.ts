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
  const data = ImageHotspotCanvasDataSchema.parse(attrs["data"] ?? {});

  return {
    ...(cloneJson(attrs) as Record<string, unknown>),
    data: {
      ...data,
      hotspots: data.hotspots.map((hotspot) => ({
        id: hotspot.id,
        centerX: hotspot.centerX,
        centerY: hotspot.centerY,
        radius: hotspot.radius,
        label: hotspot.label,
      })),
    },
  };
}

function readImageHotspotPayload(node: JSONContent) {
  const canvas = childByType(node, "image_hotspot_canvas");
  return ImageHotspotPayloadSchema.parse({
    canvas: canvas ? (readAttrs(canvas)["data"] ?? {}) : {},
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

export function toImageHotspotContractResponse(
  response: unknown,
  interaction?: AssessmentInteractionContract,
) {
  const local = readImageHotspotResponse(response);
  assertValidLocalHotspotClicks(local.clicks, interaction);
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
  interaction?: AssessmentInteractionContract,
): ImageHotspotResponse {
  const canonical = SpatialHotspotResponseSchema.parse(response);
  const selections = reconcileCanonicalHotspotSelections(canonical.selections, interaction);
  return ImageHotspotResponseSchema.parse({
    clicks: selections.map((selection) => ({
      id: createEmbeddedDataId(),
      ...selection,
    })),
  });
}

export function hasImageHotspotResponse(
  response: unknown,
  interaction?: AssessmentInteractionContract,
): boolean {
  const local = readImageHotspotResponse(response);
  assertValidLocalHotspotClicks(local.clicks, interaction);
  return local.clicks.length > 0;
}

function assertValidLocalHotspotClicks(
  clicks: readonly ImageHotspotClickResponse[],
  interaction?: AssessmentInteractionContract,
): void {
  if (interaction === undefined) return;
  if (interaction.kind !== "spatial-hotspot") {
    throw new Error("Image-hotspot response requires a spatial-hotspot interaction.");
  }
  const currentIds = new Set(interaction.hotspots.map((hotspot) => hotspot.id));
  const selectedIds = new Set<string>();
  for (const click of clicks) {
    if (!inCanonicalPercentBounds(click.x) || !inCanonicalPercentBounds(click.y)) {
      throw new Error("Image-hotspot click coordinates must be finite values from 0 to 100.");
    }
    if (click.hotspotId === null) continue;
    if (!currentIds.has(click.hotspotId)) {
      throw new Error("Image-hotspot clicks must reference current hotspot ids.");
    }
    if (selectedIds.has(click.hotspotId)) {
      throw new Error("The same image hotspot cannot be selected more than once.");
    }
    selectedIds.add(click.hotspotId);
  }
  if (interaction.maxSelections !== null && clicks.length > interaction.maxSelections) {
    throw new Error("Image-hotspot response exceeds the current click limit.");
  }
}

function reconcileCanonicalHotspotSelections(
  selections: readonly { hotspotId: string | null; x: number; y: number }[],
  interaction?: AssessmentInteractionContract,
) {
  if (interaction === undefined) {
    assertUniqueHotspotSelections(selections);
    return selections;
  }
  if (interaction.kind !== "spatial-hotspot") {
    throw new Error("Image-hotspot response requires a spatial-hotspot interaction.");
  }
  const currentIds = new Set(interaction.hotspots.map((hotspot) => hotspot.id));
  const selectedIds = new Set<string>();
  const canonicalKeys = new Set<string>();
  const reconciled: Array<{ hotspotId: string | null; x: number; y: number }> = [];
  for (const selection of selections) {
    if (!inCanonicalPercentBounds(selection.x) || !inCanonicalPercentBounds(selection.y)) continue;
    if (selection.hotspotId !== null) {
      if (!currentIds.has(selection.hotspotId) || selectedIds.has(selection.hotspotId)) continue;
      selectedIds.add(selection.hotspotId);
    }
    const key = `${selection.hotspotId ?? "<miss>"}\u0000${selection.x}\u0000${selection.y}`;
    if (canonicalKeys.has(key)) continue;
    canonicalKeys.add(key);
    reconciled.push(selection);
    if (interaction.maxSelections !== null && reconciled.length >= interaction.maxSelections) break;
  }
  return reconciled;
}

function inCanonicalPercentBounds(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 100;
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
