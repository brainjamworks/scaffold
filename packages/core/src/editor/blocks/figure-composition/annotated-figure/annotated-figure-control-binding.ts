import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Result } from "better-result";
import { useEffect, useRef } from "react";

import {
  tryGetControlBindingRegistryForEditor,
  type ControlEventListener,
} from "@/document/control-binding";
import {
  tryGetSemanticTargetInteractionEnvironmentForEditor,
  type SemanticActivationOutcome,
} from "@/document/semantic-target-interaction";

import {
  resolveAnnotatedFigureModel,
  type ResolvedAnnotatedFigureModel,
} from "./annotated-figure-document-model";
import type { AnnotatedFigureRuntimeController } from "./annotated-figure-runtime-controller";
import { ANNOTATED_FIGURE_NODE } from "./content";

interface AnnotatedFigureControlBindingInput {
  readonly controller: AnnotatedFigureRuntimeController;
  readonly editor: Editor;
  readonly enabled: boolean;
  readonly getPos: () => number | undefined;
  readonly node: ProseMirrorNode | null;
  readonly ownerId: string;
}

/** Mounts one runtime-only Annotated Figure binding over its block-local presentation controller. */
export function useAnnotatedFigureControlBinding(input: AnnotatedFigureControlBindingInput): void {
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
      if (change.origin !== "learner") return;
      const changedTargetId = change.annotationId ?? change.previousAnnotationId;
      if (!changedTargetId) return;
      const targetId = EmbeddedNodeIdSchema.parse(changedTargetId);
      requireCurrentTarget(behaviorRef.current, mountedOwnerId, targetId);
      const event = Object.freeze({
        targetId,
        type: change.annotationId === null ? "closed" : "opened",
      });
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
          const model = requireCurrentTarget(behaviorRef.current, mountedOwnerId, targetId);
          if (targetId === mountedOwnerId) {
            return model.annotations.every(({ id }) => controller.hasLearnerOpenedAnnotation(id));
          }
          return controller.getOpenAnnotationId() === targetId;
        },
      },
      commandExecutor: {
        async execute({ targetId, type, signal }) {
          requireCurrentTarget(behaviorRef.current, mountedOwnerId, targetId);
          if (signal.aborted) {
            return Result.err(Object.freeze({ reason: "cancelled" as const }));
          }
          if (type === "open") {
            controller.setOpenAnnotationId(targetId, "control-command");
          } else if (type === "close") {
            if (controller.getOpenAnnotationId() === targetId) {
              controller.setOpenAnnotationId(null, "control-command");
            }
          } else {
            throw new Error(`Unsupported Annotated Figure Control command "${type}".`);
          }
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

/** Opens published annotations for semantic navigation without learner causation. */
export function useAnnotatedFigureSemanticActivationBinding(
  input: AnnotatedFigureControlBindingInput,
): void {
  const { controller, editor, enabled, ownerId } = input;
  const registry = tryGetSemanticTargetInteractionEnvironmentForEditor(editor)?.registry;
  const behaviorRef = useRef(input);
  behaviorRef.current = input;

  useEffect(() => {
    if (!enabled || !registry) return;
    const parsedOwnerId = EmbeddedNodeIdSchema.safeParse(ownerId);
    if (!parsedOwnerId.success) return;
    const mountedOwnerId = parsedOwnerId.data;
    let active = true;

    const unregister = registry.register({
      ownerId: mountedOwnerId,
      async activate({ relationship, signal }) {
        const childId = relationship.childId;
        if (!active) return unavailable(mountedOwnerId, childId, "owner-unmounted");
        if (signal.aborted) return interrupted(mountedOwnerId, childId);
        try {
          requireCurrentTarget(behaviorRef.current, mountedOwnerId, childId);
        } catch {
          return unavailable(mountedOwnerId, childId, "child-missing");
        }
        if (controller.getOpenAnnotationId() === childId) {
          return outcome("already-visible", mountedOwnerId, childId);
        }
        controller.setOpenAnnotationId(childId, "semantic-activation");
        return outcome("revealed", mountedOwnerId, childId);
      },
    });

    return () => {
      active = false;
      unregister();
    };
  }, [controller, enabled, ownerId, registry]);
}

function requireCurrentTarget(
  behavior: AnnotatedFigureControlBindingInput,
  ownerId: EmbeddedNodeId,
  targetId: EmbeddedNodeId,
): ResolvedAnnotatedFigureModel {
  if (behavior.node?.type.name !== ANNOTATED_FIGURE_NODE || behavior.node.attrs["id"] !== ownerId) {
    throw new Error(`Annotated Figure Control Binding owner "${ownerId}" is no longer mounted.`);
  }

  let position: number | undefined;
  try {
    position = behavior.getPos();
  } catch {
    throw new Error(`Annotated Figure Control Binding owner "${ownerId}" is no longer mounted.`);
  }
  if (typeof position !== "number") {
    throw new Error(`Annotated Figure Control Binding owner "${ownerId}" is no longer mounted.`);
  }

  const current = behavior.editor.state.doc.nodeAt(position);
  if (current?.type.name !== ANNOTATED_FIGURE_NODE || current.attrs["id"] !== ownerId) {
    throw new Error(`Annotated Figure Control Binding owner "${ownerId}" is no longer mounted.`);
  }
  const model = resolveAnnotatedFigureModel({ node: current, pos: position });
  if (!model) {
    throw new Error(`Annotated Figure Control Binding owner "${ownerId}" is invalid.`);
  }
  if (
    targetId !== ownerId &&
    !model.annotations.some((annotation) => annotation.id === targetId)
  ) {
    throw new Error(
      `Annotated Figure annotation "${targetId}" is not a current child of owner "${ownerId}".`,
    );
  }
  return model;
}

function outcome(
  kind: "revealed" | "already-visible",
  ownerId: EmbeddedNodeId,
  childId: EmbeddedNodeId,
): SemanticActivationOutcome {
  return Object.freeze({ kind, ownerId, childId });
}

function interrupted(ownerId: EmbeddedNodeId, childId: EmbeddedNodeId): SemanticActivationOutcome {
  return Object.freeze({ kind: "interrupted", ownerId, childId });
}

function unavailable(
  ownerId: EmbeddedNodeId,
  childId: EmbeddedNodeId,
  reason: "owner-unmounted" | "child-missing",
): SemanticActivationOutcome {
  return Object.freeze({ kind: "unavailable", ownerId, childId, reason });
}
