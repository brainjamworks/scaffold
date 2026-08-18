import { CaretLeftIcon as CaretLeft, CaretRightIcon as CaretRight } from "@phosphor-icons/react";
import { PresentationContentLayout, type EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { useEditorState } from "@tiptap/react";

import { useAppNotifications } from "@/ui/components/app/AppNotifications/AppNotifications";
import {
  MenuControls,
  MenuIconButton,
  MenuSeparator,
} from "@/editor/shell/bubbles/interaction/menu-controls/MenuControls";

import {
  navigateAuthoringContentLayoutChild,
  readContentLayoutAuthoringNavigation,
  setAuthoringContentLayout,
  type ContentLayoutAuthoringIssue,
  type ContentLayoutAuthoringNavigation,
} from "./content-layout-authoring-commands";
import { readContentLayoutAuthoringState } from "../prosemirror/content-layout-authoring-extension";

export interface ContentLayoutBubbleControlsProps {
  readonly containerId: EmbeddedNodeId;
  readonly editor: Editor;
}

export type ContentLayoutBubbleViewModel =
  | {
      readonly kind: "ready";
      readonly containerId: EmbeddedNodeId;
      readonly contentLayout: PresentationContentLayout;
      readonly navigation: ContentLayoutAuthoringNavigation;
    }
  | {
      readonly kind: "unavailable";
      readonly containerId: EmbeddedNodeId;
    };

export interface ContentLayoutBubbleControlsViewProps {
  readonly contentLayout: PresentationContentLayout;
  readonly navigation: ContentLayoutAuthoringNavigation;
  readonly onLayoutChange: (contentLayout: PresentationContentLayout) => void;
  readonly onNavigate: (childId: EmbeddedNodeId) => void;
}

export function ContentLayoutBubbleControls({
  containerId,
  editor,
}: ContentLayoutBubbleControlsProps) {
  const notifications = useAppNotifications();
  const viewModel = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) =>
      readContentLayoutBubbleViewModel(currentEditor.state, containerId),
  });

  if (viewModel.kind === "unavailable") return null;

  return (
    <ContentLayoutBubbleControlsView
      contentLayout={viewModel.contentLayout}
      navigation={viewModel.navigation}
      onLayoutChange={(contentLayout) => {
        const result = setAuthoringContentLayout({ editor, containerId, contentLayout });
        notifyContentLayoutIssue(result, notifications.notify);
      }}
      onNavigate={(childId) => {
        const result = navigateAuthoringContentLayoutChild({ editor, containerId, childId });
        notifyContentLayoutIssue(result, notifications.notify);
      }}
    />
  );
}

export function ContentLayoutBubbleControlsView({
  contentLayout,
  navigation,
  onLayoutChange,
  onNavigate,
}: ContentLayoutBubbleControlsViewProps) {
  const previousChildId =
    navigation.kind === "ready" && navigation.previous.kind === "available"
      ? navigation.previous.childId
      : null;
  const nextChildId =
    navigation.kind === "ready" && navigation.next.kind === "available"
      ? navigation.next.childId
      : null;
  const isSequence = contentLayout === PresentationContentLayout.Sequence;
  const ordinalLabel = sequenceOrdinalLabel(navigation);

  return (
    <>
      <MenuControls
        controls={[
          {
            kind: "select",
            name: "contentLayout",
            label: "Content layout",
            options: [
              { value: PresentationContentLayout.Flow, label: "Flow" },
              { value: PresentationContentLayout.Sequence, label: "Sequence" },
            ],
            presentation: "segmented",
          },
        ]}
        value={{ contentLayout }}
        onValueChange={(name, next) => {
          if (name !== "contentLayout") {
            throw new Error(`Unexpected content layout control "${name}"`);
          }
          if (
            next !== PresentationContentLayout.Flow &&
            next !== PresentationContentLayout.Sequence
          ) {
            throw new Error("Unexpected content layout value");
          }
          onLayoutChange(next);
        }}
      />
      {isSequence ? (
        <>
          <MenuSeparator />
          <MenuIconButton
            icon={CaretLeft}
            label="Previous sequence child"
            disabled={previousChildId === null}
            onClick={() => {
              if (previousChildId !== null) onNavigate(previousChildId);
            }}
          />
          <span
            aria-atomic="true"
            aria-label={
              ordinalLabel === "Unavailable"
                ? "Sequence navigation unavailable"
                : `Current sequence child ${ordinalLabel}`
            }
            aria-live="polite"
            role="status"
          >
            {ordinalLabel}
          </span>
          <MenuIconButton
            icon={CaretRight}
            label="Next sequence child"
            disabled={nextChildId === null}
            onClick={() => {
              if (nextChildId !== null) onNavigate(nextChildId);
            }}
          />
        </>
      ) : null}
    </>
  );
}

export function readContentLayoutBubbleViewModel(
  state: EditorState,
  containerId: EmbeddedNodeId,
): ContentLayoutBubbleViewModel {
  const authoringState = readContentLayoutAuthoringState(state);
  const projectionInput = authoringState.projectionInputs.find(
    (input) => input.containerId === containerId,
  );
  if (!projectionInput) return Object.freeze({ kind: "unavailable", containerId });

  return Object.freeze({
    kind: "ready",
    containerId,
    contentLayout: projectionInput.contentLayout,
    navigation: readContentLayoutAuthoringNavigation(state, containerId),
  });
}

export function contentLayoutAuthoringIssueMessage(issue: ContentLayoutAuthoringIssue): string {
  switch (issue.kind) {
    case "container-unavailable":
      return "This container is no longer available.";
    case "child-unavailable":
      return "That content is no longer available.";
    case "child-not-direct":
      return "That content belongs to a nested sequence.";
    case "navigation-unavailable":
      return "That content cannot be selected right now.";
    case "layout-change-rejected":
      switch (issue.issue.code) {
        case "missing_node":
          return "This container is no longer available.";
        case "duplicate_node_id":
          return "This container has duplicate content IDs and cannot change layout.";
        case "wrong_node_type":
          return "This container cannot change layout.";
        case "invalid_settings_value":
          return "That layout choice is unavailable.";
        case "incompatible_flow_placement":
          return "Flow is unavailable while this container has multiple fill children.";
        default:
          return assertNever(issue.issue);
      }
    default:
      return assertNever(issue);
  }
}

function notifyContentLayoutIssue(
  result: ReturnType<typeof setAuthoringContentLayout>,
  notify: (intent: "warning", message: string) => unknown,
): void {
  if (result.isErr()) notify("warning", contentLayoutAuthoringIssueMessage(result.error));
}

function sequenceOrdinalLabel(navigation: ContentLayoutAuthoringNavigation): string {
  if (navigation.kind === "ready") return `${navigation.ordinal} of ${navigation.count}`;
  if (navigation.kind === "empty") return "Unavailable";
  return "Unavailable";
}

function assertNever(value: never): never {
  throw new Error(`Unexpected Content Layout authoring value: ${String(value)}`);
}
