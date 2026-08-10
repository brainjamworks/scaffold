import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { useEffect, useRef } from "react";

import { semanticDocumentPluginKey } from "@/document/authoring/semantic-document/semantic-document-storage";
import { SECTION_NODE_TYPE } from "@/document/model/nodes/structural-node-types";

export interface UseLayoutSemanticContainerAdapterInput {
  readonly editor: Editor;
  readonly isVisible: (childId: EmbeddedNodeId) => boolean;
  readonly layoutId: string;
  readonly node: ProseMirrorNode;
  readonly revealChild: (childId: EmbeddedNodeId) => void;
}

/** Owns the shared React registration lifecycle for hidden Layout Sections. */
export function useLayoutSemanticContainerAdapter({
  editor,
  isVisible,
  layoutId,
  node,
  revealChild,
}: UseLayoutSemanticContainerAdapterInput): void {
  const semanticController = semanticDocumentPluginKey.getState(editor.state);
  const behaviorRef = useRef({ isVisible, revealChild });
  behaviorRef.current = { isVisible, revealChild };

  useEffect(() => {
    const semanticLayoutId = EmbeddedNodeIdSchema.safeParse(layoutId);
    if (!semanticController || !semanticLayoutId.success) return;
    const childIds = directLayoutSectionIds(node);

    return semanticController.containerAdapters.register({
      ownerId: semanticLayoutId.data,
      reveal: async (childId) => {
        if (!childIds.has(childId)) return "child-unavailable";
        if (behaviorRef.current.isVisible(childId)) return "already-visible";
        behaviorRef.current.revealChild(childId);
        return "revealed";
      },
    });
  }, [layoutId, node, semanticController]);
}

function directLayoutSectionIds(node: ProseMirrorNode): ReadonlySet<EmbeddedNodeId> {
  const ids = new Set<EmbeddedNodeId>();
  node.forEach((child) => {
    if (child.type.name !== SECTION_NODE_TYPE) return;
    const id = EmbeddedNodeIdSchema.safeParse(child.attrs["id"]);
    if (id.success) ids.add(id.data);
  });
  return ids;
}
