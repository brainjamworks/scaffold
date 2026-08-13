import { CaretDownIcon as CaretDown, CheckIcon as Check } from "@phosphor-icons/react";

import type { SurfaceId } from "@/document/model/course-structure";
import * as DropdownMenu from "@/ui/components/DropdownMenu/DropdownMenu";
import { zIndex } from "@/ui/overlays/z-index";
import { iconSm } from "@/ui/tokens/icon-sizes";

import type {
  CourseSectionNavigationItem,
  CurrentCourseSectionNavigation,
} from "./slideshow-navigation";

export interface CourseSectionNavigationProps {
  readonly currentCourseSection: CurrentCourseSectionNavigation | null;
  readonly courseSectionItems: readonly CourseSectionNavigationItem[];
  readonly onSelectSurface: (surfaceId: SurfaceId) => void;
}

export function CourseSectionNavigation({
  currentCourseSection,
  courseSectionItems,
  onSelectSurface,
}: CourseSectionNavigationProps) {
  if (courseSectionItems.length === 0) return null;
  const triggerLabel = currentCourseSection
    ? courseSectionLabel(currentCourseSection)
    : "Course Sections, no slides";

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="sc-slideshow-player__course-section-trigger"
          aria-label={triggerLabel}
        >
          <span className="sc-slideshow-player__course-section-title">
            {currentCourseSection?.title ?? "Course Sections"}
          </span>
          <span className="sc-slideshow-player__course-section-position">
            {currentCourseSection
              ? `${currentCourseSection.number} of ${currentCourseSection.count}`
              : "No slides"}
          </span>
          <CaretDown size={iconSm} weight="bold" aria-hidden />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="center"
          aria-label="Course Sections"
          className="sc-slideshow-player__course-section-menu"
          side="top"
          sideOffset={8}
          style={{ zIndex: zIndex.dropdown }}
        >
          <DropdownMenu.Label className="sc-slideshow-player__course-section-menu-label">
            Course Sections
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={currentCourseSection?.id ?? ""}>
            {courseSectionItems.map((item) => {
              const isEmpty = item.firstSurfaceId === null;
              return (
                <DropdownMenu.RadioItem
                  key={item.id}
                  value={item.id}
                  aria-disabled={isEmpty}
                  aria-label={courseSectionLabel(item, isEmpty)}
                  className="sc-slideshow-player__course-section-menu-item"
                  onSelect={(event) => {
                    if (item.firstSurfaceId === null) {
                      event.preventDefault();
                      return;
                    }
                    onSelectSurface(item.firstSurfaceId);
                  }}
                >
                  <span className="sc-slideshow-player__course-section-menu-title">
                    {item.title}
                  </span>
                  <span className="sc-slideshow-player__course-section-menu-position">
                    Course Section {item.number} of {item.count}
                    {isEmpty ? " · No slides" : ""}
                  </span>
                  <DropdownMenu.ItemIndicator className="sc-slideshow-player__course-section-menu-indicator">
                    <Check size={iconSm} weight="bold" aria-hidden />
                  </DropdownMenu.ItemIndicator>
                </DropdownMenu.RadioItem>
              );
            })}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function courseSectionLabel(
  item: {
    readonly title: string;
    readonly number: number;
    readonly count: number;
  },
  noSlides = false,
) {
  return `${item.title}, Course Section ${item.number} of ${item.count}${noSlides ? ", no slides" : ""}`;
}
