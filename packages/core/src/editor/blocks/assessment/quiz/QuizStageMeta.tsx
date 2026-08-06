import { useEditorState } from "@tiptap/react";
import type { Editor as TiptapEditor } from "@tiptap/core";
import {
  CopyIcon as Copy,
  GearSixIcon as GearSix,
  TrashIcon as Trash,
} from "@phosphor-icons/react";

import * as Tooltip from "@/ui/components/Tooltip/Tooltip";
import { MenuIconButton } from "@/editor/shell/bubbles/interaction/menu-controls/MenuControls";
import { zIndex } from "@/ui/overlays/z-index";
import { iconSm } from "@/ui/tokens/icon-sizes";

import { questionTypeTag } from "./question-type-tags";
import type { ResolvedQuickAction } from "./quick-actions";

/**
 * Row above the active question content. Shows position + type tag on
 * the left, and the question-level actions on the right. Actions are
 * split into two clusters by a thin divider:
 *
 *   - per-question-type authoring actions (e.g. FillBlanks' "Create
 *     blank"), resolved from the active child block's registered
 *     authoringControls. Path-based settings are kept off this row.
 *   - standard authoring actions: settings, duplicate, delete.
 *
 * The per-question actions are Course controls because they sit inside
 * the canvas. Standard settings and document-management actions retain
 * their existing shell control until the Quiz slice itself is migrated.
 */
export function QuizStageMeta({
  activeIndex,
  editor,
  total,
  type,
  quickActions,
  onSettings,
  onDuplicate,
  onDelete,
}: {
  activeIndex: number;
  editor: TiptapEditor;
  total: number;
  type: string;
  quickActions: ResolvedQuickAction[];
  onSettings: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="sc-quiz__stage-meta" contentEditable={false} data-testid="quiz-stage-meta">
      <div className="sc-quiz__stage-meta-left">
        <span className="sc-quiz__stage-meta-position">
          {total > 1 ? `Question ${activeIndex + 1} of ${total}` : `Question ${activeIndex + 1}`}
        </span>
        <span className="sc-quiz__stage-meta-sep">·</span>
        <span className="sc-quiz__stage-meta-type">{questionTypeTag(type)}</span>
      </div>
      <Tooltip.Provider delayDuration={300}>
        <div className="sc-quiz__stage-meta-actions">
          {quickActions.map((action) => (
            <QuizQuickActionButton key={action.id} action={action} editor={editor} />
          ))}
          {quickActions.length > 0 ? (
            <span aria-hidden className="sc-quiz__stage-meta-divider" />
          ) : null}
          <MenuIconButton icon={GearSix} label="Question settings" onClick={onSettings} />
          <MenuIconButton icon={Copy} label="Duplicate question" onClick={onDuplicate} />
          <MenuIconButton icon={Trash} label="Delete question" destructive onClick={onDelete} />
        </div>
      </Tooltip.Provider>
    </div>
  );
}

/**
 * Subscribes only to the action's own `canRun` boolean. React's
 * `useSyncExternalStore` (via `useEditorState`) only re-renders this
 * button when the boolean flips, not on every cursor move. The rest
 * of the quiz tree stays out of the selection-change render path.
 */
function QuizQuickActionButton({
  action,
  editor,
}: {
  action: ResolvedQuickAction;
  editor: TiptapEditor;
}) {
  const canRun = useEditorState({
    editor,
    selector: ({ editor: liveEditor }) => action.canRun({ editor: liveEditor }),
  });
  if (!action.icon) return null;
  const Icon = action.icon;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          className="sc-course-quiz__quick-action"
          aria-label={action.label}
          title={action.label}
          disabled={!canRun}
          onMouseDown={(event) => event.preventDefault()}
          onClick={action.run}
        >
          <Icon size={iconSm} aria-hidden />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          sideOffset={7}
          className="sc-course-quiz__quick-action-tooltip"
          style={{ zIndex: zIndex.tooltip }}
        >
          {action.label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
