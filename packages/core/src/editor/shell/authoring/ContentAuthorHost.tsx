import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { memo, useCallback, useRef, useState, type ReactNode } from "react";

import {
  CourseDocumentEditor,
  type CourseDocumentAuthoringFailure,
} from "@/document/authoring/CourseDocumentEditor";
import type { CourseDocumentAuthoringMount } from "@/document/authoring/prepared-authoring-mount";
import { getCourseDocumentAuthoringMountState } from "@/document/authoring/prepared-authoring-mount";
import { getCourseDocumentAuthoringEnvironmentState } from "@/composition/authoring/create-authoring-composition";
import type { UnavailableContentRef } from "@/document/model/establishment";
import {
  type ScaffoldAgentIntegration,
  type ScaffoldAgentWorkspaceContribution,
} from "@/editor/shell/agent/agent-integration";
import { EditorShell, type EditorShellScrollModel } from "@/editor/shell/chrome/EditorShell";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import type { ScaffoldColorMode } from "@/theme/state/color-mode";

function ignoreAgentClose() {}

export interface ContentAuthorHostProps {
  agentIntegration: ScaffoldAgentIntegration;
  artifactId?: string | null;
  mount: CourseDocumentAuthoringMount;
  onChange?: (editor: TiptapEditor) => void;
  onEditorReady?: (editor: TiptapEditor) => void;
  onUpdate?: (json: JSONContent, unavailableContent: readonly UnavailableContentRef[]) => void;
  onDocumentError?: (failure: CourseDocumentAuthoringFailure) => void;
  onUnavailableContentChange?: (content: readonly UnavailableContentRef[]) => void;
  courseAppearance?: ScaffoldColorMode;
  /**
   * Whether the Scaffold Agent dock is open. Defaults to true so the
   * dock renders when port is connected — preserves existing
   * behaviour. Pass false to hide the dock.
   */
  agentOpen?: boolean;
  /** Dispatched when the agent panel's X close affordance is used. */
  onAgentClose?: () => void;
  /** Scroll container model used by the editor shell. */
  scrollModel?: EditorShellScrollModel;
  /** Wide left navigator rendered only for a ready, editable authoring editor. */
  authoringNavigatorDock?: (editor: TiptapEditor) => ReactNode;
  /**
   * Render slot for the left rail (rich-text formatting toolbar by
   * convention). Receives the live editor once it's ready.
   */
  leftRail?: (editor: TiptapEditor) => ReactNode;
  /**
   * Render slot for the right rail (block insert toolbar by convention).
   * Receives the live editor once it's ready.
   */
  rightRail?: (editor: TiptapEditor) => ReactNode;
}

export const ContentAuthorHost = memo(function ContentAuthorHost({
  agentIntegration: AgentIntegration,
  artifactId,
  mount,
  onChange,
  onEditorReady,
  onDocumentError,
  onUpdate,
  onUnavailableContentChange,
  courseAppearance,
  agentOpen = true,
  onAgentClose,
  scrollModel = "page",
  authoringNavigatorDock,
  leftRail,
  rightRail,
}: ContentAuthorHostProps) {
  const editable = getCourseDocumentAuthoringEnvironmentState(
    getCourseDocumentAuthoringMountState(mount).environment,
  ).editable;
  const sessionIdentity = artifactId ?? mount;
  const sessionRef = useRef<{
    identity: string | CourseDocumentAuthoringMount;
    mount: CourseDocumentAuthoringMount;
    key: number;
  }>({
    identity: sessionIdentity,
    mount,
    key: 0,
  });
  if (
    !Object.is(sessionRef.current.identity, sessionIdentity) ||
    !Object.is(sessionRef.current.mount, mount)
  ) {
    sessionRef.current = {
      identity: sessionIdentity,
      mount,
      key: sessionRef.current.key + 1,
    };
  }
  const sessionKey = sessionRef.current.key;
  const [stageElement, setStageElement] = useState<HTMLDivElement | null>(null);
  const [editorState, setEditorState] = useState<{
    sessionKey: number;
    editor: TiptapEditor | null;
  }>({
    sessionKey,
    editor: null,
  });
  const editor = editorState.sessionKey === sessionKey ? editorState.editor : null;
  const changeProps = onChange ? { onChange } : {};
  const artifactProps = artifactId !== undefined ? { artifactId } : {};
  const handleReady = useCallback(
    (nextEditor: TiptapEditor) => {
      setEditorState({ sessionKey, editor: nextEditor });
      onEditorReady?.(nextEditor);
    },
    [onEditorReady, sessionKey],
  );

  function renderWorkspace(contribution: ScaffoldAgentWorkspaceContribution): ReactNode {
    const reviewing = contribution.mode === "review";

    return (
      <EditorShell
        data-testid="content-author-workspace"
        stageRef={setStageElement}
        scrollModel={scrollModel}
        reserveLeftRail={editable && leftRail !== undefined}
        reserveRightRail={editable && rightRail !== undefined}
        leftNavigatorDock={
          editor && editable && contribution.mode === "editing" && authoringNavigatorDock
            ? authoringNavigatorDock(editor)
            : null
        }
        leftRail={editor && editable && leftRail ? leftRail(editor) : null}
        rightRail={editor && editable && rightRail ? rightRail(editor) : null}
        stage={
          <>
            <CourseDocumentEditor
              key={sessionKey}
              mount={mount}
              authoringOverlayCollisionBoundary={stageElement}
              {...artifactProps}
              {...changeProps}
              {...(onUpdate ? { onUpdate } : {})}
              onReady={handleReady}
              {...(onDocumentError ? { onDocumentError } : {})}
              {...(onUnavailableContentChange ? { onUnavailableContentChange } : {})}
              {...(courseAppearance ? { courseAppearance } : {})}
              suspended={reviewing}
            />
            {contribution.mode === "review" ? (
              <ScaffoldArtifactIdentityProvider artifactId={artifactId ?? null}>
                {contribution.stage}
              </ScaffoldArtifactIdentityProvider>
            ) : null}
          </>
        }
        dock={editor && editable && agentOpen ? contribution.dock : null}
      />
    );
  }

  return (
    <AgentIntegration
      artifactId={artifactId ?? null}
      editor={editor}
      editable={editable}
      onClose={onAgentClose ?? ignoreAgentClose}
      renderWorkspace={renderWorkspace}
    />
  );
});
