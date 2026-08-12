import type { SemanticHierarchyViewController } from "@/document/authoring/semantic-document";
import type { SemanticDocumentSnapshot, SemanticItem } from "@/document/model/semantic-document";

import {
  SemanticSubtreeOutline,
  type DocumentOutlineAuthoringPort,
  type DocumentOutlineRowViewport,
  type SemanticSubtreeOutlineProps,
} from "../SemanticSubtreeOutline";

const EMPTY_ITEMS: readonly SemanticItem[] = [];

export function SurfaceStructure({
  authoring,
  controller,
  item,
  viewController,
  viewport,
}: {
  readonly authoring?: DocumentOutlineAuthoringPort;
  readonly controller: SemanticSubtreeOutlineProps["controller"];
  readonly item: SemanticItem;
  readonly viewController: SemanticHierarchyViewController;
  readonly viewport: DocumentOutlineRowViewport;
}) {
  const selectSurfaceChildren = (snapshot: SemanticDocumentSnapshot) =>
    snapshot.itemById.get(item.id)?.children ?? EMPTY_ITEMS;
  return (
    <div className="sc-surface-structure-view">
      <h2 className="sc-surface-structure-title" title={item.label}>
        {item.label}
      </h2>
      <SemanticSubtreeOutline
        ariaLabel={`${item.label} structure`}
        {...(authoring ? { authoring } : {})}
        controller={controller}
        selectRoots={selectSurfaceChildren}
        viewController={viewController}
        viewport={viewport}
      />
    </div>
  );
}
