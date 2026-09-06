import type { DocumentTreeViewController } from "@/document/authoring/document-tree";
import type { DocumentTreeSnapshot, DocumentTreeItem } from "@/document/model/document-tree";

import {
  DocumentTreeSubtreeOutline,
  type DocumentOutlineAuthoringPort,
  type DocumentOutlineRowViewport,
  type DocumentTreeSubtreeOutlineProps,
} from "../DocumentTreeSubtreeOutline";

const EMPTY_ITEMS: readonly DocumentTreeItem[] = [];

export function SurfaceStructure({
  authoring,
  tree,
  navigation,
  item,
  viewController,
  viewport,
}: {
  readonly authoring?: DocumentOutlineAuthoringPort;
  readonly tree: DocumentTreeSubtreeOutlineProps["tree"];
  readonly navigation: DocumentTreeSubtreeOutlineProps["navigation"];
  readonly item: DocumentTreeItem;
  readonly viewController: DocumentTreeViewController;
  readonly viewport: DocumentOutlineRowViewport;
}) {
  const selectSurfaceChildren = (snapshot: DocumentTreeSnapshot) =>
    snapshot.itemById.get(item.id)?.children ?? EMPTY_ITEMS;
  return (
    <div className="sc-surface-structure-view">
      <h2 className="sc-surface-structure-title" title={item.label}>
        {item.label}
      </h2>
      <DocumentTreeSubtreeOutline
        ariaLabel={`${item.label} structure`}
        {...(authoring ? { authoring } : {})}
        navigation={navigation}
        tree={tree}
        selectRoots={selectSurfaceChildren}
        viewController={viewController}
        viewport={viewport}
      />
    </div>
  );
}
