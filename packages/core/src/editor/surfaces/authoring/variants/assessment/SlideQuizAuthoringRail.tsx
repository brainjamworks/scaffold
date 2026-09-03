import { ListChecksIcon as ListChecks } from "@phosphor-icons/react";
import type { Editor } from "@tiptap/core";

import { QuizStageMeta } from "@/editor/assessment/quiz/QuizStageMeta";
import { QuizStrip } from "@/editor/assessment/quiz/QuizStrip";
import type { ResolvedQuickAction } from "@/editor/assessment/quiz/quick-actions";
import type { InsertAction } from "@/editor/insertion/insert-action";
import { iconSm } from "@/ui/tokens/icon-sizes";

interface SlideQuizAuthoringRailProps {
  readonly activeChildKey: string | null;
  readonly activeIndex: number;
  readonly childKeys: string[];
  readonly childTypes: string[];
  readonly editor: Editor;
  readonly items: readonly InsertAction[];
  readonly questionKeysNeedingSetup: readonly string[];
  readonly quickActions: ResolvedQuickAction[];
  readonly totalPoints: number;
  readonly onAdd: (item: InsertAction) => void;
  readonly onDelete: () => void;
  readonly onDuplicate: () => void;
  readonly onMove: (childKey: string, index: number, direction: "up" | "down") => void;
  readonly onReorder: (sourceKey: string, targetKey: string) => void;
  readonly onSelect: (childKey: string) => void;
  readonly onSettings: () => void;
}

export function SlideQuizAuthoringRail({
  activeChildKey,
  activeIndex,
  childKeys,
  childTypes,
  editor,
  items,
  questionKeysNeedingSetup,
  quickActions,
  totalPoints,
  onAdd,
  onDelete,
  onDuplicate,
  onMove,
  onReorder,
  onSelect,
  onSettings,
}: SlideQuizAuthoringRailProps) {
  const childCount = childKeys.length;
  const activeType = activeIndex >= 0 ? childTypes[activeIndex] : undefined;
  const needsSetupCount = questionKeysNeedingSetup.length;

  return (
    <section
      aria-label="Quiz authoring"
      className="sc-app-slide-quiz__authoring-rail"
      contentEditable={false}
      data-quiz-density={childCount >= 7 ? "dense" : "standard"}
      data-testid="quiz-authoring-rail"
    >
      <div className="sc-app-slide-quiz__summary">
        <span className="sc-app-slide-quiz__summary-icon" aria-hidden>
          <ListChecks size={iconSm} weight="bold" />
        </span>
        <span className="sc-app-slide-quiz__summary-title">Quiz</span>
        <span className="sc-app-slide-quiz__summary-meta">
          {childCount} {childCount === 1 ? "question" : "questions"}
          {totalPoints > 0 ? ` · ${totalPoints} points` : ""}
        </span>
        {needsSetupCount > 0 ? (
          <span className="sc-app-slide-quiz__summary-setup">
            {needsSetupCount} {needsSetupCount === 1 ? "needs" : "need"} setup
          </span>
        ) : null}
      </div>

      {childCount > 0 ? (
        <QuizStrip
          activeChildKey={activeChildKey}
          childKeys={childKeys}
          childTypes={childTypes}
          items={items}
          questionKeysNeedingSetup={questionKeysNeedingSetup}
          showScrollControls
          onAdd={onAdd}
          onMove={onMove}
          onReorder={onReorder}
          onSelect={onSelect}
        />
      ) : null}

      {activeIndex >= 0 && activeType ? (
        <QuizStageMeta
          activeIndex={activeIndex}
          editor={editor}
          total={childCount}
          type={activeType}
          quickActions={quickActions}
          onSettings={onSettings}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        />
      ) : null}
    </section>
  );
}
