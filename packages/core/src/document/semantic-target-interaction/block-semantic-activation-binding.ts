import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";

import { getSemanticTargetInteractionEnvironmentForEditor } from "./semantic-target-interaction-storage";
import type { SemanticActivationRegistryPort } from "./semantic-target-interaction-environment";

export type CurrentDirectChildStatus = "current" | "owner-missing" | "child-missing";

export function currentDirectChildStatus({
  childId,
  childNodeType,
  editor,
  getPos,
  ownerId,
  ownerNodeType,
}: {
  readonly childId: EmbeddedNodeId;
  readonly childNodeType: string;
  readonly editor: Editor;
  readonly getPos: () => number | undefined;
  readonly ownerId: EmbeddedNodeId;
  readonly ownerNodeType: string;
}): CurrentDirectChildStatus {
  let position: number | undefined;
  try {
    position = getPos();
  } catch {
    return "owner-missing";
  }
  if (typeof position !== "number") return "owner-missing";
  const owner = editor.state.doc.nodeAt(position);
  const currentOwnerId = EmbeddedNodeIdSchema.safeParse(owner?.attrs["id"]);
  if (
    owner?.type.name !== ownerNodeType ||
    !currentOwnerId.success ||
    currentOwnerId.data !== ownerId
  ) {
    return "owner-missing";
  }

  let found = false;
  owner.forEach((child) => {
    if (found || child.type.name !== childNodeType) return;
    const currentChildId = EmbeddedNodeIdSchema.safeParse(child.attrs["id"]);
    found = currentChildId.success && currentChildId.data === childId;
  });
  return found ? "current" : "child-missing";
}

export function semanticActivationRegistryForEditor(
  editor: Editor,
): SemanticActivationRegistryPort | null {
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
