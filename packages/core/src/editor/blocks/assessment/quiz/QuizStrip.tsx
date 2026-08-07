import {
  ArrowLineLeftIcon as ArrowLineLeft,
  ArrowLineRightIcon as ArrowLineRight,
  CaretDownIcon as CaretDown,
  DotsSixVerticalIcon as DotsSixVertical,
  PlusIcon as Plus,
} from "@phosphor-icons/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useId, useState } from "react";

import { EditorFloatingPopover as EditorFloating } from "@/editor/interactions/floating/EditorFloatingPopover";
import type { InteractionDragEvent } from "@/editor/interactions/drag/model/interaction-drag-event";
import { InteractionDragActivationArea } from "@/editor/interactions/drag/react/InteractionDragActivationArea";
import { InteractionDragSession } from "@/editor/interactions/drag/react/InteractionDragSession";
import { useInteractionSortable } from "@/editor/interactions/drag/react/use-interaction-sortable";
import type { InsertAction } from "@/editor/insertion/insert-action";
import { CourseThemePortalBoundary } from "@/theme/course/CourseThemeProvider";
import { useOverlayBoundary } from "@/ui/overlays/portal-host-context";
import { zIndex } from "@/ui/overlays/z-index";

import { questionTypeTag } from "./question-type-tags";

/**
 * Sortable horizontal strip of question pills + a "+ Add" picker.
 * The shared drag session owns pointer/keyboard mechanics and presentation.
 * A completed drop is committed through the controller's stable-ID reorder
 * operation. Menu alternatives retain the adjacent movement operation.
 */
export function QuizStrip({
  activeChildKey,
  childKeys,
  childTypes,
  items,
  onAdd,
  onMove,
  onReorder,
  onSelect,
}: {
  activeChildKey: string | null;
  childKeys: string[];
  childTypes: string[];
  items: readonly InsertAction[];
  onAdd: (item: InsertAction) => void;
  onMove: (childKey: string, index: number, direction: "up" | "down") => void;
  onReorder: (sourceKey: string, targetKey: string) => void;
  onSelect: (childKey: string) => void;
}) {
  const sessionId = useId();
  const handleDragEnd = (event: InteractionDragEvent<QuizStripDragData, QuizStripDragData>) => {
    const targetIndex = event.active.sortable?.index ?? -1;
    const targetKey = childKeys[targetIndex] ?? null;
    const sourceKey = event.active.data.childKey;
    if (!targetKey || targetKey === sourceKey) return;
    onReorder(sourceKey, targetKey);
  };

  return (
    <InteractionDragSession<QuizStripDragData, QuizStripDragData>
      accessibilityMode="sortable"
      collisionPolicy="closest-center"
      labels={{
        draggable: "Quiz question",
        instructions: "Use the left and right arrow keys to reorder the question.",
      }}
      onEnd={handleDragEnd}
      profile="sortable-horizontal"
      renderPreview={(active) => <QuizStripPreview data={active} />}
      sessionId={`quiz-strip-${sessionId}`}
    >
      <div
        className="sc-course-quiz__strip"
        contentEditable={false}
        data-testid="quiz-stage-selector"
      >
        <div className="sc-course-quiz__strip-sortable-items">
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
        </div>
        {items.length > 0 ? <QuizStripAdd items={items} onAdd={onAdd} /> : null}
      </div>
    </InteractionDragSession>
  );
}

const quizMenuItemClass = "sc-course-quiz__strip-menu-item";

