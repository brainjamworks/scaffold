import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Result } from "better-result";
import { useCallback, useEffect, useRef } from "react";

import {
  tryGetControlBindingRegistryForEditor,
  type ControlEventListener,
} from "@/document/control-binding";

import { getLayoutInteractionStoreState } from "../shared/model/layout-interaction-store";
import { normalizeActivePageId, readPaginatedPages } from "./paginated-components";

export interface UsePaginatedControlBindingInput {
  readonly editor: Editor;
  readonly getPos: () => number | undefined;
  readonly layoutId: string;
  readonly node: ProseMirrorNode;
}

/** Mounts one Paginated owner binding and returns the runtime learner-commit route. */
export function usePaginatedControlBinding({
  editor,
  getPos,
  layoutId,
  node,
}: UsePaginatedControlBindingInput): (sectionId: string) => void {
  const registry = tryGetControlBindingRegistryForEditor(editor);
  const listenersRef = useRef(new Set<ControlEventListener>());
  const behaviorRef = useRef({ editor, getPos, node });
  behaviorRef.current = { editor, getPos, node };

  useEffect(() => {
    if (!registry) return;
    const parsedOwnerId = EmbeddedNodeIdSchema.safeParse(layoutId);
    if (!parsedOwnerId.success) return;
    const ownerId = parsedOwnerId.data;
    const listeners = listenersRef.current;
    const unregister = registry.register({
      ownerId,
      eventSource: {
        subscribe(listener) {
          listeners.add(listener);
          let subscribed = true;
          return () => {
            if (!subscribed) return;
            subscribed = false;
            listeners.delete(listener);
          };
        },
      },
      stateReader: {
        read({ targetId }) {
          const pages = requireCurrentPaginatedSection(behaviorRef.current, ownerId, targetId);
          const storedActiveId =
            getLayoutInteractionStoreState(editor).activePageByLayoutId[ownerId];
          return normalizeActivePageId(storedActiveId, pages) === targetId;
        },
      },
      commandExecutor: {
        async execute({ targetId, signal }) {
          requireCurrentPaginatedSection(behaviorRef.current, ownerId, targetId);
          if (signal.aborted) {
            return Result.err(Object.freeze({ reason: "cancelled" as const }));
          }
          getLayoutInteractionStoreState(editor).setActivePage(ownerId, targetId, {
            origin: "control-command",
          });
          return Result.ok();
        },
      },
    });

    return () => {
      try {
        unregister();
      } finally {
        listeners.clear();
      }
    };
  }, [editor, layoutId, registry]);

  return useCallback(
    (sectionId: string) => {
      const parsedOwnerId = EmbeddedNodeIdSchema.safeParse(layoutId);
      const parsedTargetId = EmbeddedNodeIdSchema.safeParse(sectionId);
      if (!parsedOwnerId.success || !parsedTargetId.success) {
        getLayoutInteractionStoreState(editor).setActivePage(layoutId, sectionId, {
          origin: "learner",
        });
        return;
      }
      const ownerId = parsedOwnerId.data;
      const targetId = parsedTargetId.data;
      requireCurrentPaginatedSection(behaviorRef.current, ownerId, targetId);
      getLayoutInteractionStoreState(editor).setActivePage(ownerId, targetId, {
        origin: "learner",
      });
      for (const listener of [...listenersRef.current]) {
        listener(Object.freeze({ targetId, type: "selected" }));
      }
    },
    [editor, layoutId],
  );
}

interface CurrentPaginatedBehavior {
  readonly editor: Editor;
  readonly getPos: () => number | undefined;
  readonly node: ProseMirrorNode;
}

function requireCurrentPaginatedSection(
  behavior: CurrentPaginatedBehavior,
  ownerId: EmbeddedNodeId,
  targetId: EmbeddedNodeId,
) {
  if (
    behavior.node.type.name !== "layout" ||
    behavior.node.attrs["id"] !== ownerId ||
    behavior.node.attrs["variant"] !== "paginated"
  ) {
    throw new Error(`Paginated Control Binding owner "${ownerId}" is no longer mounted.`);
  }

  let position: number | undefined;
  try {
    position = behavior.getPos();
  } catch {
    throw new Error(`Paginated Control Binding owner "${ownerId}" is no longer mounted.`);
  }
  if (typeof position !== "number") {
    throw new Error(`Paginated Control Binding owner "${ownerId}" is no longer mounted.`);
  }

  const layout = behavior.editor.state.doc.nodeAt(position);
  if (
    layout?.type.name !== "layout" ||
    layout.attrs["id"] !== ownerId ||
    layout.attrs["variant"] !== "paginated"
  ) {
    throw new Error(`Paginated Control Binding owner "${ownerId}" is no longer mounted.`);
  }

  const pages = readPaginatedPages(layout);
  if (!pages.some((page) => page.id === targetId)) {
    throw new Error(
      `Paginated Section "${targetId}" is not a current child of owner "${ownerId}".`,
    );
  }
  return pages;
}
