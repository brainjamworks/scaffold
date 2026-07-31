import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { memo, useCallback, useRef, useState, type ReactNode } from "react";

import { CourseDocumentEditor } from "@/document/authoring/CourseDocumentEditor";
import {
  type ScaffoldAgentIntegration,
  type ScaffoldAgentWorkspaceContribution,
} from "@/editor/shell/agent/agent-integration";
import { EditorShell, type EditorShellScrollModel } from "@/editor/shell/chrome/EditorShell";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";

function ignoreAgentClose() {}

export interface ContentAuthorHostProps {
  agentIntegration: ScaffoldAgentIntegration;
  artifactId?: string | null;
  content: JSONContent;
  editable?: boolean;
  onChange?: (editor: TiptapEditor) => void;
  onEditorReady?: (editor: TiptapEditor) => void;
  onUpdate?: (json: JSONContent) => void;
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
  content,
  editable = true,
  onChange,
  onEditorReady,
  onUpdate,
  agentOpen = true,
  onAgentClose,
  scrollModel = "page",
  leftRail,
  rightRail,
}: ContentAuthorHostProps) {
  const sessionIdentity = artifactId ?? content;
  const sessionRef = useRef<{
    identity: string | JSONContent;
    key: number;
  }>({
    identity: sessionIdentity,
    key: 0,
  });
  if (!Object.is(sessionRef.current.identity, sessionIdentity)) {
    sessionRef.current = {
      identity: sessionIdentity,
      key: sessionRef.current.key + 1,
    };
  }
  const sessionKey = sessionRef.current.key;
  const [editorState, setEditorState] = useState<{
    sessionKey: number;
    editor: TiptapEditor | null;
  }>({
    sessionKey,
    editor: null,
  });
  const editor = editorState.sessionKey === sessionKey ? editorState.editor : null;
  const changeProps = onChange ? { onChange } : {};
  const source = onUpdate
    ? { mode: "document" as const, content, onUpdate }
    : { mode: "document" as const, content };
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
        scrollModel={scrollModel}
        reserveLeftRail={editable && leftRail !== undefined}
        reserveRightRail={editable && rightRail !== undefined}
        leftRail={editor && editable && leftRail ? leftRail(editor) : null}
        rightRail={editor && editable && rightRail ? rightRail(editor) : null}
        stage={
          <>
            <CourseDocumentEditor
              key={sessionKey}
              {...artifactProps}
              {...changeProps}
              source={source}
              editable={editable}
              onReady={handleReady}
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