interface QuizStripDragData {
  readonly childKey: string;
  readonly index: number;
  readonly type: string | undefined;
}

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
  const overlayBoundary = useOverlayBoundary();
  const sortable = useInteractionSortable<QuizStripDragData>({
    data: { childKey, index, type },
    id: childKey,
    index,
    label: `Drag question ${index + 1}`,
  });
  const isActive = childKey === activeChildKey;

  return (
    <DropdownMenu.Root>
      <div
        data-interaction-drag-placeholder={sortable.isPlaceholder ? "" : undefined}
        ref={sortable.sourceRef}
        className="sc-course-quiz__strip-pill"
        data-active={isActive ? "true" : undefined}
        data-dragging={sortable.isDragging ? "true" : undefined}
        data-quiz-question-id={childKey}
      >
        <InteractionDragActivationArea
          ref={sortable.handleRef}
          aria-label={`Drag question ${index + 1}`}
          className="sc-course-quiz__strip-pill-drag"
          data-quiz-strip-drag-handle=""
          safeLocalHeight={44}
          safeLocalWidth={44}
        >
          <DotsSixVertical size={14} weight="regular" aria-hidden />
        </InteractionDragActivationArea>
        <button
          type="button"
          aria-current={isActive ? "true" : undefined}
          aria-label={`Question ${index + 1}`}
          className="sc-course-quiz__strip-button"
          onClick={() => onSelect(childKey)}
        >
          <span className="sc-course-quiz__strip-number">Q{index + 1}</span>
          {type ? (
            <span className="sc-course-quiz__strip-type">{questionTypeTag(type)}</span>
          ) : null}
        </button>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label={`Question ${index + 1} options`}
            className="sc-course-quiz__strip-pill-kebab"
          >
            <CaretDown size={11} weight="bold" aria-hidden />
          </button>
        </DropdownMenu.Trigger>
      </div>
      {overlayBoundary.status === "pending" ? null : (
        <DropdownMenu.Portal
          container={
            overlayBoundary.status === "ready" ? overlayBoundary.environment.host : undefined
          }
        >
          <CourseThemePortalBoundary>
            <DropdownMenu.Content
              {...(overlayBoundary.status === "ready"
                ? { collisionBoundary: overlayBoundary.environment.collisionBoundary }
                : {})}
              sideOffset={4}
              align="end"
              style={{ zIndex: zIndex.dropdown }}
              className="sc-course-quiz__strip-menu"
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
          </CourseThemePortalBoundary>
        </DropdownMenu.Portal>
      )}
    </DropdownMenu.Root>
  );
}

function QuizStripPreview({ data }: { data: QuizStripDragData }) {
  return (
    <div
      className="sc-course-quiz__strip-pill sc-course-quiz__strip-pill--preview"
      data-quiz-strip-preview={data.childKey}
    >
      <span className="sc-course-quiz__strip-pill-drag" aria-hidden>
        <DotsSixVertical size={14} weight="regular" />
      </span>
      <span className="sc-course-quiz__strip-button">
        <span className="sc-course-quiz__strip-number">Q{data.index + 1}</span>
        {data.type ? (
          <span className="sc-course-quiz__strip-type">{questionTypeTag(data.type)}</span>
        ) : null}
      </span>
      <span className="sc-course-quiz__strip-pill-kebab" aria-hidden>
        <CaretDown size={11} weight="bold" />
      </span>
    </div>
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
        <button
          type="button"
          className="sc-course-quiz__strip-add"
          aria-label="Add question"
          data-testid="quiz-strip-add"
        >
          <span className="sc-course-quiz__strip-add-icon" aria-hidden>
            <Plus size={12} weight="bold" />
          </span>
          <span>Add question</span>
        </button>
      </EditorFloating.Trigger>
      <EditorFloating.Portal>
        <CourseThemePortalBoundary>
          <EditorFloating.Content
            sideOffset={6}
            align="start"
            authoringChrome
            className="sc-course-quiz__add-popover"
          >
            <p className="sc-course-quiz__add-title">Pick a question type</p>
            <div className="sc-course-quiz__add-grid">
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
                    className="sc-course-quiz__add-option"
                  >
                    <span aria-hidden className="sc-course-quiz__add-option-icon">
                      <Icon size={14} weight="regular" />
                    </span>
                    <span className="sc-course-quiz__add-option-title">{item.title}</span>
                  </button>
                );
              })}
            </div>
          </EditorFloating.Content>
        </CourseThemePortalBoundary>
      </EditorFloating.Portal>
    </EditorFloating.Root>
  );
}
