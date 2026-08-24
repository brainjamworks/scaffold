import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { useEffect, useRef } from "react";

import { SECTION_NODE_TYPE } from "@/document/model/nodes/structural-node-types";
import {
  getSemanticTargetInteractionEnvironmentForEditor,
  type SemanticActivationOutcome,
} from "@/document/semantic-target-interaction";

export interface UseLayoutSemanticActivationBindingInput {
  readonly editor: Editor;
  readonly getPos: () => number | undefined;
  readonly isVisible: (childId: EmbeddedNodeId) => boolean;
  readonly layoutId: string;
  readonly node: ProseMirrorNode;
  readonly revealChild: (childId: EmbeddedNodeId) => void;
  readonly visibilityElementId: (childId: EmbeddedNodeId) => string;
}

/** Owns the shared React registration lifecycle for hidden Layout Sections. */
export function useLayoutSemanticActivationBinding({
  editor,
  getPos,
  isVisible,
  layoutId,
  node,
  revealChild,
  visibilityElementId,
}: UseLayoutSemanticActivationBindingInput): void {
  const registry = layoutSemanticActivationRegistryForEditor(editor);
  const behaviorRef = useRef({ isVisible, revealChild, visibilityElementId });
  behaviorRef.current = { isVisible, revealChild, visibilityElementId };

  useEffect(() => {
    const semanticLayoutId = EmbeddedNodeIdSchema.safeParse(layoutId);
    if (!registry || !semanticLayoutId.success) return;
    let active = true;
    let pendingReveal: PendingReveal | null = null;

    const ownerId = semanticLayoutId.data;
    const unregister = registry.register({
      ownerId,
      activate: async ({ relationship, signal }) => {
        const childId = relationship.childId;
        if (pendingReveal) {
          pendingReveal.finish(outcome("interrupted", ownerId, pendingReveal.childId));
        }
        if (signal.aborted) return outcome("interrupted", ownerId, childId);
        if (!isCurrentLayoutChild(editor, getPos, ownerId, childId)) {
          return unavailable(ownerId, childId, "child-missing");
        }
        if (isCommittedVisible(editor, behaviorRef.current, childId)) {
          return outcome("already-visible", ownerId, childId);
        }

        return new Promise<SemanticActivationOutcome>((resolve) => {
          const MutationObserverConstructor =
            editor.view.dom.ownerDocument.defaultView?.MutationObserver;
          if (!MutationObserverConstructor) {
            behaviorRef.current.revealChild(childId);
            resolve(
              !signal.aborted && isCommittedVisible(editor, behaviorRef.current, childId)
                ? outcome("revealed", ownerId, childId)
                : signal.aborted
                  ? outcome("interrupted", ownerId, childId)
                  : unavailable(ownerId, childId, "temporarily-unavailable"),
            );
            return;
          }

          let settled = false;
          const observer = new MutationObserverConstructor(() => check());
          const finish: PendingReveal["finish"] = (result) => {
            if (settled) return;
            settled = true;
            observer.disconnect();
            editor.off("transaction", check);
            signal.removeEventListener("abort", handleAbort);
            if (pendingReveal?.finish === finish) pendingReveal = null;
            resolve(result);
          };
          const handleAbort = () => finish(outcome("interrupted", ownerId, childId));
          const check = () => {
            if (!active) {
              finish(unavailable(ownerId, childId, "owner-unmounted"));
              return;
            }
            if (!isCurrentLayoutChild(editor, getPos, ownerId, childId)) {
              finish(unavailable(ownerId, childId, "child-missing"));
              return;
            }
            if (isCommittedVisible(editor, behaviorRef.current, childId)) {
              finish(outcome("revealed", ownerId, childId));
            }
          };

          pendingReveal = { childId, finish };
          observer.observe(editor.view.dom, {
            attributeFilter: ["aria-hidden", "class", "data-state", "hidden", "style"],
            attributes: true,
            childList: true,
            subtree: true,
          });
          editor.on("transaction", check);
          signal.addEventListener("abort", handleAbort, { once: true });
          if (signal.aborted) {
            finish(outcome("interrupted", ownerId, childId));
            return;
          }
          if (!behaviorRef.current.isVisible(childId)) {
            behaviorRef.current.revealChild(childId);
          }
          check();
        });
      },
    });

    return () => {
      active = false;
      if (pendingReveal) {
        pendingReveal.finish(unavailable(ownerId, pendingReveal.childId, "owner-unmounted"));
      }
      unregister();
    };
  }, [editor, getPos, layoutId, node, registry]);
}

function layoutSemanticActivationRegistryForEditor(editor: Editor) {
  try {
    return getSemanticTargetInteractionEnvironmentForEditor(editor).registry;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Semantic Target Interaction Environment extension is not installed for this editor"
    ) {
      return null;
    }
    throw error;
  }
}

interface PendingReveal {
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

interface LayoutSemanticVisibilityBehavior {
  readonly isVisible: (childId: EmbeddedNodeId) => boolean;
  readonly visibilityElementId: (childId: EmbeddedNodeId) => string;
}

function isCommittedVisible(
  editor: Editor,
  behavior: LayoutSemanticVisibilityBehavior,
  childId: EmbeddedNodeId,
): boolean {
  if (!behavior.isVisible(childId)) return false;
  let elementId: string;
  try {
    elementId = behavior.visibilityElementId(childId);
  } catch {
    return false;
  }
  const root = editor.view.dom;
  const ownerWindow = root.ownerDocument.defaultView;
  const element = elementWithIdWithin(root, elementId);
  if (!ownerWindow || !(element instanceof ownerWindow.HTMLElement)) {
    return false;
  }

  let current: HTMLElement | null = element;
  while (current) {
    if (current.hidden || current.getAttribute("aria-hidden") === "true") return false;
    const style = ownerWindow.getComputedStyle(current);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse"
    ) {
      return false;
    }
    if (current === root) return true;
    current = current.parentElement;
  }
  return false;
}

function elementWithIdWithin(root: HTMLElement, id: string): HTMLElement | null {
  if (root.id === id) return root;
  return (
    Array.from(root.querySelectorAll<HTMLElement>("[id]")).find(
      (candidate) => candidate.id === id,
    ) ?? null
  );
}

function isCurrentLayoutChild(
  editor: Editor,
  getPos: () => number | undefined,
  layoutId: EmbeddedNodeId,
  childId: EmbeddedNodeId,
): boolean {
  let position: number | undefined;
  try {
    position = getPos();
  } catch {
    return false;
  }
  if (typeof position !== "number") return false;
  const layout = editor.state.doc.nodeAt(position);
  const currentLayoutId = EmbeddedNodeIdSchema.safeParse(layout?.attrs["id"]);
  return (
    layout?.type.name === "layout" &&
    currentLayoutId.success &&
    currentLayoutId.data === layoutId &&
    directLayoutSectionIds(layout).has(childId)
  );
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
