import type { SemanticHierarchyViewController } from "@/document/authoring/semantic-document";
import type { SemanticDocumentSnapshot, SemanticItem } from "@/document/model/semantic-document";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react";
import { Button } from "@/ui/components/Button/Button";
import { iconSm } from "@/ui/tokens/icon-sizes";

import {
  SemanticSubtreeOutline,
  type DocumentOutlineAuthoringPort,
  type DocumentOutlineRowViewport,
  type SemanticSubtreeOutlineProps,
} from "../SemanticSubtreeOutline";

const EMPTY_ITEMS: readonly SemanticItem[] = [];

export function SurfaceStructureView({
  authoring,
  controller,
  item,
  viewController,
  viewport,
  onBack,
}: {
  readonly authoring?: DocumentOutlineAuthoringPort;
  readonly controller: SemanticSubtreeOutlineProps["controller"];
  readonly item: SemanticItem;
  readonly viewController: SemanticHierarchyViewController;
  readonly viewport: DocumentOutlineRowViewport;
  readonly onBack: () => void;
}) {
  const selectSurfaceChildren = (snapshot: SemanticDocumentSnapshot) =>
    snapshot.itemById.get(item.id)?.children ?? EMPTY_ITEMS;
  return (
    <div className="sc-surface-structure-view">
      <header className="sc-surface-structure-header">
        <Button
          aria-label="Back to Course overview"
          className="sc-surface-structure-back"
          size="sm"
          type="button"
          variant="ghost"
          onClick={onBack}
        >
          <ArrowLeft aria-hidden size={iconSm} />
          Course overview
        </Button>
        <h3 title={item.label}>{item.label}</h3>
      </header>
      <SemanticSubtreeOutline
        ariaLabel={`${item.label} structure`}
        authoring={authoring}
        controller={controller}
        selectRoots={selectSurfaceChildren}
        viewController={viewController}
        viewport={viewport}
      />
    </div>
  );
}
