import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { SemanticItem } from "@/document/model/semantic-document";
import { useLayoutEffect, useRef, type RefObject } from "react";
import type { CourseOutlineSurfaceDragProjection } from "../CourseOutlineSurfaceDragSession";

import { CourseSectionGroup } from "./CourseSectionGroup";

export function CourseOverview({
  expandedSectionIds,
  roots,
  surfaceDragProjection,
  selectedId,
  selectedSurfaceId,
  registerSectionControl,
  registerSurfaceControl,
  onSelectSection,
  onSelectSurface,
  onShowSurfaceStructure,
  canDragSurface,
  movementAvailable,
  onSectionExpandedChange,
  onDeleteSection,
  onDeleteSurface,
  onDuplicateSection,
  onDuplicateSurface,
  onRenameSection,
  onRenameSurface,
  onSurfaceSettings,
  registerSectionActionControl,
}: {
  readonly expandedSectionIds: ReadonlySet<EmbeddedNodeId>;
  readonly roots: readonly SemanticItem[];
  readonly surfaceDragProjection: CourseOutlineSurfaceDragProjection | null;
  readonly selectedId: string | null;
  readonly selectedSurfaceId: string | null;
  readonly registerSectionControl: (
    sectionId: EmbeddedNodeId,
    element: HTMLButtonElement | null,
  ) => void;
  readonly registerSurfaceControl: (surfaceId: string, element: HTMLButtonElement | null) => void;
  readonly onSelectSection: (item: SemanticItem) => void;
  readonly onSelectSurface: (item: SemanticItem) => void;
  readonly onShowSurfaceStructure: (item: SemanticItem) => void;
  readonly canDragSurface: (item: SemanticItem) => boolean;
  readonly movementAvailable: boolean;
  readonly onSectionExpandedChange: (sectionId: EmbeddedNodeId, expanded: boolean) => void;
  readonly onDeleteSection: (item: SemanticItem) => void;
  readonly onDeleteSurface: (item: SemanticItem) => void;
  readonly onDuplicateSection: (item: SemanticItem) => void;
  readonly onDuplicateSurface: (item: SemanticItem) => void;
  readonly onRenameSection: (item: SemanticItem) => void;
  readonly onRenameSurface: (item: SemanticItem, value: string) => boolean;
  readonly onSurfaceSettings: (item: SemanticItem) => void;
  readonly registerSectionActionControl: (
    sectionId: string,
    element: HTMLButtonElement | null,
  ) => void;
}) {
  const overviewRef = useRef<HTMLDivElement>(null);
  useCourseOutlineReorderMotion(overviewRef, roots, surfaceDragProjection);
  return (
    <div ref={overviewRef} className="sc-course-overview" aria-label="Course overview">
      {roots
        .filter((item) => item.kind === "course-section")
        .map((section) => (
          <CourseSectionGroup
            key={section.id}
            expanded={expandedSectionIds.has(section.id)}
            item={section}
            surfaceDragProjection={surfaceDragProjection}
            selected={section.id === selectedId}
            selectedSurfaceId={selectedSurfaceId}
            registerSelectionControl={(element) => registerSectionControl(section.id, element)}
            registerSurfaceControl={registerSurfaceControl}
            onSelect={onSelectSection}
            onSelectSurface={onSelectSurface}
            onShowSurfaceStructure={onShowSurfaceStructure}
            canDragSurface={canDragSurface}
            movementAvailable={movementAvailable}
            onExpandedChange={(expanded) => onSectionExpandedChange(section.id, expanded)}
            onDeleteSection={onDeleteSection}
            onDeleteSurface={onDeleteSurface}
            onDuplicateSection={onDuplicateSection}
            onDuplicateSurface={onDuplicateSurface}
            onRenameSection={onRenameSection}
            onRenameSurface={onRenameSurface}
            onSurfaceSettings={onSurfaceSettings}
            registerSectionActionControl={registerSectionActionControl}
          />
        ))}
    </div>
  );
}

interface OutlineMotion {
  readonly animation: Animation;
  readonly element: HTMLElement;
}

function useCourseOutlineReorderMotion(
  rootRef: RefObject<HTMLDivElement | null>,
  roots: readonly SemanticItem[],
  projection: CourseOutlineSurfaceDragProjection | null,
): void {
  const targetRectsRef = useRef(new Map<string, DOMRect>());
  const motionRef = useRef(new Map<string, OutlineMotion>());

  useLayoutEffect(() => {
    const root = rootRef.current;
    const ownerWindow = root?.ownerDocument.defaultView;
    if (!root || !ownerWindow) return;
    const reducedMotion =
      ownerWindow.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    const previousRects = targetRectsRef.current;
    const nextRects = new Map<string, DOMRect>();
    const nextMotion = new Map<string, OutlineMotion>();
    const liveKeys = new Set<string>();

    for (const element of root.querySelectorAll<HTMLElement>("[data-course-outline-motion-id]")) {
      const key = element.dataset.courseOutlineMotionId;
      if (!key) continue;
      liveKeys.add(key);
      const existing = motionRef.current.get(key);
      const presentationRect = element.getBoundingClientRect();
      existing?.animation.cancel();
      const targetRect = element.getBoundingClientRect();
      nextRects.set(key, targetRect);
      const fromRect = existing?.element === element ? presentationRect : previousRects.get(key);
      if (
        reducedMotion ||
        !fromRect ||
        element.hasAttribute("data-course-outline-projected-source")
      ) {
        continue;
      }
      const x = fromRect.left - targetRect.left;
      const y = fromRect.top - targetRect.top;
      if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) continue;
      const animation = element.animate(
        [{ transform: `translate3d(${x}px, ${y}px, 0)` }, { transform: "translate3d(0, 0, 0)" }],
        { duration: 180, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "both" },
      );
      nextMotion.set(key, { animation, element });
    }

    for (const [key, motion] of motionRef.current) {
      if (!liveKeys.has(key)) motion.animation.cancel();
    }
    targetRectsRef.current = nextRects;
    motionRef.current = nextMotion;
  }, [projection, rootRef, roots]);

  useLayoutEffect(
    () => () => {
      for (const motion of motionRef.current.values()) motion.animation.cancel();
      motionRef.current.clear();
    },
    [],
  );
}
