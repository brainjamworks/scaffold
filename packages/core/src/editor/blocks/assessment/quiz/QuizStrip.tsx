import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLineLeftIcon as ArrowLineLeft,
  ArrowLineRightIcon as ArrowLineRight,
  CaretDownIcon as CaretDown,
  DotsSixVerticalIcon as DotsSixVertical,
  PlusIcon as Plus,
} from "@phosphor-icons/react";
import { useState, type CSSProperties } from "react";

import * as DropdownMenu from "@/ui/components/DropdownMenu/DropdownMenu";
import { BlockAddGhost } from "@/editor/suggestions/insert/BlockAddGhost";
import { EditorFloatingPopover as EditorFloating } from "@/editor/interactions/floating/EditorFloatingPopover";
import type { InsertAction } from "@/editor/insertion/insert-action";
import { zIndex } from "@/ui/overlays/z-index";

import { questionTypeTag } from "./question-type-tags";

/**
 * Sortable horizontal strip of question pills + a "+ Add" picker.
 * Drag-and-drop is wired through dnd-kit (`useSortable`) so reorder
 * snaps before commit; on drop we walk the controller's adjacent
 * `moveQuestion('up' | 'down')` step-by-step until the from→to swap
 * lands. The controller's API stays small (no `moveTo(index)`).
 */
export function QuizStrip({
  activeChildKey,
  childKeys,
  childTypes,
  items,
  onAdd,
  onMove,
  onSelect,
}: {
  activeChildKey: string | null;
  childKeys: string[];
  childTypes: string[];
  items: readonly InsertAction[];
  onAdd: (item: InsertAction) => void;
  onMove: (childKey: string, index: number, direction: "up" | "down") => void;
  onSelect: (childKey: string) => void;
}) {
  // Drag has to traverse a small distance before the click handler on
  // the pill stops winning — otherwise tapping to switch questions
  // would also try to drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || activeId === overId) return;
    const fromIndex = childKeys.indexOf(activeId);
    const toIndex = childKeys.indexOf(overId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
    const direction = toIndex < fromIndex ? "up" : "down";
    const step = direction === "up" ? -1 : 1;
    let current = fromIndex;
    while (current !== toIndex) {
      onMove(activeId, current, direction);
      current += step;
    }
  };

  return (
    <div className="sc-quiz__strip" contentEditable={false} data-testid="quiz-stage-selector">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={childKeys} strategy={horizontalListSortingStrategy}>
          {childKeys.map((childKey, index) => (
            <QuizStripPill
              key={childKey}
              activeChildKey={activeChildKey}
              childKey={childKey}
              index={index}
              total={childKeys.length}
              type={childTypes[index]}
              onMove={onMove}
              onSelect={onSelect}
            />
          ))}
        </SortableContext>
      </DndContext>
      {items.length > 0 ? <QuizStripAdd items={items} onAdd={onAdd} /> : null}
    </div>
  );
}

const quizMenuItemClass = "sc-quiz__strip-menu-item";

function QuizStripPill({
  activeChildKey,
  childKey,
  index,
  total,
  type,
  onMove,
  onSelect,
}: {
  activeChildKey: string | null;
  childKey: string;
  index: number;
  total: number;
  type: string | undefined;
  onMove: (childKey: string, index: number, direction: "up" | "down") => void;
  onSelect: (childKey: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: childKey,
  });
  const isActive = childKey === activeChildKey;

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <DropdownMenu.Root>
      <div
        ref={setNodeRef}
        style={style}
        className="sc-quiz__strip-pill"
        data-active={isActive ? "true" : undefined}
        data-dragging={isDragging ? "true" : undefined}
      >
        <button
          type="button"
          aria-label={`Drag question ${index + 1}`}
          className="sc-quiz__strip-pill-drag"
          {...attributes}
          {...listeners}
        >
          <DotsSixVertical size={14} weight="regular" aria-hidden />
        </button>
        <button
          type="button"
          aria-current={isActive ? "true" : undefined}
          aria-label={`Question ${index + 1}`}
          className="sc-quiz__strip-button"
          onClick={() => onSelect(childKey)}
        >
          <span className="sc-quiz__strip-number">Q{index + 1}</span>
          {type ? <span className="sc-quiz__strip-type">{questionTypeTag(type)}</span> : null}
        </button>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label={`Question ${index + 1} options`}
            className="sc-quiz__strip-pill-kebab"
          >
            <CaretDown size={11} weight="bold" aria-hidden />
          </button>
        </DropdownMenu.Trigger>
      </div>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={4}
          align="end"
          style={{ zIndex: zIndex.dropdown }}
          className="sc-quiz__strip-menu"
        >
          <DropdownMenu.Item
            disabled={index === 0}
            onSelect={() => onMove(childKey, index, "up")}
            className={quizMenuItemClass}
          >
            <ArrowLineLeft size={14} weight="regular" aria-hidden />
            Move earlier
          </DropdownMenu.Item>
          <DropdownMenu.Item
            disabled={index === total - 1}
            onSelect={() => onMove(childKey, index, "down")}
            className={quizMenuItemClass}
          >
            <ArrowLineRight size={14} weight="regular" aria-hidden />
            Move later
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function QuizStripAdd({
  items,
  onAdd,
}: {
  items: readonly InsertAction[];
  onAdd: (item: InsertAction) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <EditorFloating.Root open={open} onOpenChange={setOpen}>
      <EditorFloating.Trigger asChild>
        <BlockAddGhost
          label="Add"
          presentation="pill"
          className="sc-quiz__strip-add"
          icon={<Plus size={12} weight="bold" />}
          data-testid="quiz-strip-add"
        />
      </EditorFloating.Trigger>
      <EditorFloating.Portal>
        <EditorFloating.Content
          sideOffset={6}
          align="start"
          authoringChrome
          className="sc-quiz__add-popover"
        >
          <p className="sc-quiz__add-title">Pick a question type</p>
          <div className="sc-quiz__add-grid">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onAdd(item);
                    setOpen(false);
                  }}
                  className="sc-quiz__add-option"
                >
                  <span aria-hidden className="sc-quiz__add-option-icon">
                    <Icon size={14} weight="regular" />
                  </span>
                  <span className="sc-quiz__add-option-title">{item.title}</span>
                </button>
              );
            })}
          </div>
        </EditorFloating.Content>
      </EditorFloating.Portal>
    </EditorFloating.Root>
  );
}
