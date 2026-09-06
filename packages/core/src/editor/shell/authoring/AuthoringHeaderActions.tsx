import {
  ChatCircleTextIcon as ChatCircleText,
  EyeIcon as Eye,
  ListBulletsIcon as ListBullets,
  PencilSimpleIcon as PencilSimple,
} from "@phosphor-icons/react";
import type { Editor as TiptapEditor } from "@tiptap/core";
import type { RefObject, ReactNode } from "react";

import type { UnavailableContentRef } from "@/document/model/establishment";
import { AuthoringColorModeButton } from "@/editor/shell/chrome/AuthoringColorModeButton";
import { AuthoringPublishAction } from "@/editor/shell/chrome/AuthoringPublishAction";
import type { ScaffoldColorMode } from "@/theme/state/color-mode";
import { CourseThemePanel } from "@/theme/authoring/CourseThemePanel";
import { builtInCourseColourSystemRegistry } from "@/theme/course/colour-systems/registry";
import { builtInCourseDesignThemeRegistry } from "@/theme/course/designs/registry";
import type { PersistedCourseTheme } from "@/schemas/course-document";
import { iconSm } from "@/ui/tokens/icon-sizes";

import type { AuthorPreviewFailure } from "./author-preview-session-controller";
import type { ScaffoldAuthoringPublishState } from "./authoring-publication-controller";
import type { AuthoringSaveResult } from "./authoring-save-controller";

export type ScaffoldAuthoringSaveState = "idle" | "saving" | "saved" | "error";

export interface ScaffoldAuthoringHostActionsContext {
  saveState: ScaffoldAuthoringSaveState;
  saveNow: () => Promise<AuthoringSaveResult>;
  title: string;
  preview: boolean;
}

export interface ScaffoldAuthoringHostActionSlots {
  /** Host-owned utility actions displayed before Core's task groups. */
  utility?: ReactNode;
  beforePublish?: ReactNode;
  afterPublish?: ReactNode;
}

export interface AuthoringHeaderActionsProps {
  readonly title: string;
  readonly theme: {
    readonly course: PersistedCourseTheme | null;
    readonly editor: TiptapEditor | null;
    readonly colorMode: ScaffoldColorMode;
  };
  readonly status: {
    readonly save: ScaffoldAuthoringSaveState;
    readonly publish: ScaffoldAuthoringPublishState;
    readonly outlineOpen: boolean;
    readonly agentOpen: boolean;
    readonly preview: boolean;
    readonly previewEntryPending: boolean;
    readonly previewEntryAllowed: boolean;
    readonly previewFailure: AuthorPreviewFailure | null;
    readonly previewEnabled: boolean;
  };
  readonly actions: {
    readonly saveNow: () => Promise<AuthoringSaveResult>;
    readonly changeTheme: () => void;
    readonly toggleColorMode: () => void;
    readonly toggleOutline: () => void;
    readonly toggleAgent: () => void;
    readonly togglePreview: () => void;
    readonly publish: () => void | Promise<boolean>;
  };
  readonly outlineToggleRef: RefObject<HTMLButtonElement | null>;
  readonly hostHeaderActions?: (
    context: ScaffoldAuthoringHostActionsContext,
  ) => ScaffoldAuthoringHostActionSlots;
}

