import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";

import { formatAssessmentPoints, resolveAssessmentMeta } from "./assessment-meta";
import {
  fieldContainerSpec,
  textContentExpression,
} from "@/document/model/content-model/content-groups";
import { isFieldContentEmpty } from "@/document/model/content-model/is-field-content-empty";
import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";
import "./assessment-shared-chrome.css";

const ASSESSMENT_INSTRUCTIONS_CONTENT = textContentExpression();

/**
 * Optional instructions — calm muted helper text below the prompt.
 * One or more paragraphs of field content; the persistent toolbar owns
 * formatting controls for selections inside. Visually it's a whisper beneath the prompt's
 * display weight, not a separate bordered block.
 */
export const AssessmentInstructionsNode = Node.create({
  name: "assessment_instructions",
  ...fieldContainerSpec({ content: ASSESSMENT_INSTRUCTIONS_CONTENT }),

  parseHTML() {
    return [{ tag: 'div[data-slot="assessment-instructions"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-slot": "assessment-instructions",
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AssessmentInstructionsNodeView);
  },
});

function AssessmentInstructionsNodeView(props: NodeViewProps) {
  const isEditable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });
  const isEmpty = isFieldContentEmpty(props.node);
  const pos = safeGetPos(props.getPos);
  const meta = resolveAssessmentMeta(props.editor, pos);
  const pointsLabel = formatAssessmentPoints(meta?.points ?? null);
  const showFieldContent = isEditable || !isEmpty;

  if (!showFieldContent && !pointsLabel) {
    return (
      <NodeViewWrapper data-slot="assessment-instructions" className="sc-assessment-field--hidden">
        <NodeViewContent />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      data-slot="assessment-instructions"
      className="sc-assessment-meta-instructions"
    >
      {showFieldContent && (
        <span contentEditable={false} className="sc-assessment-meta-default">
          ·
        </span>
      )}
      <NodeViewContent
        className={
          showFieldContent ? "sc-assessment-meta-content--inline" : "sc-assessment-field--hidden"
        }
      />
      {pointsLabel && (
        <>
          {showFieldContent && (
            <span contentEditable={false} className="sc-assessment-meta-default">
              ·
            </span>
          )}
          <span contentEditable={false} className="sc-assessment-meta-default">
            {pointsLabel}
          </span>
        </>
      )}
    </NodeViewWrapper>
  );
}
