import { CaretRightIcon as CaretRight } from "@phosphor-icons/react";
import type { SemanticItem } from "@/document/model/semantic-document";
import { iconXs } from "@/ui/tokens/icon-sizes";

import {
  CourseOutlineSurfaceDropTarget,
  CourseOutlineSurfaceGhost,
  type CourseOutlineSurfaceDragProjection,
} from "../CourseOutlineSurfaceDragSession";
import { DocumentOutlineRowActions } from "../DocumentOutlineRowActions";
import { SurfaceCard } from "./SurfaceCard";

export function CourseSectionGroup({
  expanded,
  item,
  surfaceDragProjection,
  selected,
  selectedSurfaceId,
  registerSelectionControl,
  registerSurfaceControl,
  onSelect,
  onSelectSurface,
  onShowSurfaceStructure,
  canDragSurface,
  movementAvailable,
  onExpandedChange,
  onDeleteSection,
  onDeleteSurface,
  onDuplicateSection,
  onDuplicateSurface,
  onRenameSection,
  onRenameSurface,
  onSurfaceSettings,
  registerSectionActionControl,
}: {
  readonly expanded: boolean;
  readonly item: SemanticItem;
  readonly surfaceDragProjection: CourseOutlineSurfaceDragProjection | null;
  readonly selected: boolean;
  readonly selectedSurfaceId: string | null;
  readonly registerSelectionControl: (element: HTMLButtonElement | null) => void;
  readonly registerSurfaceControl: (surfaceId: string, element: HTMLButtonElement | null) => void;
  readonly onSelect: (item: SemanticItem) => void;
  readonly onSelectSurface: (item: SemanticItem) => void;
  readonly onShowSurfaceStructure: (item: SemanticItem) => void;
  readonly canDragSurface: (item: SemanticItem) => boolean;
  readonly movementAvailable: boolean;
  readonly onExpandedChange: (expanded: boolean) => void;
  readonly onDeleteSection: (item: SemanticItem) => void;
  readonly onDeleteSurface?: (item: SemanticItem) => void;
  readonly onDuplicateSection: (item: SemanticItem) => void;
  readonly onDuplicateSurface?: (item: SemanticItem) => void;
  readonly onRenameSection: (item: SemanticItem) => void;
  readonly onRenameSurface?: (item: SemanticItem, value: string) => boolean;
  readonly onSurfaceSettings?: (item: SemanticItem) => void;
  readonly registerSectionActionControl: (
    sectionId: string,
    element: HTMLButtonElement | null,
  ) => void;
}) {
  const surfaces = item.children.filter((child) => child.kind === "surface");
  const sectionLabelId = `course-section-${item.id}`;
  const sectionSurfacesId = `${sectionLabelId}-surfaces`;
  const destination = surfaceDragProjection?.destination;
  const projectionIntoSection =
    destination &&
    "intoCourseSectionId" in destination &&
    destination.intoCourseSectionId === item.id
      ? destination
      : null;
  const projectionTargetsSurface =
    destination &&
    !("intoCourseSectionId" in destination) &&
    surfaces.some((surface) =>
      "beforeSurfaceId" in destination
        ? destination.beforeSurfaceId === surface.id
        : destination.afterSurfaceId === surface.id,
    );
  const projectionInThisSection = Boolean(projectionIntoSection || projectionTargetsSurface);
  const projectionIntoEmptySection = Boolean(projectionIntoSection && surfaces.length === 0);
  const projectionGhost = surfaceDragProjection ? (
    <div
      key={`projection:${surfaceDragProjection.surfaceId}`}
      className={`sc-course-outline-projection-slot${projectionIntoEmptySection ? " sc-course-outline-projection-slot--empty-section" : ""}`}
      role="listitem"
    >
      <CourseOutlineSurfaceGhost
        label={surfaceDragProjection.label}
        sourceSize={surfaceDragProjection.sourceSize}
        surfaceId={surfaceDragProjection.surfaceId}
        variant="projection"
      />
    </div>
  ) : null;
  return (
    <section aria-label={item.label} className="sc-course-section-group" data-expanded={expanded}>
      <header
        className="sc-course-section-header"
        data-course-outline-motion-id={`section-header:${item.id}`}
        data-selected={selected}
      >
        <h3 aria-label={item.label} className="sc-course-section-title">
          <button
            aria-label={`${expanded ? "Collapse" : "Expand"} ${item.label}`}
            aria-controls={sectionSurfacesId}
            aria-expanded={expanded}
            className="sc-course-section-toggle"
            type="button"
            onClick={() => onExpandedChange(!expanded)}
          >
            <span aria-hidden="true" className="sc-course-section-toggle-icon">
              <CaretRight size={iconXs} weight="bold" />
            </span>
          </button>
          <button
            ref={registerSelectionControl}
            aria-label={`Select Course Section ${item.label}`}
            aria-pressed={selected}
            className="sc-course-section-selection"
            type="button"
            onClick={() => onSelect(item)}
          >
            <span className="sc-course-section-toggle-label">{item.label}</span>
          </button>
        </h3>
        <DocumentOutlineRowActions
          item={item}
          triggerRef={(element) => registerSectionActionControl(item.id, element)}
          triggerTabIndex={0}
          onDeleteSection={onDeleteSection}
          onDuplicateSection={onDuplicateSection}
          onEditSectionTitle={onRenameSection}
        />
      </header>
      {movementAvailable && !expanded ? (
        <CourseOutlineSurfaceDropTarget
          destination={{ intoCourseSectionId: item.id, edge: "end" }}
          label={`Move into ${item.label}`}
          targetId={`card-section-collapsed:${item.id}`}
        />
      ) : null}
      {expanded ? (
        <div
          id={sectionSurfacesId}
          className="sc-course-section-surfaces"
          data-course-outline-has-projection={projectionInThisSection ? "" : undefined}
          role="list"
        >
          {projectionIntoSection?.edge === "start" ? projectionGhost : null}
          {surfaces.flatMap((surface) => {
            const projectBefore =
              destination &&
              "beforeSurfaceId" in destination &&
              destination.beforeSurfaceId === surface.id;
            const projectAfter =
              destination &&
              "afterSurfaceId" in destination &&
              destination.afterSurfaceId === surface.id;
            return [
              projectBefore ? projectionGhost : null,
              <div
                key={surface.id}
                role="listitem"
                data-course-outline-projected-source={
                  destination && surfaceDragProjection?.surfaceId === surface.id ? "" : undefined
                }
                data-course-outline-surface-slot={surface.id}
              >
                {movementAvailable ? (
                  <CourseOutlineSurfaceDropTarget
                    destination={{ beforeSurfaceId: surface.id }}
                    label={`Before ${surface.label}`}
                    targetId={`card-before:${surface.id}`}
                  />
                ) : null}
                <SurfaceCard
                  draggable={canDragSurface(surface)}
                  item={surface}
                  selected={surface.id === selectedSurfaceId}
                  registerSelectionControl={(element) =>
                    registerSurfaceControl(surface.id, element)
                  }
                  onSelect={onSelectSurface}
                  onShowStructure={onShowSurfaceStructure}
                  {...(onDeleteSurface ? { onDelete: onDeleteSurface } : {})}
                  {...(onDuplicateSurface ? { onDuplicate: onDuplicateSurface } : {})}
                  {...(onRenameSurface ? { onRename: onRenameSurface } : {})}
                  {...(onSurfaceSettings ? { onSettings: onSurfaceSettings } : {})}
                />
                {movementAvailable ? (
                  <CourseOutlineSurfaceDropTarget
                    destination={{ afterSurfaceId: surface.id }}
                    label={`After ${surface.label}`}
                    targetId={`card-after:${surface.id}`}
                  />
                ) : null}
              </div>,
              projectAfter ? projectionGhost : null,
            ];
          })}
          {projectionIntoSection?.edge === "end" ? projectionGhost : null}
          {movementAvailable && surfaces.length === 0 ? (
            <CourseOutlineSurfaceDropTarget
              destination={{ intoCourseSectionId: item.id, edge: "end" }}
              label={`Move into ${item.label}`}
              targetId={`card-section:${item.id}`}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
