import {
  PresentationContentLayout,
  PresentationContentLayoutSchema,
  type EmbeddedNodeId,
} from "@scaffold/contracts";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transform } from "@tiptap/pm/transform";

import {
  CELL_NODE_TYPE,
  REGION_NODE_TYPE,
  SECTION_NODE_TYPE,
} from "@/document/model/nodes/structural-node-types";
import type { LayoutRegistry } from "@/editor/arrangements/layout/model/layout-registry";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import { isFillOccupantNode } from "@/editor/bounded-containers/model/bounded-container-placement";
import { resolveStableNodeById } from "@/document/model/identity/resolve-stable-node";

import {
  CONTENT_LAYOUT_ATTR,
} from "./content-layout-attribute";

export type PresentationContainerNodeType =
  | typeof REGION_NODE_TYPE
  | typeof CELL_NODE_TYPE
  | typeof SECTION_NODE_TYPE;

export interface IncompatibleFlowPlacementIssue {
  readonly code: "incompatible_flow_placement";
  readonly containerId: EmbeddedNodeId;
  readonly blockingChildIds: readonly EmbeddedNodeId[];
}

export type ContentLayoutCommandError =
  | {
      readonly code: "missing_node";
      readonly containerId: EmbeddedNodeId;
    }
  | {
      readonly code: "duplicate_node_id";
      readonly containerId: EmbeddedNodeId;
    }
  | {
      readonly code: "wrong_node_type";
      readonly containerId: EmbeddedNodeId;
      readonly actualNodeType: string;
    }
  | {
      readonly code: "invalid_settings_value";
      readonly value: unknown;
    }
  | IncompatibleFlowPlacementIssue;

export type SetContainerContentLayoutResult<TTransform extends Transform = Transform> =
  | { ok: true; tr: TTransform }
  | { ok: false; issue: ContentLayoutCommandError };

export function setContainerContentLayoutChecked<TTransform extends Transform>({
  tr,
  containerId,
  contentLayout,
  blockDefinitions,
  layoutDefinitions,
}: {
  tr: TTransform;
  containerId: EmbeddedNodeId;
  contentLayout: unknown;
  blockDefinitions: BlockDefinitionLookup;
  layoutDefinitions: LayoutRegistry;
}): SetContainerContentLayoutResult<TTransform> {
  const target = resolveStableNodeById(tr.doc, containerId);
  if (target.status === "missing") {
    return failure({ code: "missing_node", containerId });
  }
  if (target.status === "duplicate") {
    return failure({ code: "duplicate_node_id", containerId });
  }
  if (!isPresentationContainerNodeType(target.node.type.name)) {
    return failure({
      code: "wrong_node_type",
      containerId,
      actualNodeType: target.node.type.name,
    });
  }

  const parsed = parseContentLayout(contentLayout);
  if (!parsed.ok) return parsed;

  if (parsed.value === PresentationContentLayout.Flow) {
    const blockingChildIds = directFillChildIds(
      target.node,
      blockDefinitions,
      layoutDefinitions,
    );
    if (blockingChildIds.length > 1) {
      return {
        ok: false,
        issue: {
          code: "incompatible_flow_placement",
          containerId,
          blockingChildIds,
        },
      };
    }
  }

  const attrs = {
    ...target.node.attrs,
    [CONTENT_LAYOUT_ATTR]: parsed.value,
  };
  target.node.type.create(attrs, target.node.content, target.node.marks).check();
  tr.setNodeMarkup(target.pos, undefined, attrs);
  tr.doc.check();
  return { ok: true, tr };
}

function isPresentationContainerNodeType(
  nodeType: string,
): nodeType is PresentationContainerNodeType {
  return (
    nodeType === REGION_NODE_TYPE ||
    nodeType === CELL_NODE_TYPE ||
    nodeType === SECTION_NODE_TYPE
  );
}

function parseContentLayout(
  value: unknown,
):
  | { ok: true; value: PresentationContentLayout }
  | { ok: false; issue: ContentLayoutCommandError } {
  const parsed = PresentationContentLayoutSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      issue: {
        code: "invalid_settings_value",
        value,
      },
    };
  }

  return { ok: true, value: parsed.data };
}

function directFillChildIds(
  node: ProseMirrorNode,
  blockDefinitions: BlockDefinitionLookup,
  layoutDefinitions: LayoutRegistry,
): EmbeddedNodeId[] {
  const ids: EmbeddedNodeId[] = [];
  node.forEach((child) => {
    if (!isFillOccupantNode(child, blockDefinitions, layoutDefinitions)) return;
    const childId = child.attrs["id"];
    if (typeof childId === "string") ids.push(childId as EmbeddedNodeId);
  });
  return ids;
}

function failure(issue: ContentLayoutCommandError): {
  ok: false;
  issue: ContentLayoutCommandError;
} {
  return { ok: false, issue };
}
