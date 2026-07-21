import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { memo, useCallback, useState, type ReactNode } from "react";
import type * as Y from "yjs";

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
  document: Y.Doc;
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
  document,
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
  const [editor, setEditor] = useState<TiptapEditor | null>(null);
  const changeProps = onChange ? { onChange } : {};
  const updateProps = onUpdate ? { onUpdate } : {};
  const artifactProps = artifactId !== undefined ? { artifactId } : {};
  const handleReady = useCallback(
    (nextEditor: TiptapEditor) => {
      setEditor(nextEditor);
      onEditorReady?.(nextEditor);
    },
    [onEditorReady],
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
              {...artifactProps}
              {...changeProps}
              document={document}
              editable={editable}
              onReady={handleReady}
              suspended={reviewing}
              {...updateProps}
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
