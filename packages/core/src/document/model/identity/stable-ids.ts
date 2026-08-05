import { nanoid } from "nanoid";

import {
  EmbeddedDataIdSchema,
  EmbeddedIdSchema,
  EmbeddedNodeIdSchema,
  type EmbeddedDataId,
  type EmbeddedId,
  type EmbeddedNodeId,
} from "@scaffold/contracts";

const EMBEDDED_ID_SIZE = 12;

function createEmbeddedIdToken(): string {
  return nanoid(EMBEDDED_ID_SIZE);
}

export function createEmbeddedNodeId(): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(createEmbeddedIdToken());
}

export function createEmbeddedDataId(): EmbeddedDataId {
  return EmbeddedDataIdSchema.parse(createEmbeddedIdToken());
}

/** @deprecated Use the semantic node or data generator for new call sites. */
export function createStableId(): EmbeddedId {
  return EmbeddedIdSchema.parse(createEmbeddedIdToken());
}
