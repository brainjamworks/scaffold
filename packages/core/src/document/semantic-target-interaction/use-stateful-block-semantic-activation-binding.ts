import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { useEffect, useRef } from "react";

import type { SemanticActivationOutcome } from "@/document/semantic-target-interaction";

import {
  currentDirectChildStatus,
  semanticActivationRegistryForEditor,
} from "./block-semantic-activation-binding";

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
  const registry = semanticActivationRegistryForEditor(editor);
  const behaviorRef = useRef({ isVisible, revealChild });
  const pendingRef = useRef<PendingActivation | null>(null);
  behaviorRef.current = { isVisible, revealChild };

  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    const status = currentDirectChildStatus({
      childId: pending.childId,
      childNodeType,
      editor,
      getPos,
      ownerId: pending.ownerId,
      ownerNodeType,
    });
    if (status !== "current") {
      pending.finish(
        unavailable(
          pending.ownerId,
          pending.childId,
          status === "child-missing" ? "child-missing" : "owner-unmounted",
        ),
      );
      return;
    }
    if (behaviorRef.current.isVisible(pending.childId)) {
      pending.finish(outcome("revealed", pending.ownerId, pending.childId));
    }
  });

  useEffect(() => {
    const semanticOwnerId = EmbeddedNodeIdSchema.safeParse(ownerId);
    if (!registry || !semanticOwnerId.success) return;
    const mountedOwnerId = semanticOwnerId.data;
    let active = true;

    const unregister = registry.register({
      ownerId: mountedOwnerId,
      activate: async ({ relationship, signal }) => {
        const childId = relationship.childId;
        const pending = pendingRef.current;
        if (pending) {
          pending.finish(outcome("interrupted", pending.ownerId, pending.childId));
        }
        if (!active) return unavailable(mountedOwnerId, childId, "owner-unmounted");
        if (signal.aborted) return outcome("interrupted", mountedOwnerId, childId);
        const childStatus = currentDirectChildStatus({
          childId,
          childNodeType,
          editor,
          getPos,
          ownerId: mountedOwnerId,
          ownerNodeType,
        });
        if (childStatus !== "current") {
          return unavailable(
            mountedOwnerId,
            childId,
            childStatus === "child-missing" ? "child-missing" : "owner-unmounted",
          );
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
          pendingRef.current = {
            ownerId: mountedOwnerId,
            childId,
            document: editor.state.doc,
            finish,
          };
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
        const status = currentDirectChildStatus({
          childId: pending.childId,
          childNodeType,
          editor,
          getPos,
          ownerId: pending.ownerId,
          ownerNodeType,
        });
        pending.finish(
          unavailable(
            pending.ownerId,
            pending.childId,
            editor.state.doc !== pending.document && status === "child-missing"
              ? "child-missing"
              : "owner-unmounted",
          ),
        );
      }
      unregister();
    };
  }, [childNodeType, editor, getPos, node, ownerId, ownerNodeType, registry]);
}

interface PendingActivation {
  readonly ownerId: EmbeddedNodeId;
  readonly childId: EmbeddedNodeId;
  readonly document: ProseMirrorNode;
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
