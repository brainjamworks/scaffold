import { nanoid } from "nanoid";

import {
  EmbeddedDataIdSchema,
  EmbeddedNodeIdSchema,
  type EmbeddedDataId,
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
