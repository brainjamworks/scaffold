import {
  DotsThreeIcon as DotsThree,
  GearIcon as Gear,
  TreeStructureIcon as TreeStructure,
} from "@phosphor-icons/react";

import type { SemanticItem } from "@/document/model/semantic-document";
import * as DropdownMenu from "@/ui/components/DropdownMenu/DropdownMenu";
import { iconSm } from "@/ui/tokens/icon-sizes";
import { zIndex } from "@/ui/overlays/z-index";

export function SurfaceActions({
  item,
  onDelete,
  onDuplicate,
  onRename,
  onSettings,
  onShowStructure,
}: {
  readonly item: SemanticItem;
  readonly onDelete?: (item: SemanticItem) => void;
  readonly onDuplicate?: (item: SemanticItem) => void;
  readonly onRename?: (item: SemanticItem) => void;
  readonly onSettings?: (item: SemanticItem) => void;
  readonly onShowStructure: (item: SemanticItem) => void;
}) {
  const hasMenuActions = Boolean(onRename || onDuplicate || onDelete);
  return (
    <div className="sc-course-surface-actions">
      <button
        aria-label={`Show structure for ${item.label}`}
        className="sc-course-surface-action"
        type="button"
        onClick={() => onShowStructure(item)}
      >
        <TreeStructure aria-hidden size={iconSm} />
        <span>Structure</span>
      </button>
      {onSettings ? (
        <button
          aria-label={`Open settings for ${item.label}`}
          className="sc-course-surface-action"
          type="button"
          onClick={() => onSettings(item)}
        >
          <Gear aria-hidden size={iconSm} />
          <span>Settings</span>
        </button>
      ) : null}
      {hasMenuActions ? (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              aria-label={`More actions for ${item.label}`}
              className="sc-course-surface-action sc-course-surface-action--icon"
              type="button"
            >
              <DotsThree aria-hidden size={iconSm} weight="bold" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              className="sc-document-outline-actions-menu"
              sideOffset={4}
              style={{ zIndex: zIndex.dropdown }}
            >
              {onRename ? (
                <DropdownMenu.Item
                  className="sc-document-outline-actions-item"
                  onSelect={() => onRename(item)}
                >
                  Rename Surface
                </DropdownMenu.Item>
              ) : null}
              {onDuplicate ? (
                <DropdownMenu.Item
                  className="sc-document-outline-actions-item"
                  onSelect={() => onDuplicate(item)}
                >
                  Duplicate Surface
                </DropdownMenu.Item>
              ) : null}
              {onDelete ? (
                <DropdownMenu.Item
                  className="sc-document-outline-actions-item sc-document-outline-actions-item--danger"
                  onSelect={() => onDelete(item)}
                >
                  Delete Surface
                </DropdownMenu.Item>
              ) : null}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      ) : null}
    </div>
  );
}
