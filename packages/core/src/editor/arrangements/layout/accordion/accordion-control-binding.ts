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
  getLayoutInteractionStoreState,
  subscribeToLayoutInteractionStore,
} from "../shared/model/layout-interaction-store";
import {
  defaultOpenAccordionSectionIds,
  isAccordionSectionOpen,
  readAccordionOptions,
  readAccordionSections,
} from "./accordion-components";

export interface UseAccordionControlBindingInput {
  readonly editor: Editor;
  readonly getPos: () => number | undefined;
  readonly layoutId: string;
  readonly node: ProseMirrorNode;
}

/** Mounts one Accordion owner binding over the Layout Interaction Store authority. */
export function useAccordionControlBinding({
  editor,
  getPos,
  layoutId,
  node,
}: UseAccordionControlBindingInput): void {
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
          const current = requireCurrentAccordionSection(behaviorRef.current, ownerId, targetId);
          const storedOpenIds =
            getLayoutInteractionStoreState(editor).openAccordionSectionsByLayoutId[ownerId];
          return isAccordionSectionOpen({
            defaultOpenIds: current.defaultOpenIds,
            sectionId: targetId,
            storedOpenIds,
          });
        },
      },
      commandExecutor: {
        async execute({ targetId, type, signal }) {
          const current = requireCurrentAccordionSection(behaviorRef.current, ownerId, targetId);
          if (signal.aborted) {
            return Result.err(Object.freeze({ reason: "cancelled" as const }));
          }
          const store = getLayoutInteractionStoreState(editor);
          if (type === "open") {
            store.setAccordionSectionOpen(ownerId, targetId, {
              allowMultiple: current.allowMultiple,
              defaultOpenIds: current.defaultOpenIds,
              origin: "control-command",
            });
          } else if (type === "close") {
            store.setAccordionSectionClosed(ownerId, targetId, {
              defaultOpenIds: current.defaultOpenIds,
              origin: "control-command",
            });
          } else {
            throw new Error(`Unsupported Accordion Control command "${type}".`);
          }
          return Result.ok();
        },
      },
    });
    const unsubscribeFromStore = subscribeToLayoutInteractionStore(
      editor,
      (state, previousState) => {
        const change = state.lastSectionChangeByLayoutId[ownerId];
        if (
          !change ||
          change === previousState.lastSectionChangeByLayoutId[ownerId] ||
          change.origin !== "learner"
        ) {
          return;
        }
        const parsedTargetId = EmbeddedNodeIdSchema.safeParse(change.sectionId);
        if (!parsedTargetId.success) return;
        const targetId = parsedTargetId.data;
        const current = requireCurrentAccordionSection(behaviorRef.current, ownerId, targetId);
        const isOpen = isAccordionSectionOpen({
          defaultOpenIds: current.defaultOpenIds,
          sectionId: targetId,
          storedOpenIds: state.openAccordionSectionsByLayoutId[ownerId],
        });
        const event = Object.freeze({ targetId, type: isOpen ? "opened" : "closed" });
        for (const listener of [...listeners]) listener(event);
      },
    );

    return () => {
      try {
        unsubscribeFromStore();
      } finally {
        try {
          unregister();
        } finally {
          listeners.clear();
        }
      }
    };
  }, [editor, layoutId, registry]);
}

interface CurrentAccordionBehavior {
  readonly editor: Editor;
  readonly getPos: () => number | undefined;
  readonly node: ProseMirrorNode;
}

function requireCurrentAccordionSection(
  behavior: CurrentAccordionBehavior,
  ownerId: EmbeddedNodeId,
  targetId: EmbeddedNodeId,
) {
  if (
    behavior.node.type.name !== "layout" ||
    behavior.node.attrs["id"] !== ownerId ||
    behavior.node.attrs["variant"] !== "accordion"
  ) {
    throw new Error(`Accordion Control Binding owner "${ownerId}" is no longer mounted.`);
  }

  let position: number | undefined;
  try {
    position = behavior.getPos();
  } catch {
    throw new Error(`Accordion Control Binding owner "${ownerId}" is no longer mounted.`);
  }
  if (typeof position !== "number") {
    throw new Error(`Accordion Control Binding owner "${ownerId}" is no longer mounted.`);
  }

  const layout = behavior.editor.state.doc.nodeAt(position);
  if (
    layout?.type.name !== "layout" ||
    layout.attrs["id"] !== ownerId ||
    layout.attrs["variant"] !== "accordion"
  ) {
    throw new Error(`Accordion Control Binding owner "${ownerId}" is no longer mounted.`);
  }

  const sections = readAccordionSections(layout);
  if (!sections.some((section) => section.id === targetId)) {
    throw new Error(
      `Accordion Section "${targetId}" is not a current child of owner "${ownerId}".`,
    );
  }
  return {
    allowMultiple: readAccordionOptions(layout.attrs["options"]).allowMultiple,
    defaultOpenIds: defaultOpenAccordionSectionIds(sections),
  };
}
