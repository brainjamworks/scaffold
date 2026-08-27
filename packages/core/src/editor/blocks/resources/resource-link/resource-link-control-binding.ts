import {
  EmbeddedNodeIdSchema,
  ResourceLinkDataSchema,
  isHttpOrHttpsUrl,
  type EmbeddedNodeId,
} from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { useCallback, useEffect, useRef } from "react";

import {
  tryGetControlBindingRegistryForEditor,
  type ControlBinding,
  type ControlEvent,
  type ControlEventListener,
} from "@/document/control-binding";

interface CreateResourceLinkControlBindingControllerInput {
  readonly ownerId: EmbeddedNodeId;
  readonly requireMounted: () => void;
}

interface ResourceLinkControlBindingController {
  readonly binding: ControlBinding;
  readonly dispose: () => void;
  readonly publish: () => void;
}

interface UseResourceLinkControlBindingInput {
  readonly editor: Editor;
  readonly getPos: () => number | undefined;
  readonly node: ProseMirrorNode;
}

export function createResourceLinkControlBindingController({
  ownerId,
  requireMounted,
}: CreateResourceLinkControlBindingControllerInput): ResourceLinkControlBindingController {
  const listeners = new Set<ControlEventListener>();
  let active = true;
  const requireActive = () => {
    if (!active) {
      throw new Error(`Resource Link Control Binding owner "${ownerId}" is no longer mounted.`);
    }
    requireMounted();
  };

  const binding = Object.freeze<ControlBinding>({
    ownerId,
    eventSource: {
      subscribe(listener) {
        requireActive();
        listeners.add(listener);
        let subscribed = true;
        return () => {
          if (!subscribed) return;
          subscribed = false;
          listeners.delete(listener);
        };
      },
    },
  });

  return Object.freeze({
    binding,
    dispose() {
      if (!active) return;
      active = false;
      listeners.clear();
    },
    publish() {
      requireActive();
      const event = Object.freeze({ targetId: ownerId, type: "launched" }) satisfies ControlEvent;
      let failed = false;
      let firstDefect: unknown;
      for (const listener of [...listeners]) {
        try {
          listener(event);
        } catch (error) {
          if (!failed) firstDefect = error;
          failed = true;
        }
      }
      if (failed) throw firstDefect;
    },
  });
}

export function useResourceLinkControlBinding(
  input: UseResourceLinkControlBindingInput,
): () => void {
  const { editor } = input;
  const registry = tryGetControlBindingRegistryForEditor(editor);
  const parsedOwnerId = EmbeddedNodeIdSchema.safeParse(input.node.attrs["id"]);
  const ownerId = parsedOwnerId.success ? parsedOwnerId.data : null;
  const parsedData = ResourceLinkDataSchema.safeParse(input.node.attrs["data"]);
  const eligible = parsedData.success && isHttpOrHttpsUrl(parsedData.data.url);
  const behaviorRef = useRef(input);
  behaviorRef.current = input;
  const controllerRef = useRef<ResourceLinkControlBindingController | null>(null);

  useEffect(() => {
    if (!eligible || !ownerId || !registry) return;
    requireCurrentResourceLinkOwner(behaviorRef.current, ownerId);
    const controller = createResourceLinkControlBindingController({
      ownerId,
      requireMounted: () => requireCurrentResourceLinkOwner(behaviorRef.current, ownerId),
    });
    const unregister = registry.register(controller.binding);
    controllerRef.current = controller;
    return () => {
      if (controllerRef.current === controller) controllerRef.current = null;
      try {
        unregister();
      } finally {
        controller.dispose();
      }
    };
  }, [editor, eligible, ownerId, registry]);

  return useCallback(() => controllerRef.current?.publish(), []);
}

function requireCurrentResourceLinkOwner(
  behavior: UseResourceLinkControlBindingInput,
  ownerId: EmbeddedNodeId,
): void {
  if (behavior.node.type.name !== "resource_link" || behavior.node.attrs["id"] !== ownerId) {
    throw new Error(`Resource Link Control Binding owner "${ownerId}" is no longer mounted.`);
  }

  let position: number | undefined;
  try {
    position = behavior.getPos();
  } catch {
    throw new Error(`Resource Link Control Binding owner "${ownerId}" is no longer mounted.`);
  }
  if (typeof position !== "number") {
    throw new Error(`Resource Link Control Binding owner "${ownerId}" is no longer mounted.`);
  }
  const current = behavior.editor.state.doc.nodeAt(position);
  const currentData = ResourceLinkDataSchema.safeParse(current?.attrs["data"]);
  if (
    current?.type.name !== "resource_link" ||
    current.attrs["id"] !== ownerId ||
    !currentData.success ||
    !isHttpOrHttpsUrl(currentData.data.url)
  ) {
    throw new Error(`Resource Link Control Binding owner "${ownerId}" is no longer mounted.`);
  }
}
