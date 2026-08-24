import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { useEffect, useRef } from "react";

import type { SemanticActivationOutcome } from "@/document/semantic-target-interaction";

import { semanticDocumentPluginKey } from "./semantic-document-storage";

export interface UseStatefulBlockSemanticActivationBindingInput {
  readonly childNodeType: string;
  readonly editor: Editor;
  readonly getPos: () => number | undefined;
  readonly isVisible: (childId: EmbeddedNodeId) => boolean;
  readonly node: ProseMirrorNode;
  readonly ownerId: unknown;
  readonly ownerNodeType: string;
  readonly revealChild: (childId: EmbeddedNodeId) => void;
}

/** Registers one Block's committed visible-child behavior with semantic activation. */
export function useStatefulBlockSemanticActivationBinding({
  childNodeType,
  editor,
  getPos,
  isVisible,
  node,
  ownerId,
  ownerNodeType,
  revealChild,
}: UseStatefulBlockSemanticActivationBindingInput): void {
  const semanticController = semanticDocumentPluginKey.getState(editor.state);
  const behaviorRef = useRef({ isVisible, revealChild });
  const pendingRef = useRef<PendingActivation | null>(null);
  behaviorRef.current = { isVisible, revealChild };

  useEffect(() => {
    const pending = pendingRef.current;
    if (pending && behaviorRef.current.isVisible(pending.childId)) {
      pending.finish(outcome("revealed", pending.ownerId, pending.childId));
    }
  });

  useEffect(() => {
    const semanticOwnerId = EmbeddedNodeIdSchema.safeParse(ownerId);
    if (!semanticController || !semanticOwnerId.success) return;
    const mountedOwnerId = semanticOwnerId.data;
    let active = true;

    const unregister = semanticController.semanticActivations.register({
      ownerId: mountedOwnerId,
      activate: async ({ relationship, signal }) => {
        const childId = relationship.childId;
        const pending = pendingRef.current;
        if (pending) {
          pending.finish(outcome("interrupted", pending.ownerId, pending.childId));
        }
        if (signal.aborted) return outcome("interrupted", mountedOwnerId, childId);
        if (
          !isCurrentDirectChild({
            childId,
            childNodeType,
            editor,
            getPos,
            ownerId: mountedOwnerId,
            ownerNodeType,
          })
        ) {
          return unavailable(mountedOwnerId, childId, "child-missing");
        }
        if (behaviorRef.current.isVisible(childId)) {
          return outcome("already-visible", mountedOwnerId, childId);
        }

        return new Promise<SemanticActivationOutcome>((resolve) => {
          let settled = false;
          const finish = (result: SemanticActivationOutcome) => {
            if (settled) return;
            settled = true;
            signal.removeEventListener("abort", handleAbort);
            if (pendingRef.current?.finish === finish) pendingRef.current = null;
            resolve(result);
          };
          const handleAbort = () => finish(outcome("interrupted", mountedOwnerId, childId));
          pendingRef.current = { ownerId: mountedOwnerId, childId, finish };
          signal.addEventListener("abort", handleAbort, { once: true });
          if (signal.aborted || !active) {
            finish(
              signal.aborted
                ? outcome("interrupted", mountedOwnerId, childId)
                : unavailable(mountedOwnerId, childId, "owner-unmounted"),
            );
            return;
          }
          behaviorRef.current.revealChild(childId);
        });
      },
    });

    return () => {
      active = false;
      const pending = pendingRef.current;
      if (pending) {
        pending.finish(unavailable(pending.ownerId, pending.childId, "owner-unmounted"));
      }
      unregister();
    };
  }, [childNodeType, editor, getPos, node, ownerId, ownerNodeType, semanticController]);
}

interface PendingActivation {
  readonly ownerId: EmbeddedNodeId;
  readonly childId: EmbeddedNodeId;
  readonly finish: (result: SemanticActivationOutcome) => void;
}

function outcome(
  kind: "revealed" | "already-visible" | "interrupted",
  ownerId: EmbeddedNodeId,
  childId: EmbeddedNodeId,
): SemanticActivationOutcome {
  return Object.freeze({ kind, ownerId, childId });
}

function unavailable(
  ownerId: EmbeddedNodeId,
  childId: EmbeddedNodeId,
  reason: "owner-unmounted" | "child-missing",
): SemanticActivationOutcome {
  return Object.freeze({ kind: "unavailable", ownerId, childId, reason });
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
