import { useEditorState } from "@tiptap/react";
import type { Editor as TiptapEditor } from "@tiptap/core";
import {
  CopyIcon as Copy,
  GearSixIcon as GearSix,
  type Icon,
  TrashIcon as Trash,
} from "@phosphor-icons/react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { IconButton } from "@radix-ui/themes";

import { CourseThemePortalBoundary } from "@/theme/course/CourseThemeProvider";
import { useOverlayBoundary } from "@/ui/overlays/portal-host-context";
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
 * Every visible action is Course-owned because this row sits inside the
 * Course canvas. Tooltip behaviour stays with the Radix primitive while
 * its portal content restores the active Course theme boundary.
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
    <div
      className="sc-course-quiz__stage-meta"
      contentEditable={false}
      data-testid="quiz-stage-meta"
    >
      <div className="sc-course-quiz__stage-meta-left">
        <span className="sc-course-quiz__stage-meta-position">
          {total > 1 ? `Question ${activeIndex + 1} of ${total}` : `Question ${activeIndex + 1}`}
        </span>
        <span className="sc-course-quiz__stage-meta-sep">·</span>
        <span className="sc-course-quiz__stage-meta-type">{questionTypeTag(type)}</span>
      </div>
      <Tooltip.Provider delayDuration={300}>
        <div className="sc-course-quiz__stage-meta-actions">
          {quickActions.map((action) => (
            <QuizQuickActionButton key={action.id} action={action} editor={editor} />
          ))}
          {quickActions.length > 0 ? (
            <span aria-hidden className="sc-course-quiz__stage-meta-divider" />
          ) : null}
          <QuizStageAction icon={GearSix} label="Question settings" onClick={onSettings} />
          <QuizStageAction icon={Copy} label="Duplicate question" onClick={onDuplicate} />
          <QuizStageAction icon={Trash} label="Delete question" tone="danger" onClick={onDelete} />
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
    <QuizStageAction
      icon={Icon}
      label={action.label}
      className="sc-course-quiz__quick-action"
      disabled={!canRun}
      onClick={action.run}
    />
  );
}

function QuizStageAction({
  icon: Icon,
  label,
  className,
  disabled = false,
  tone = "default",
  onClick,
}: {
  icon: Icon;
  label: string;
  className?: string;
  disabled?: boolean;
  tone?: "default" | "danger";
  onClick: () => void;
}) {
  const overlayBoundary = useOverlayBoundary();

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <IconButton
          type="button"
          size="2"
          variant="ghost"
          className={`sc-course-quiz__stage-action${className ? ` ${className}` : ""}`}
          data-tone={tone}
          aria-label={label}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClick}
        >
          <Icon size={iconSm} aria-hidden />
        </IconButton>
      </Tooltip.Trigger>
      {overlayBoundary.status === "pending" ? null : (
        <Tooltip.Portal
          container={
            overlayBoundary.status === "ready" ? overlayBoundary.environment.host : undefined
          }
        >
          <CourseThemePortalBoundary>
            <Tooltip.Content
              {...(overlayBoundary.status === "ready"
                ? { collisionBoundary: overlayBoundary.environment.collisionBoundary }
                : {})}
              side="top"
              sideOffset={7}
              className="sc-course-quiz__action-tooltip"
              style={{ zIndex: zIndex.tooltip }}
            >
              {label}
            </Tooltip.Content>
          </CourseThemePortalBoundary>
        </Tooltip.Portal>
      )}
    </Tooltip.Root>
  );
}