/** Renders the header's actions from owner snapshots and narrow UI operations. */
export function AuthoringHeaderActions({
  title,
  theme,
  status,
  actions,
  outlineToggleRef,
  hostHeaderActions,
}: AuthoringHeaderActionsProps) {
  const hostActionSlots = hostHeaderActions?.({
    preview: status.preview,
    saveNow: actions.saveNow,
    saveState: status.save,
    title,
  });

  return (
    <div className="sc-scaffold-authoring-actions">
      {hostActionSlots?.utility ? (
        <div
          className="sc-scaffold-authoring-action-group"
          data-authoring-action-group="utility"
          role="group"
          aria-label="Host tools"
        >
          {hostActionSlots.utility}
        </div>
      ) : null}
      <div
        className="sc-scaffold-authoring-action-group"
        data-authoring-action-group="appearance"
        role="group"
        aria-label="Appearance"
      >
        {theme.course ? (
          <CourseThemePanel
            editor={theme.editor}
            designs={builtInCourseDesignThemeRegistry}
            colourSystems={builtInCourseColourSystemRegistry}
            theme={theme.course}
            onThemeChange={actions.changeTheme}
          />
        ) : null}
        <AuthoringColorModeButton mode={theme.colorMode} onToggle={actions.toggleColorMode} />
      </div>
      {!status.preview ? (
        <div
          className="sc-scaffold-authoring-action-group"
          data-authoring-action-group="workspace"
          role="group"
          aria-label="Workspace"
        >
          <button
            ref={outlineToggleRef}
            type="button"
            onClick={actions.toggleOutline}
            aria-pressed={status.outlineOpen}
            aria-label={status.outlineOpen ? "Hide Document Outline" : "Show Document Outline"}
            title="Toggle Document Outline"
            className="sc-scaffold-authoring-action"
            data-compact-label
            data-state={status.outlineOpen ? "active-muted" : "default"}
          >
            <ListBullets size={iconSm} aria-hidden />
            <span className="sc-scaffold-authoring-action-label">Outline</span>
          </button>
          <button
            type="button"
            onClick={actions.toggleAgent}
            aria-pressed={status.agentOpen}
            aria-label={status.agentOpen ? "Hide Scaffold Agent" : "Show Scaffold Agent"}
            title="Toggle Scaffold Agent"
            className="sc-scaffold-authoring-action"
            data-compact-label
            data-state={status.agentOpen ? "active-muted" : "default"}
          >
            <ChatCircleText size={iconSm} aria-hidden />
            <span className="sc-scaffold-authoring-action-label">Agent</span>
          </button>
        </div>
      ) : null}
      <div
        className="sc-scaffold-authoring-action-group"
        data-authoring-action-group="release"
        role="group"
        aria-label="Preview and publishing"
      >
        {status.previewEnabled ? (
          <button
            type="button"
            onClick={actions.togglePreview}
            disabled={!status.preview && !status.previewEntryPending && !status.previewEntryAllowed}
            aria-pressed={status.preview}
            aria-label={
              status.preview
                ? "Switch to editing"
                : status.previewEntryPending
                  ? "Cancel preview preparation"
                  : "Switch to preview"
            }
            title={
              status.preview
                ? "Switch to editing"
                : status.previewEntryPending
                  ? "Cancel preview preparation"
                  : "Switch to preview"
            }
            className="sc-scaffold-authoring-action"
            data-compact-label
            data-state={status.preview ? "active-primary" : "default"}
          >
            {status.preview ? (
              <PencilSimple size={iconSm} aria-hidden />
            ) : (
              <Eye size={iconSm} aria-hidden />
            )}
            <span className="sc-scaffold-authoring-action-label">
              {status.preview ? "Edit" : status.previewEntryPending ? "Preparing..." : "Preview"}
            </span>
          </button>
        ) : null}
        {hostActionSlots?.beforePublish}
        <AuthoringPublishAction onPublish={actions.publish} publishState={status.publish} />
        {hostActionSlots?.afterPublish}
      </div>
      {status.previewFailure ? (
        <span role="alert">{presentAuthorPreviewFailure(status.previewFailure)}</span>
      ) : null}
    </div>
  );
}

function formatUnavailablePreviewMessage(
  content: readonly Pick<UnavailableContentRef, "kind" | "capabilityId" | "stableId">[],
): string {
  const kinds = ["block", "layout", "surface"] as const;
  const parts = kinds.flatMap((kind) => {
    const count = content.filter((item) => item.kind === kind).length;
    return count === 0
      ? []
      : [`${count} ${kind} ${count === 1 ? "capability is" : "capabilities are"} not installed`];
  });
  return `Preview unavailable: ${parts.join(", ")}.`;
}

function presentAuthorPreviewFailure(failure: AuthorPreviewFailure): string {
  if (failure.reason === "preview-requires-scaffold-plus") {
    return "Preview requires Scaffold Plus.";
  }
  if (failure.reason === "preview-unavailable-content") {
    return formatUnavailablePreviewMessage(failure.unavailableContent);
  }
  return "Preview could not be prepared. Try again.";
}
