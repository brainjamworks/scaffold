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
import { normalizeActiveTabId, readTabsSections } from "./tabs-components";

export interface UseTabsControlBindingInput {
  readonly editor: Editor;
  readonly getPos: () => number | undefined;
  readonly layoutId: string;
  readonly node: ProseMirrorNode;
}

/** Mounts one Tabs owner binding and returns the runtime learner-commit route. */
export function useTabsControlBinding({
  editor,
  getPos,
  layoutId,
  node,
}: UseTabsControlBindingInput): (sectionId: string) => void {
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
          const sections = requireCurrentTabsSection(behaviorRef.current, ownerId, targetId);
          const storedActiveId = getLayoutInteractionStoreState(editor).activeTabByLayoutId[
            ownerId
          ];
          return normalizeActiveTabId(storedActiveId, sections) === targetId;
        },
      },
      commandExecutor: {
        async execute({ targetId, signal }) {
          requireCurrentTabsSection(behaviorRef.current, ownerId, targetId);
          if (signal.aborted) {
            return Result.err(Object.freeze({ reason: "cancelled" as const }));
          }
          getLayoutInteractionStoreState(editor).setActiveTab(ownerId, targetId, {
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
        getLayoutInteractionStoreState(editor).setActiveTab(layoutId, sectionId, {
          origin: "learner",
        });
        return;
      }
      const ownerId = parsedOwnerId.data;
      const targetId = parsedTargetId.data;
      requireCurrentTabsSection(behaviorRef.current, ownerId, targetId);
      getLayoutInteractionStoreState(editor).setActiveTab(ownerId, targetId, {
        origin: "learner",
      });
      for (const listener of [...listenersRef.current]) {
        listener(Object.freeze({ targetId, type: "selected" }));
      }
    },
    [editor, layoutId],
  );
}

interface CurrentTabsBehavior {
  readonly editor: Editor;
  readonly getPos: () => number | undefined;
  readonly node: ProseMirrorNode;
}

function requireCurrentTabsSection(
  behavior: CurrentTabsBehavior,
  ownerId: EmbeddedNodeId,
  targetId: EmbeddedNodeId,
) {
  if (
    behavior.node.type.name !== "layout" ||
    behavior.node.attrs["id"] !== ownerId ||
    behavior.node.attrs["variant"] !== "tabs"
  ) {
    throw new Error(`Tabs Control Binding owner "${ownerId}" is no longer mounted.`);
  }

  let position: number | undefined;
  try {
    position = behavior.getPos();
  } catch {
    throw new Error(`Tabs Control Binding owner "${ownerId}" is no longer mounted.`);
  }
  if (typeof position !== "number") {
    throw new Error(`Tabs Control Binding owner "${ownerId}" is no longer mounted.`);
  }

  const layout = behavior.editor.state.doc.nodeAt(position);
  if (
    layout?.type.name !== "layout" ||
    layout.attrs["id"] !== ownerId ||
    layout.attrs["variant"] !== "tabs"
  ) {
    throw new Error(`Tabs Control Binding owner "${ownerId}" is no longer mounted.`);
  }

  const sections = readTabsSections(layout);
  if (!sections.some((section) => section.id === targetId)) {
    throw new Error(`Tabs Section "${targetId}" is not a current child of owner "${ownerId}".`);
  }
  return sections;
}
