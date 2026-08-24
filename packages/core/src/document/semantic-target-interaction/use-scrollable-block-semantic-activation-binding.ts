import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { useEffect, useRef } from "react";

import type { SemanticActivationOutcome } from "@/document/semantic-target-interaction";

import {
  currentDirectChildStatus,
  semanticActivationRegistryForEditor,
} from "./block-semantic-activation-binding";

export interface UseScrollableBlockSemanticActivationBindingInput {
  readonly axis: "horizontal" | "vertical";
  readonly childNodeType: string;
  readonly editor: Editor;
  readonly getChildElement: (childId: EmbeddedNodeId) => HTMLElement | null;
  readonly getPos: () => number | undefined;
  readonly getScrollOwner: () => HTMLElement | null;
  readonly node: ProseMirrorNode;
  readonly ownerId: unknown;
  readonly ownerNodeType: string;
}

/** Registers one Block's owned scroll viewport with semantic activation. */
export function useScrollableBlockSemanticActivationBinding({
  axis,
  childNodeType,
  editor,
  getChildElement,
  getPos,
  getScrollOwner,
  node,
  ownerId,
  ownerNodeType,
}: UseScrollableBlockSemanticActivationBindingInput): void {
  const registry = semanticActivationRegistryForEditor(editor);
  const behaviorRef = useRef({ axis, getChildElement, getScrollOwner });
  const pendingRef = useRef<PendingActivation | null>(null);
  behaviorRef.current = { axis, getChildElement, getScrollOwner };

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
        const owner = behaviorRef.current.getScrollOwner();
        const child = behaviorRef.current.getChildElement(childId);
        if (!owner || !child) {
          return unavailable(mountedOwnerId, childId, "temporarily-unavailable");
        }
        if (isFullyVisible(owner, child, behaviorRef.current.axis)) {
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
          if (signal.aborted) {
            finish(outcome("interrupted", mountedOwnerId, childId));
            return;
          }

          queueMicrotask(() => {
            if (settled) return;
            const currentOwner = behaviorRef.current.getScrollOwner();
            const currentChild = behaviorRef.current.getChildElement(childId);
            if (!active) {
              finish(unavailable(mountedOwnerId, childId, "owner-unmounted"));
              return;
            }
            const currentChildStatus = currentDirectChildStatus({
              childId,
              childNodeType,
              editor,
              getPos,
              ownerId: mountedOwnerId,
              ownerNodeType,
            });
            if (currentChildStatus !== "current") {
              finish(
                unavailable(
                  mountedOwnerId,
                  childId,
                  currentChildStatus === "child-missing" ? "child-missing" : "owner-unmounted",
                ),
              );
              return;
            }
            if (!currentOwner || !currentChild) {
              finish(unavailable(mountedOwnerId, childId, "temporarily-unavailable"));
              return;
            }
            scrollChildToCenter(currentOwner, currentChild, behaviorRef.current.axis);
            finish(outcome("revealed", mountedOwnerId, childId));
          });
        });
      },
    });

    return () => {
      active = false;
      const pending = pendingRef.current;
      if (pending) {
        pending.finish(
          unavailable(
            pending.ownerId,
            pending.childId,
            currentDirectChildStatus({
              childId: pending.childId,
              childNodeType,
              editor,
              getPos,
              ownerId: pending.ownerId,
              ownerNodeType,
            }) === "child-missing"
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
  reason: "owner-unmounted" | "child-missing" | "temporarily-unavailable",
): SemanticActivationOutcome {
  return Object.freeze({ kind: "unavailable", ownerId, childId, reason });
}

function isFullyVisible(
  owner: HTMLElement,
  child: HTMLElement,
  axis: "horizontal" | "vertical",
): boolean {
  const ownerRect = owner.getBoundingClientRect();
  const childRect = child.getBoundingClientRect();
  return axis === "horizontal"
    ? childRect.left >= ownerRect.left && childRect.right <= ownerRect.right
    : childRect.top >= ownerRect.top && childRect.bottom <= ownerRect.bottom;
}

function scrollChildToCenter(
  owner: HTMLElement,
  child: HTMLElement,
  axis: "horizontal" | "vertical",
): void {
  const ownerRect = owner.getBoundingClientRect();
  const childRect = child.getBoundingClientRect();
  const reduceMotion =
    owner.ownerDocument.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ===
    true;
  const behavior: ScrollBehavior = reduceMotion ? "auto" : "smooth";
  if (axis === "horizontal") {
    const left =
      owner.scrollLeft +
      childRect.left -
      ownerRect.left -
      (owner.clientWidth - childRect.width) / 2;
    owner.scrollTo({ behavior, left });
    return;
  }
  const top =
    owner.scrollTop + childRect.top - ownerRect.top - (owner.clientHeight - childRect.height) / 2;
  owner.scrollTo({ behavior, top });
}
