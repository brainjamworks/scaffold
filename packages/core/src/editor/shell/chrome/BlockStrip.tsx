import {
  CaretRightIcon as CaretRight,
  CodeIcon as Code,
  ImageSquareIcon as ImageSquare,
  GraduationCapIcon as GraduationCap,
  ListChecksIcon as ListChecks,
  QuotesIcon as Quotes,
  SquaresFourIcon as SquaresFour,
  TableIcon as Table,
  TextAaIcon as TextAa,
} from "@phosphor-icons/react";
import type { Editor } from "@tiptap/react";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import * as Tooltip from "@/ui/components/Tooltip/Tooltip";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import type { SurfaceVariantLookup } from "@/editor/surfaces/model/surface-variant-registry";
import { insertCatalogItemChecked } from "@/editor/insertion/checked-insertion";
import {
  INSERT_CATEGORY_LABELS,
  INSERT_CATEGORY_ORDER,
  type InsertAction,
  type InsertCategory,
} from "@/editor/insertion/insert-action";
import { EditorFloatingPopover as EditorFloating } from "@/editor/interactions/floating/EditorFloatingPopover";
import {
  canInsertCatalogItem,
  getInsertableCatalogItems,
} from "@/editor/suggestions/insert/insert-availability";
import { iconMd } from "@/ui/tokens/icon-sizes";
import "./editor-rail-chrome.css";

interface BlockStripProps {
  blockDefinitions: BlockDefinitionLookup;
  editor: Editor;
  items: readonly InsertAction[];
  surfaceVariants: SurfaceVariantLookup;
}

interface CategoryDescriptor {
  id: InsertCategory;
  label: string;
  icon: typeof GraduationCap;
}

const CATEGORY_ICONS = {
  content: TextAa,
  display: Quotes,
  media: ImageSquare,
  data: Table,
  assessment: GraduationCap,
  activity: ListChecks,
  embed: Code,
  layout: SquaresFour,
} satisfies Record<InsertCategory, typeof GraduationCap>;

const CATEGORIES: CategoryDescriptor[] = INSERT_CATEGORY_ORDER.map((id) => ({
  id,
  label: INSERT_CATEGORY_LABELS[id],
  icon: CATEGORY_ICONS[id],
}));

function categoryPanelLabel(category: CategoryDescriptor) {
  return category.id === "layout" ? category.label : `${category.label} blocks`;
}

function variantPanelLabel(title: string) {
  return `${title} variants`;
}

