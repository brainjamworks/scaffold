import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Result } from "better-result";
import { useEffect, useRef } from "react";

import {
  tryGetControlBindingRegistryForEditor,
  type ControlEventListener,
} from "@/document/control-binding";

import { GALLERY_ITEM_NODE, GALLERY_NODE } from "./content";
import type { GalleryRuntimeController } from "./gallery-runtime-controller";

interface GalleryControlBindingInput {
  readonly controller: GalleryRuntimeController;
  readonly editor: Editor;
  readonly enabled: boolean;
  readonly getPos: () => number | undefined;
  readonly node: ProseMirrorNode;
  readonly ownerId: string;
}

/** Mounts one carousel-only Gallery binding over the block-local active item authority. */
export function useGalleryControlBinding(input: GalleryControlBindingInput): void {
  const { controller, editor, enabled, ownerId } = input;
  const registry = tryGetControlBindingRegistryForEditor(editor);
  const listenersRef = useRef(new Set<ControlEventListener>());
  const behaviorRef = useRef(input);
  behaviorRef.current = input;

  useEffect(() => {
    if (!enabled || !registry) return;
    const parsedOwnerId = EmbeddedNodeIdSchema.safeParse(ownerId);
    if (!parsedOwnerId.success) return;
    const mountedOwnerId = parsedOwnerId.data;
    const listeners = listenersRef.current;
    const unsubscribeChanges = controller.subscribeToChanges((change) => {
      if (change.origin !== "learner" || change.activeId === null) return;
      const targetId = EmbeddedNodeIdSchema.parse(change.activeId);
      requireCurrentGalleryItem(behaviorRef.current, mountedOwnerId, targetId);
      const event = Object.freeze({ targetId, type: "selected" });
      for (const listener of [...listeners]) listener(event);
    });
    const unregister = registry.register({
      ownerId: mountedOwnerId,
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
          requireCurrentGalleryItem(behaviorRef.current, mountedOwnerId, targetId);
          return controller.getActiveId() === targetId;
        },
      },
      commandExecutor: {
        async execute({ targetId, type, signal }) {
          requireCurrentGalleryItem(behaviorRef.current, mountedOwnerId, targetId);
          if (signal.aborted) {
            return Result.err(Object.freeze({ reason: "cancelled" as const }));
          }
          if (type !== "select") {
            throw new Error(`Unsupported Gallery Control command "${type}".`);
          }
          controller.setActiveId(targetId, "control-command");
          return Result.ok();
        },
      },
    });

    return () => {
      try {
        unregister();
      } finally {
        unsubscribeChanges();
        listeners.clear();
      }
    };
  }, [controller, editor, enabled, ownerId, registry]);
}

function requireCurrentGalleryItem(
  behavior: GalleryControlBindingInput,
  ownerId: EmbeddedNodeId,
  targetId: EmbeddedNodeId,
): ProseMirrorNode {
  if (behavior.node.type.name !== GALLERY_NODE || behavior.node.attrs["id"] !== ownerId) {
    throw new Error(`Gallery Control Binding owner "${ownerId}" is no longer mounted.`);
  }

  let position: number | undefined;
  try {
    position = behavior.getPos();
  } catch {
    throw new Error(`Gallery Control Binding owner "${ownerId}" is no longer mounted.`);
  }
  if (typeof position !== "number") {
    throw new Error(`Gallery Control Binding owner "${ownerId}" is no longer mounted.`);
  }

  const current = behavior.editor.state.doc.nodeAt(position);
  if (current?.type.name !== GALLERY_NODE || current.attrs["id"] !== ownerId) {
    throw new Error(`Gallery Control Binding owner "${ownerId}" is no longer mounted.`);
  }

  let isCurrentItem = false;
  current.forEach((child) => {
    if (child.type.name === GALLERY_ITEM_NODE && child.attrs["id"] === targetId) {
      isCurrentItem = true;
    }
  });
  if (!isCurrentItem) {
    throw new Error(`Gallery item "${targetId}" is not a current child of owner "${ownerId}".`);
  }
  return current;
}
