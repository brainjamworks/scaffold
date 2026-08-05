import type { Editor } from "@tiptap/core";
import { useEffect, useState } from "react";

import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import { resolveAuthoringFrameElement } from "@/editor/interactions/dom/authoring-frame";
import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";
import { getInteractionFacadeStoreForEditor } from "@/editor/interactions/targets/prosemirror/facade/interaction-facade-storage";
import {
  resolveBlockChromeTargetDescriptor,
  resolveBlockChromeTargetFromSnapshot,
} from "@/editor/interactions/targets/prosemirror/projection/block-chrome-target-projection";
import { resolveStructuralChromeTargetFromSnapshot } from "@/editor/interactions/targets/prosemirror/projection/structural-chrome-target-projection";
import {
  projectStructuralTargetRef,
  type StructuralInteractionTargetKind,
} from "@/editor/interactions/targets/prosemirror/projection/target-ref-projection";

import {
  canStartStructureMovement,
  createStructureMovementPolicy,
  resolveMovementNodeContext,
  type MovementNodeContext,
} from "../model/movement-policy";
import {
  resolveV2MovementTargetFromDescriptor,
  type V2EditorMovementTarget,
} from "./editor-movement-target";

export type EditorMovementTarget = V2EditorMovementTarget;

export function resolveEditorMovementTargetAtPos(
  editor: Editor,
  pos: number,
  blockDefinitions: BlockDefinitionLookup,
): EditorMovementTarget | null {
  const policy = createStructureMovementPolicy(editor.schema, blockDefinitions);
  const context = resolveMovementNodeContext(editor.state.doc, pos);
  if (!context || !canStartStructureMovement(policy, context)) return null;

  const blockDescriptor = resolveBlockChromeTargetDescriptor(
    editor.state,
    {
      kind: InteractionTargetKind.Block,
      pos,
    },
    blockDefinitions,
  );
  if (blockDescriptor) {
    return resolveV2MovementTargetFromDescriptor(editor, blockDescriptor, blockDefinitions);
  }

  return resolveStructuralMovementTargetAtPos(editor, context);
}

export function resolveEditorMovementTarget(
  editor: Editor,
  blockDefinitions: BlockDefinitionLookup,
): EditorMovementTarget | null {
  const snapshot = getInteractionFacadeStoreForEditor(editor).getState().snapshot;
  const descriptor = resolveBlockChromeTargetFromSnapshot(
    editor.state,
    snapshot,
    "movementHandle",
    blockDefinitions,
  );
  if (descriptor) {
    return resolveV2MovementTargetFromDescriptor(editor, descriptor, blockDefinitions);
  }

  // Only layouts publish the shared floating movement handle; section
  // reordering stays on the layout component's section-local handles.
  const structural = resolveStructuralChromeTargetFromSnapshot(
    editor.state,
    snapshot,
    "movementHandle",
  );
  if (structural?.kind !== InteractionTargetKind.Layout) return null;

  const policy = createStructureMovementPolicy(editor.schema, blockDefinitions);
  const context = resolveMovementNodeContext(editor.state.doc, structural.pos);
  if (!context || !canStartStructureMovement(policy, context)) return null;

  return resolveStructuralMovementTargetAtPos(editor, context);
}

/**
 * Structural layout/section drags carry structural target refs while movement
 * policy stays owned by the drag module.
 */
function resolveStructuralMovementTargetAtPos(
  editor: Editor,
  context: MovementNodeContext,
): EditorMovementTarget | null {
  const structuralKind = structuralKindForNodeTypeName(context.nodeType.name);
  if (!structuralKind) return null;

  const dom = editor.view.nodeDOM(context.pos);
  if (!(dom instanceof Element)) return null;

  const id = context.node.attrs["id"];
  const element =
    (typeof id === "string" && id.trim()
      ? resolveAuthoringFrameElement(dom, { frameKind: structuralKind, id })
      : null) ?? dom;

  return {
    context,
    element,
    rect: element.getBoundingClientRect(),
    targetRef: projectStructuralTargetRef({
      kind: structuralKind,
      node: context.node,
      pos: context.pos,
    }),
  };
}

const STRUCTURAL_MOVEMENT_SOURCE_KINDS = new Set<string>([
  InteractionTargetKind.Layout,
  InteractionTargetKind.Section,
]);

function structuralKindForNodeTypeName(name: string): StructuralInteractionTargetKind | null {
  return STRUCTURAL_MOVEMENT_SOURCE_KINDS.has(name)
    ? (name as StructuralInteractionTargetKind)
    : null;
}

export function useEditorMovementTarget(
  editor: Editor,
  blockDefinitions: BlockDefinitionLookup,
): EditorMovementTarget | null {
  const [target, setTarget] = useState<EditorMovementTarget | null>(() =>
    resolveEditorMovementTarget(editor, blockDefinitions),
  );

  useEffect(() => {
    const update = () => {
      setTarget(resolveEditorMovementTarget(editor, blockDefinitions));
    };

    editor.on("selectionUpdate", update);
    editor.on("transaction", update);
    update();

    return () => {
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
    };
  }, [blockDefinitions, editor]);

  useEffect(() => {
    if (!target?.element || typeof ResizeObserver === "undefined") return undefined;

    let frame = 0;
    const scheduleUpdate = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setTarget(resolveEditorMovementTarget(editor, blockDefinitions));
      });
    };
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(target.element);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [blockDefinitions, editor, target?.element]);

  return target;
}
