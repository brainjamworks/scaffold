import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { useEffect, useRef } from "react";

import { semanticDocumentPluginKey } from "@/document/authoring/semantic-document/semantic-document-storage";
import { SECTION_NODE_TYPE } from "@/document/model/nodes/structural-node-types";

export interface UseLayoutSemanticContainerAdapterInput {
  readonly editor: Editor;
  readonly getPos: () => number | undefined;
  readonly isVisible: (childId: EmbeddedNodeId) => boolean;
  readonly layoutId: string;
  readonly node: ProseMirrorNode;
  readonly revealChild: (childId: EmbeddedNodeId) => void;
  readonly visibilityElementId: (childId: EmbeddedNodeId) => string;
}

/** Owns the shared React registration lifecycle for hidden Layout Sections. */
export function useLayoutSemanticContainerAdapter({
  editor,
  getPos,
  isVisible,
  layoutId,
  node,
  revealChild,
  visibilityElementId,
}: UseLayoutSemanticContainerAdapterInput): void {
  const semanticController = semanticDocumentPluginKey.getState(editor.state);
  const behaviorRef = useRef({ isVisible, revealChild, visibilityElementId });
  behaviorRef.current = { isVisible, revealChild, visibilityElementId };

  useEffect(() => {
    const semanticLayoutId = EmbeddedNodeIdSchema.safeParse(layoutId);
    if (!semanticController || !semanticLayoutId.success) return;
    let active = true;
    let pendingReveal: PendingReveal | null = null;

    const unregister = semanticController.containerAdapters.register({
      ownerId: semanticLayoutId.data,
      reveal: async (childId, _reason, signal) => {
        pendingReveal?.finish("child-unavailable");
        if (signal?.aborted) return "child-unavailable";
        if (!isCurrentLayoutChild(editor, getPos, semanticLayoutId.data, childId)) {
          return "child-unavailable";
        }
        if (isCommittedVisible(editor, behaviorRef.current, childId)) {
          return "already-visible";
        }

        return new Promise((resolve) => {
          const MutationObserverConstructor =
            editor.view.dom.ownerDocument.defaultView?.MutationObserver;
          if (!MutationObserverConstructor) {
            behaviorRef.current.revealChild(childId);
            resolve(
              !signal?.aborted && isCommittedVisible(editor, behaviorRef.current, childId)
                ? "revealed"
                : "child-unavailable",
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
            signal?.removeEventListener("abort", handleAbort);
            if (pendingReveal?.finish === finish) pendingReveal = null;
            resolve(result);
          };
          const handleAbort = () => finish("child-unavailable");
          const check = () => {
            if (!active || !isCurrentLayoutChild(editor, getPos, semanticLayoutId.data, childId)) {
              finish("child-unavailable");
              return;
            }
            if (isCommittedVisible(editor, behaviorRef.current, childId)) {
              finish("revealed");
            }
          };

          pendingReveal = { finish };
          observer.observe(editor.view.dom, {
            attributeFilter: ["aria-hidden", "class", "data-state", "hidden", "style"],
            attributes: true,
            childList: true,
            subtree: true,
          });
          editor.on("transaction", check);
          signal?.addEventListener("abort", handleAbort, { once: true });
          if (signal?.aborted) {
            finish("child-unavailable");
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
      pendingReveal?.finish("child-unavailable");
      unregister();
    };
  }, [editor, getPos, layoutId, node, semanticController]);
}

interface PendingReveal {
  readonly finish: (result: "revealed" | "child-unavailable") => void;
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
