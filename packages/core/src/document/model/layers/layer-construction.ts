import type { JSONContent } from "@tiptap/core";

import type { EmbeddedNodeId } from "@scaffold/contracts";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { LAYER_NODE_TYPE } from "@/document/model/nodes/structural-node-types";

export interface CreateLayerOptions {
  readonly createId?: () => EmbeddedNodeId;
}

export function createBlankLayer(options: CreateLayerOptions = {}): JSONContent {
  const createId = options.createId ?? createEmbeddedNodeId;
  const layerId = createId();
  const paragraphId = createId();
  assertDistinctGeneratedIds(layerId, paragraphId);

  return {
    type: LAYER_NODE_TYPE,
    attrs: { id: layerId },
    content: [{ type: "paragraph", attrs: { id: paragraphId } }],
  };
}

export function createLayerWithContent(
  content: readonly JSONContent[],
  options: CreateLayerOptions = {},
): JSONContent {
  if (content.length === 0) {
    throw new Error("A content Layer requires at least one child.");
  }

  const createId = options.createId ?? createEmbeddedNodeId;
  const layerId = createId();
  assertGeneratedLayerIdIsUnique(layerId, content);

  return {
    type: LAYER_NODE_TYPE,
    attrs: { id: layerId },
    content: [...content],
  };
}

function assertDistinctGeneratedIds(first: EmbeddedNodeId, second: EmbeddedNodeId): void {
  if (first === second) {
    throw new Error(`Duplicate generated document identity "${first}".`);
  }
}

function assertGeneratedLayerIdIsUnique(
  layerId: EmbeddedNodeId,
  content: readonly JSONContent[],
): void {
  for (const child of content) {
    if (containsNodeId(child, layerId)) {
      throw new Error(`Duplicate generated document identity "${layerId}".`);
    }
  }
}

function containsNodeId(node: JSONContent, id: string): boolean {
  if (node.attrs?.["id"] === id) return true;
  return node.content?.some((child) => containsNodeId(child, id)) ?? false;
}
