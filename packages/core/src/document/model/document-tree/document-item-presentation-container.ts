import type { EmbeddedNodeId, PresentationContentLayout } from "@scaffold/contracts";

import type { DocumentTreeSnapshot } from "./document-tree-snapshot";

export interface ResolvedDocumentItemPresentationContainer {
  readonly boundaryId: EmbeddedNodeId;
  readonly contentLayout: PresentationContentLayout;
  readonly directChildId: EmbeddedNodeId;
}

export function resolveDocumentItemPresentationContainer(
  snapshot: DocumentTreeSnapshot,
  targetId: EmbeddedNodeId,
): ResolvedDocumentItemPresentationContainer | null {
  if (!snapshot.itemById.has(targetId)) return null;

  let directChildId = targetId;
  let ancestorId = snapshot.parentById.get(targetId) ?? null;

  while (ancestorId !== null) {
    const ancestor = snapshot.itemById.get(ancestorId)!;
    const presentationContainer = ancestor.presentationContainer;
    if (presentationContainer !== null) {
      return Object.freeze({
        boundaryId: ancestorId,
        contentLayout: presentationContainer.contentLayout,
        directChildId,
      });
    }

    directChildId = ancestorId;
    ancestorId = snapshot.parentById.get(ancestorId) ?? null;
  }

  return null;
}
