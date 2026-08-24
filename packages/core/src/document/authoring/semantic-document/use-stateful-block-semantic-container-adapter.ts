import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { useEffect, useRef } from "react";

import type { SemanticContainerRevealResult } from "./semantic-container-adapter-registry";
import { semanticDocumentPluginKey } from "./semantic-document-storage";

export interface UseStatefulBlockSemanticContainerAdapterInput {
  readonly childNodeType: string;
  readonly editor: Editor;
  readonly getPos: () => number | undefined;
  readonly isVisible: (childId: EmbeddedNodeId) => boolean;
  readonly node: ProseMirrorNode;
  readonly ownerId: unknown;
  readonly ownerNodeType: string;
  readonly revealChild: (childId: EmbeddedNodeId) => void;
}

/** Registers an authoring binding over one Block's committed visible-child state. */
export function useStatefulBlockSemanticContainerAdapter({
  childNodeType,
  editor,
  getPos,
  isVisible,
  node,
  ownerId,
  ownerNodeType,
  revealChild,
}: UseStatefulBlockSemanticContainerAdapterInput): void {
  const semanticController = semanticDocumentPluginKey.getState(editor.state);
  const behaviorRef = useRef({ isVisible, revealChild });
  const pendingRef = useRef<PendingReveal | null>(null);
  behaviorRef.current = { isVisible, revealChild };

  useEffect(() => {
    const pending = pendingRef.current;
    if (pending && behaviorRef.current.isVisible(pending.childId)) {
      pending.finish("revealed");
    }
  });

  useEffect(() => {
    const semanticOwnerId = EmbeddedNodeIdSchema.safeParse(ownerId);
    if (!semanticController || !semanticOwnerId.success) return;
    let active = true;

    const unregister = semanticController.containerAdapters.register({
      ownerId: semanticOwnerId.data,
      reveal: (childId, _reason, signal) => {
        pendingRef.current?.finish("child-unavailable");
        if (signal?.aborted) return "child-unavailable";
        if (
          !isCurrentDirectChild({
            childId,
            childNodeType,
            editor,
            getPos,
            ownerId: semanticOwnerId.data,
            ownerNodeType,
          })
        ) {
          return "child-unavailable";
        }
        if (behaviorRef.current.isVisible(childId)) return "already-visible";

        return new Promise<SemanticContainerRevealResult>((resolve) => {
          let settled = false;
          const finish = (result: SemanticContainerRevealResult) => {
            if (settled) return;
            settled = true;
            signal?.removeEventListener("abort", handleAbort);
            if (pendingRef.current?.finish === finish) pendingRef.current = null;
            resolve(result);
          };
          const handleAbort = () => finish("child-unavailable");
          pendingRef.current = { childId, finish };
          signal?.addEventListener("abort", handleAbort, { once: true });
          if (signal?.aborted || !active) {
            finish("child-unavailable");
            return;
          }
          behaviorRef.current.revealChild(childId);
        });
      },
    });

    return () => {
      active = false;
      pendingRef.current?.finish("child-unavailable");
      unregister();
    };
  }, [childNodeType, editor, getPos, node, ownerId, ownerNodeType, semanticController]);
}

interface PendingReveal {
  readonly childId: EmbeddedNodeId;
  readonly finish: (result: SemanticContainerRevealResult) => void;
}

export function isCurrentDirectChild({
  childId,
  childNodeType,
  editor,
  getPos,
  ownerId,
  ownerNodeType,
}: {
  readonly childId: EmbeddedNodeId;
  readonly childNodeType: string;
  readonly editor: Editor;
  readonly getPos: () => number | undefined;
  readonly ownerId: EmbeddedNodeId;
  readonly ownerNodeType: string;
}): boolean {
  let position: number | undefined;
  try {
    position = getPos();
  } catch {
    return false;
  }
  if (typeof position !== "number") return false;
  const owner = editor.state.doc.nodeAt(position);
  const currentOwnerId = EmbeddedNodeIdSchema.safeParse(owner?.attrs["id"]);
  if (
    owner?.type.name !== ownerNodeType ||
    !currentOwnerId.success ||
    currentOwnerId.data !== ownerId
  ) {
    return false;
  }

  let found = false;
  owner.forEach((child) => {
    if (found || child.type.name !== childNodeType) return;
    const currentChildId = EmbeddedNodeIdSchema.safeParse(child.attrs["id"]);
    found = currentChildId.success && currentChildId.data === childId;
  });
  return found;
}
