import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { useEffect, useRef } from "react";

import { semanticDocumentPluginKey } from "./semantic-document-storage";
import { isCurrentDirectChild } from "./use-stateful-block-semantic-container-adapter";

export interface UseScrollableBlockSemanticContainerAdapterInput {
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

/** Registers an authoring binding over one Block's owned scroll viewport. */
export function useScrollableBlockSemanticContainerAdapter({
  axis,
  childNodeType,
  editor,
  getChildElement,
  getPos,
  getScrollOwner,
  node,
  ownerId,
  ownerNodeType,
}: UseScrollableBlockSemanticContainerAdapterInput): void {
  const semanticController = semanticDocumentPluginKey.getState(editor.state);
  const behaviorRef = useRef({ axis, getChildElement, getScrollOwner });
  behaviorRef.current = { axis, getChildElement, getScrollOwner };

  useEffect(() => {
    const semanticOwnerId = EmbeddedNodeIdSchema.safeParse(ownerId);
    if (!semanticController || !semanticOwnerId.success) return;
    let active = true;

    const unregister = semanticController.containerAdapters.register({
      ownerId: semanticOwnerId.data,
      reveal: (childId, _reason, signal) => {
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
        const owner = behaviorRef.current.getScrollOwner();
        const child = behaviorRef.current.getChildElement(childId);
        if (!owner || !child) return "child-unavailable";
        if (isFullyVisible(owner, child, behaviorRef.current.axis)) return "already-visible";

        return new Promise<"revealed" | "child-unavailable">((resolve) => {
          let settled = false;
          const finish = (result: "revealed" | "child-unavailable") => {
            if (settled) return;
            settled = true;
            signal?.removeEventListener("abort", handleAbort);
            resolve(result);
          };
          const handleAbort = () => finish("child-unavailable");
          signal?.addEventListener("abort", handleAbort, { once: true });
          if (signal?.aborted) {
            finish("child-unavailable");
            return;
          }

          queueMicrotask(() => {
            const currentOwner = behaviorRef.current.getScrollOwner();
            const currentChild = behaviorRef.current.getChildElement(childId);
            if (
              settled ||
              !active ||
              !currentOwner ||
              !currentChild ||
              !isCurrentDirectChild({
                childId,
                childNodeType,
                editor,
                getPos,
                ownerId: semanticOwnerId.data,
                ownerNodeType,
              })
            ) {
              finish("child-unavailable");
              return;
            }
            scrollChildToCenter(currentOwner, currentChild, behaviorRef.current.axis);
            finish("revealed");
          });
        });
      },
    });

    return () => {
      active = false;
      unregister();
    };
  }, [childNodeType, editor, getPos, node, ownerId, ownerNodeType, semanticController]);
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
      owner.scrollLeft + childRect.left - ownerRect.left - (owner.clientWidth - childRect.width) / 2;
    owner.scrollTo({ behavior, left });
    return;
  }
  const top =
    owner.scrollTop + childRect.top - ownerRect.top - (owner.clientHeight - childRect.height) / 2;
  owner.scrollTo({ behavior, top });
}
