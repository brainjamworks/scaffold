import type { DocumentTreeItem } from "@/document/model/document-tree";

import { SurfaceCard } from "./SurfaceCard";

export function PageOverview({
  roots,
  selectedSurfaceId,
  registerSurfaceControl,
  onSelectSurface,
  onShowSurfaceStructure,
  onRenameSurface,
  onSurfaceSettings,
}: {
  readonly roots: readonly DocumentTreeItem[];
  readonly selectedSurfaceId: string | null;
  readonly registerSurfaceControl: (surfaceId: string, element: HTMLButtonElement | null) => void;
  readonly onSelectSurface: (item: DocumentTreeItem) => void;
  readonly onShowSurfaceStructure: (item: DocumentTreeItem) => void;
  readonly onRenameSurface?: (item: DocumentTreeItem, value: string) => boolean;
  readonly onSurfaceSettings?: (item: DocumentTreeItem) => void;
}) {
  const surface = roots.length === 1 && roots[0]?.kind === "surface" ? roots[0] : null;
  if (!surface) {
    return (
      <div className="sc-document-outline-empty">
        <p>This document has no outline items yet.</p>
      </div>
    );
  }

  return (
    <div className="sc-document-navigator-overview" aria-label="Page overview">
      <SurfaceCard
        item={surface}
        selected={surface.id === selectedSurfaceId}
        registerSelectionControl={(element) => registerSurfaceControl(surface.id, element)}
        onSelect={onSelectSurface}
        onShowStructure={onShowSurfaceStructure}
        {...(onRenameSurface ? { onRename: onRenameSurface } : {})}
        {...(onSurfaceSettings ? { onSettings: onSurfaceSettings } : {})}
      />
    </div>
  );
}
