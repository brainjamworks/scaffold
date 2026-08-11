import { DotsThreeVerticalIcon as DotsThreeVertical } from "@phosphor-icons/react";

import type { SemanticItem } from "@/document/model/semantic-document";
import * as DropdownMenu from "@/ui/components/DropdownMenu/DropdownMenu";
import { iconXs } from "@/ui/tokens/icon-sizes";
import { zIndex } from "@/ui/overlays/z-index";

export function DocumentOutlineRowActions({
  item,
  triggerRef,
  triggerTabIndex = -1,
  onDuplicateSection,
  onEditSectionTitle,
  onDeleteSection,
}: {
  readonly item: SemanticItem;
  readonly triggerRef?: (element: HTMLButtonElement | null) => void;
  readonly triggerTabIndex?: number;
  readonly onDuplicateSection: (item: SemanticItem) => void;
  readonly onEditSectionTitle: (item: SemanticItem) => void;
  readonly onDeleteSection: (item: SemanticItem) => void;
}) {
  if (item.kind !== "course-section") return null;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          ref={triggerRef}
          aria-label={`More actions for ${item.label}`}
          className="sc-document-outline-actions-trigger"
          tabIndex={triggerTabIndex}
          type="button"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <DotsThreeVertical aria-hidden size={iconXs} weight="bold" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          className="sc-document-outline-actions-menu"
          sideOffset={4}
          style={{ zIndex: zIndex.dropdown }}
        >
          <>
              <DropdownMenu.Item
                className="sc-document-outline-actions-item"
                onSelect={() => onEditSectionTitle(item)}
              >
                Edit Course Section title
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="sc-document-outline-actions-item"
                onSelect={() => onDuplicateSection(item)}
              >
                Duplicate Course Section
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="sc-document-outline-actions-item sc-document-outline-actions-item--danger"
                onSelect={() => onDeleteSection(item)}
              >
                Delete Course Section
              </DropdownMenu.Item>
          </>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
