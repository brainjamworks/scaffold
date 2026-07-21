import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";

import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import {
  AUTHORING_FRAME_WRAPPER_ACTIVE_ATTR,
  AUTHORING_RESIZE_HANDLE_ATTR,
} from "@/editor/interactions/dom/authoring-chrome";
import {
  AuthoringFrameKind,
  resolveAuthoringFrameElement,
} from "@/editor/interactions/dom/authoring-frame";
import {
  InteractionTargetKind,
  sameInteractionTarget,
} from "@/editor/interactions/targets/model/interaction-owner-state";
import { findInteractionFacadeStoreForEditor } from "@/editor/interactions/targets/prosemirror/facade/interaction-facade-storage";
import { resolveBlockChromeTargetFromSnapshot } from "@/editor/interactions/targets/prosemirror/projection/block-chrome-target-projection";
import { resolveScaffoldBlockContext } from "@/editor/selection/block-context";

import type { BlockFrameDefinition } from "@/editor/blocks/block-definition";

export interface NodeViewBlockTargetInput {
  blockDefinitions: BlockDefinitionLookup;
  getPos: () => unknown;
  node: PMNode;
}

export interface SyncResizeChromeInput extends NodeViewBlockTargetInput {
  editor: Editor;
  editorHasFocus: boolean;
  frameDefinition: BlockFrameDefinition | undefined;
  wrapper: HTMLElement;
}

export function syncNodeViewResizeChrome(input: SyncResizeChromeInput): void {
  const slotState = resolveVisibleResizeSlotState(input);
  const isVisible =
    input.editor.isEditable &&
    input.frameDefinition?.resizable !== false &&
    !slotState.gestureOwnsInteraction &&
    slotState.targetsOwnBlock &&
    (input.editorHasFocus || slotState.contextOwnerTargetsOwnBlock);

  if (isVisible) {
    input.wrapper.setAttribute(AUTHORING_FRAME_WRAPPER_ACTIVE_ATTR, "");
  } else {
    input.wrapper.removeAttribute(AUTHORING_FRAME_WRAPPER_ACTIVE_ATTR);
  }

  for (const handle of input.wrapper.querySelectorAll<HTMLElement>(
    `[${AUTHORING_RESIZE_HANDLE_ATTR}]`,
  )) {
    handle.style.display = isVisible ? "block" : "none";
  }
}

export function resolveNodeViewBlockElement(
  root: HTMLElement,
  input: NodeViewBlockTargetInput,
): HTMLElement | null {
  const blockId = resolveOwnBlockId(input);
  if (!blockId) return null;

  const element = resolveAuthoringFrameElement(root, {
    frameKind: AuthoringFrameKind.Block,
    id: blockId,
  });
  return element instanceof HTMLElement ? element : null;
}

function resolveVisibleResizeSlotState(input: SyncResizeChromeInput): {
  contextOwnerTargetsOwnBlock: boolean;
  gestureOwnsInteraction: boolean;
  targetsOwnBlock: boolean;
} {
  const pos = resolveNodePos(input.getPos);
  if (pos === null) return hiddenResizeSlotState();

  const ownContext = resolveScaffoldBlockContext(input.node, pos, input.blockDefinitions);
  if (!ownContext) return hiddenResizeSlotState();

  const facadeStore = findInteractionFacadeStoreForEditor(input.editor);
  if (!facadeStore) return hiddenResizeSlotState();

  const snapshot = facadeStore.getState().snapshot;
  const slotDescriptor = resolveBlockChromeTargetFromSnapshot(
    input.editor.state,
    snapshot,
    "resizeHandles",
    input.blockDefinitions,
  );
  if (!slotDescriptor) return hiddenResizeSlotState();

  const targetsOwnBlock =
    slotDescriptor.pos === ownContext.pos && slotDescriptor.nodeType === ownContext.nodeType;
  const contextOwner = snapshot.owners.contextOwner.target;

  return {
    contextOwnerTargetsOwnBlock:
      targetsOwnBlock &&
      contextOwner !== null &&
      contextOwner.kind === InteractionTargetKind.Block &&
      sameInteractionTarget(contextOwner, slotDescriptor.target),
    gestureOwnsInteraction: snapshot.owners.gestureOwner.target !== null,
    targetsOwnBlock,
  };
}

function hiddenResizeSlotState(): {
  contextOwnerTargetsOwnBlock: boolean;
  gestureOwnsInteraction: boolean;
  targetsOwnBlock: boolean;
} {
  return {
    contextOwnerTargetsOwnBlock: false,
    gestureOwnsInteraction: false,
    targetsOwnBlock: false,
  };
}

function resolveOwnBlockId(input: NodeViewBlockTargetInput): string | null {
  const pos = resolveNodePos(input.getPos);
  if (pos === null) return null;

  const blockContext = resolveScaffoldBlockContext(input.node, pos, input.blockDefinitions);
  if (!blockContext) return null;

  const id = blockContext.node.attrs["id"];
  return typeof id === "string" && id.trim() ? id : null;
}

function resolveNodePos(getPos: () => unknown): number | null {
  try {
    const pos = getPos();
    return typeof pos === "number" ? pos : null;
  } catch {
    return null;
  }
}