function blockRowDomId(itemId: string): string {
  return `block-strip-item-${itemId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

/**
 * Vertical block-insertion strip. Lives in the editor gutter, complements
 * (does not replace) the slash-command and per-line gutter "+" affordances
 * for inline insertion.
 *
 * Renders as a single pill column matching the top toolbar's vocabulary:
 * rounded-full container, hairline border, flat at rest, hover/active
 * states using the design system's `--color-muted` and
 * `--color-primary-muted` tokens.
 *
 * Each category opens a popover anchored to its right listing catalog items
 * available in that category. The authoring composition root supplies the
 * built-in actions; callers can instead supply a restricted action view.
 * Clicking a block delegates to `insertCatalogItemChecked` — the same checked
 * insertion path used by slash commands, so insertion semantics stay
 * identical.
 *
 * Brand metaphor: the strip's vertical block-stack composition echoes the
 * block-slot mark itself — three filled tiles waiting on the next slot.
 */
export function BlockStrip({ blockDefinitions, editor, items, surfaceVariants }: BlockStripProps) {
  const [openCategory, setOpenCategory] = useState<InsertCategory | null>(null);
  const restoreEditorFocusAfterInsertRef = useRef(false);

  const catalogItems = items;
  const insertableItems = getInsertableCatalogItems(editor, catalogItems);
  const insertableItemIds = new Set(insertableItems.map((item) => item.id));

  const handleInsert = (item: InsertAction) => {
    if (!canInsertCatalogItem(editor, item)) return;
    if (insertCatalogItemChecked(editor, item, blockDefinitions, surfaceVariants)) {
      restoreEditorFocusAfterInsertRef.current = true;
      setOpenCategory(null);
    }
  };

  const handleCategoryCloseAutoFocus = (event: Event) => {
    if (!restoreEditorFocusAfterInsertRef.current) return;

    event.preventDefault();
    restoreEditorFocusAfterInsertRef.current = false;
    editor.commands.focus();
  };

  return (
    <Tooltip.Provider delayDuration={350}>
      <aside
        data-insert-strip=""
        aria-label="Insert block"
        onKeyDown={handleCategoryTriggerListKeyDown}
        className="sc-editor-rail-panel sc-block-strip"
      >
        {CATEGORIES.map((category) => {
          const items = catalogItems.filter((item) => item.category === category.id);
          if (items.length === 0) return null;
          const rootItems = items.filter((item) => !item.variantOf);
          const variantsByParentId = new Map<string, InsertAction[]>();
          for (const item of items) {
            if (!item.variantOf) continue;
            const variants = variantsByParentId.get(item.variantOf) ?? [];
            variants.push(item);
            variantsByParentId.set(item.variantOf, variants);
          }
          const Icon = category.icon;
          const isOpen = openCategory === category.id;

          return (
            <EditorFloating.Root
              key={category.id}
              open={isOpen}
              onOpenChange={(next) => setOpenCategory(next ? category.id : null)}
            >
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <EditorFloating.Trigger asChild>
                    <button
                      type="button"
                      aria-label={category.label}
                      aria-pressed={isOpen}
                      data-block-strip-category-trigger=""
                      className="sc-editor-rail-button"
                    >
                      <Icon size={iconMd} weight="bold" />
                    </button>
                  </EditorFloating.Trigger>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content side="right" sideOffset={10}>
                    {category.label}
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>

              <EditorFloating.Portal>
                <EditorFloating.Content
                  side="right"
                  sideOffset={10}
                  align="start"
                  aria-label={categoryPanelLabel(category)}
                  authoringChrome
                  onCloseAutoFocus={handleCategoryCloseAutoFocus}
                  className="sc-block-strip-popover"
                >
                  <div className="sc-block-strip-popover-header">
                    <CategoryHeader label={category.label} count={items.length} />
                  </div>
                  <div className="sc-block-strip-list-frame">
                    <div
                      aria-hidden="true"
                      className="sc-block-strip-list-shadow"
                      data-edge="top"
                    />
                    <ul
                      role="list"
                      aria-label={categoryPanelLabel(category)}
                      className="sc-block-strip-list"
                      onKeyDown={handleBlockRowListKeyDown}
                    >
                      {rootItems.map((item) => (
                        <li key={item.id}>
                          <CatalogItemRow
                            item={item}
                            disabled={!insertableItemIds.has(item.id)}
                            variants={variantsByParentId.get(item.id) ?? []}
                            insertableItemIds={insertableItemIds}
                            onSelect={handleInsert}
                          />
                        </li>
                      ))}
                    </ul>
                    <div
                      aria-hidden="true"
                      className="sc-block-strip-list-shadow"
                      data-edge="bottom"
                    />
                  </div>
                </EditorFloating.Content>
              </EditorFloating.Portal>
            </EditorFloating.Root>
          );
        })}
      </aside>
    </Tooltip.Provider>
  );
}

function CategoryHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="sc-block-strip-header">
      <span>{label}</span>
      <span className="sc-block-strip-header-count">{count}</span>
    </div>
  );
}

function BlockRow({
  disabled,
  endAdornment,
  item,
  onSelect,
  onFocus,
  onKeyDown,
  onPointerEnter,
}: {
  disabled?: boolean | undefined;
  endAdornment?: ReactNode;
  item: InsertAction;
  onFocus?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onPointerEnter?: () => void;
  onSelect: () => void;
}): ReactNode {
  const Icon = item.icon;
  const rowId = blockRowDomId(item.id);
  const descriptionId = `${rowId}-description`;
  const disabledReasonId = `${rowId}-disabled-reason`;
  const describedBy = [descriptionId, disabled ? disabledReasonId : undefined]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={endAdornment ? `${item.title}, opens variants` : item.title}
      aria-describedby={describedBy}
      aria-haspopup={endAdornment ? "dialog" : undefined}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      onClick={onSelect}
      onPointerEnter={onPointerEnter}
      className="sc-block-strip-row"
    >
      <span className="sc-block-strip-row-icon">
        <Icon size={iconMd} aria-hidden="true" />
      </span>
      <span className="sc-block-strip-row-content">
        <span className="sc-block-strip-row-title">{item.title}</span>
        <span id={descriptionId} className="sc-block-strip-row-description">
          {item.description}
        </span>
        {disabled ? (
          <span id={disabledReasonId} className="sc-editor-rail-visually-hidden">
            Cannot insert this block here.
          </span>
        ) : null}
      </span>
      {endAdornment}
    </button>
  );
}

function CatalogItemRow({
  disabled,
  insertableItemIds,
  item,
  onSelect,
  variants,
}: {
  disabled?: boolean | undefined;
  insertableItemIds: Set<string>;
  item: InsertAction;
  onSelect: (item: InsertAction) => void;
  variants: InsertAction[];
}): ReactNode {
  if (variants.length === 0) {
    return <BlockRow item={item} disabled={disabled} onSelect={() => onSelect(item)} />;
  }

  return (
    <DrillInBlockRow
      item={item}
      disabled={disabled}
      variants={variants}
      insertableItemIds={insertableItemIds}
      onSelect={onSelect}
    />
  );
}

function DrillInBlockRow({
  disabled,
  insertableItemIds,
  item,
  onSelect,
  variants,
}: {
  disabled?: boolean | undefined;
  insertableItemIds: Set<string>;
  item: InsertAction;
  onSelect: (item: InsertAction) => void;
  variants: InsertAction[];
}): ReactNode {
  const [open, setOpen] = useState(false);

  return (
    <EditorFloating.Root open={open} onOpenChange={setOpen}>
      <EditorFloating.Anchor asChild>
        <div onPointerLeave={() => setOpen(false)}>
          <BlockRow
            item={item}
            disabled={disabled}
            onSelect={() => onSelect(item)}
            onFocus={() => setOpen(true)}
            onPointerEnter={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") {
                event.preventDefault();
                setOpen(true);
              }
            }}
            endAdornment={
              <CaretRight size={14} className="sc-block-strip-row-chevron" aria-hidden="true" />
            }
          />
        </div>
      </EditorFloating.Anchor>
      <EditorFloating.Portal>
        <EditorFloating.Content
          side="right"
          sideOffset={8}
          align="start"
          aria-label={variantPanelLabel(item.title)}
          authoringChrome
          onPointerEnter={() => setOpen(true)}
          onPointerLeave={() => setOpen(false)}
          onFocusCapture={() => setOpen(true)}
          className="sc-block-strip-variant-popover"
        >
          <div className="sc-block-strip-variant-header">
            <CategoryHeader label={`${item.title} type`} count={variants.length} />
          </div>
          <ul
            role="list"
            aria-label={variantPanelLabel(item.title)}
            className="sc-block-strip-variant-list"
            onKeyDown={handleBlockRowListKeyDown}
          >
            {variants.map((variant) => (
              <li key={variant.id}>
                <BlockRow
                  item={variant}
                  disabled={!insertableItemIds.has(variant.id)}
                  onSelect={() => {
                    onSelect(variant);
                    setOpen(false);
                  }}
                />
              </li>
            ))}
          </ul>
        </EditorFloating.Content>
      </EditorFloating.Portal>
    </EditorFloating.Root>
  );
}

function handleBlockRowListKeyDown(event: KeyboardEvent<HTMLUListElement>): void {
  if (
    event.key !== "ArrowDown" &&
    event.key !== "ArrowUp" &&
    event.key !== "Home" &&
    event.key !== "End"
  ) {
    return;
  }

  if (!(event.target instanceof HTMLButtonElement)) return;

  const buttons = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
  );
  if (buttons.length === 0) return;

  const currentIndex = buttons.indexOf(event.target);
  if (currentIndex < 0) return;

  event.preventDefault();

  const nextIndex =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : event.key === "ArrowDown"
          ? (currentIndex + 1) % buttons.length
          : (currentIndex + buttons.length - 1) % buttons.length;

  buttons[nextIndex]?.focus();
}

function handleCategoryTriggerListKeyDown(event: KeyboardEvent<HTMLElement>): void {
  if (
    event.key !== "ArrowDown" &&
    event.key !== "ArrowUp" &&
    event.key !== "Home" &&
    event.key !== "End"
  ) {
    return;
  }

  if (!(event.target instanceof HTMLButtonElement)) return;
  if (!event.target.hasAttribute("data-block-strip-category-trigger")) return;

  const buttons = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-block-strip-category-trigger]"),
  );
  if (buttons.length === 0) return;

  const currentIndex = buttons.indexOf(event.target);
  if (currentIndex < 0) return;

  event.preventDefault();

  const nextIndex =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : event.key === "ArrowDown"
          ? (currentIndex + 1) % buttons.length
          : (currentIndex + buttons.length - 1) % buttons.length;

  buttons[nextIndex]?.focus();
}
