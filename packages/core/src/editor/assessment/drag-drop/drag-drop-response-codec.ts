import { z } from "zod";
import {
  EmbeddedDataIdSchema,
  SpatialPlacementInteractionSchema,
  SpatialPlacementPointSchema,
  SpatialPlacementResponseSchema,
  type AssessmentInteractionContract,
  type AssessmentResponseValue,
  type EmbeddedDataId,
  type SpatialPlacementInteraction,
  type SpatialPlacementPoint,
} from "@scaffold/contracts";

import type { AssessmentCapabilityResponseDefinition } from "@/editor/blocks/block-definition";

const EmbeddedDataRecordKeySchema = EmbeddedDataIdSchema.unwrap().unwrap();

export const DragDropResponseSchema = z
  .object({
    placements: z.record(EmbeddedDataRecordKeySchema, SpatialPlacementPointSchema).default({}),
  })
  .strict();
export type DragDropResponse = z.infer<typeof DragDropResponseSchema>;

export function toDragDropContractResponse(
  response: unknown,
  interaction?: AssessmentInteractionContract,
) {
  const local = readDragDropResponse(response);
  const current = requireSpatialPlacementInteraction(interaction);
  assertCurrentPlacementIds(local, current);
  return SpatialPlacementResponseSchema.parse({
    kind: "spatial-placement",
    placements: current.markers.flatMap(({ id }) => {
      const point = local.placements[id];
      return point ? [{ markerId: id, ...point }] : [];
    }),
  });
}

export function fromDragDropContractResponse(
  response: AssessmentResponseValue,
  interaction?: AssessmentInteractionContract,
): DragDropResponse {
  const canonical = SpatialPlacementResponseSchema.parse(response);
  const current = requireSpatialPlacementInteraction(interaction);
  const currentIds = new Set(current.markers.map(({ id }) => id));
  const points = new Map(
    canonical.placements
      .filter(({ markerId }) => currentIds.has(markerId))
      .map(({ markerId, x, y }) => [markerId, { x, y }] as const),
  );
  return DragDropResponseSchema.parse({
    placements: Object.fromEntries(
      current.markers.flatMap(({ id }) => {
        const point = points.get(id);
        return point ? [[id, point] as const] : [];
      }),
    ),
  });
}

export function hasDragDropResponse(
  response: unknown,
  interaction?: AssessmentInteractionContract,
): boolean {
  const local = readDragDropResponse(response);
  const current = requireSpatialPlacementInteraction(interaction);
  assertCurrentPlacementIds(local, current);
  return (
    current.markers.length > 0 &&
    current.markers.every(({ id }) => Object.hasOwn(local.placements, id))
  );
}

export function setDragDropPlacement(
  response: unknown,
  markerId: string,
  point: SpatialPlacementPoint,
  interaction: AssessmentInteractionContract,
): DragDropResponse {
  const local = readDragDropResponse(response);
  const current = requireSpatialPlacementInteraction(interaction);
  assertCurrentPlacementIds(local, current);
  const id = requireMarkerId(markerId, current);
  return DragDropResponseSchema.parse({
    placements: { ...local.placements, [id]: SpatialPlacementPointSchema.parse(point) },
  });
}

export function removeDragDropPlacement(
  response: unknown,
  markerId: string,
  interaction: AssessmentInteractionContract,
): DragDropResponse {
  const local = readDragDropResponse(response);
  const current = requireSpatialPlacementInteraction(interaction);
  assertCurrentPlacementIds(local, current);
  const id = requireMarkerId(markerId, current);
  const placements = { ...local.placements };
  delete placements[id];
  return { placements };
}

export function clearDragDropPlacements(): DragDropResponse {
  return { placements: {} };
}

export function readDragDropResponse(response: unknown): DragDropResponse {
  return DragDropResponseSchema.parse(response);
}

function requireSpatialPlacementInteraction(
  interaction: AssessmentInteractionContract | undefined,
): SpatialPlacementInteraction {
  if (!interaction || interaction.kind !== "spatial-placement") {
    throw new Error("Drag and Drop response requires a spatial-placement interaction.");
  }
  return SpatialPlacementInteractionSchema.parse(interaction);
}

function requireMarkerId(
  markerId: string,
  interaction: SpatialPlacementInteraction,
): EmbeddedDataId {
  const id = EmbeddedDataIdSchema.parse(markerId);
  if (!interaction.markers.some((marker) => marker.id === id)) {
    throw new Error(`Drag and Drop placement references unknown marker "${id}".`);
  }
  return id;
}

function assertCurrentPlacementIds(
  response: DragDropResponse,
  interaction: SpatialPlacementInteraction,
): void {
  const currentIds = new Set(interaction.markers.map(({ id }) => id));
  const obsoleteId = Object.keys(response.placements).find(
    (markerId) => !currentIds.has(markerId as EmbeddedDataId),
  );
  if (obsoleteId) {
    throw new Error(`Drag and Drop local response references unknown marker "${obsoleteId}".`);
  }
}

export const dragDropResponseCodec: AssessmentCapabilityResponseDefinition<DragDropResponse> = {
  schema: DragDropResponseSchema,
  toContractResponse: toDragDropContractResponse,
  fromContractResponse: fromDragDropContractResponse,
  hasResponse: hasDragDropResponse,
};
