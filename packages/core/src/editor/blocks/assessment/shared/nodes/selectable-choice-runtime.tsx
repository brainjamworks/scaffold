import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { DOMSerializer } from "@tiptap/pm/model";
import { useMemo } from "react";

import { findAncestorAssessmentBlockId } from "@/editor/blocks/assessment/shared/model/assessment-prosemirror";
import { isAssessmentQuestionNode } from "./assessment-meta";
import { SelectableChoiceAttrsSchema, type SelectableChoiceAttrs } from "@/schemas/shared";

import { createSelectableChoiceNode, selectableChoiceBodyContent } from "./selectable-choice";
import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";
import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";
import { serializeStaticRichTextHtml } from "@/editor/rich-text/static/render-rich-text";
import { SelectableChoiceCourseOption } from "../runtime/SelectableChoiceCourseOption";

export { resolveAssessmentChoiceScrollTop } from "../runtime/SelectableChoiceCourseOption";

export const SelectableChoiceRuntimeNode = createSelectableChoiceNode({
  addNodeView: () => ReactNodeViewRenderer(SelectableChoiceRuntimeNodeView),
});

function SelectableChoiceRuntimeNodeView(props: NodeViewProps) {
  const parsed = SelectableChoiceAttrsSchema.safeParse(props.node.attrs);
  const attrs: SelectableChoiceAttrs = parsed.success ? parsed.data : { id: "" };

  const pos = safeGetPos(props.getPos);
  const authoredBlockId = findAncestorAssessmentBlockId(
    props.editor,
    pos,
    isAssessmentQuestionNode,
  );
  const serializer = useMemo(
    () => DOMSerializer.fromSchema(props.editor.schema),
    [props.editor.schema],
  );
  const staticContentHtml = useMemo(() => {
    return serializeStaticRichTextHtml(serializer, selectableChoiceBodyContent(props.node));
  }, [props.node, serializer]);
  const choiceText = useMemo(
    () =>
      selectableChoiceBodyContent(props.node)
        .textBetween(0, selectableChoiceBodyContent(props.node).size, " ")
        .trim(),
    [props.node],
  );
  const fallbackChoiceLabel = `Choice ${readRuntimeChoiceIndex(props.editor, pos)}`;

  return (
    <NodeViewWrapper {...props.HTMLAttributes} data-node="selectable-choice">
      <SelectableChoiceCourseOption
        assessmentTargetId={authoredBlockId}
        choiceId={attrs.id}
        choiceText={choiceText}
        fallbackChoiceLabel={fallbackChoiceLabel}
      >
        <div dangerouslySetInnerHTML={{ __html: staticContentHtml }} />
      </SelectableChoiceCourseOption>
    </NodeViewWrapper>
  );
}

function readRuntimeChoiceIndex(editor: NodeViewProps["editor"], pos: number | undefined): number {
  if (!isValidEditorDocPos(editor, pos)) return 1;
  const $pos = editor.state.doc.resolve(pos);
  const parent = $pos.parent;
  const parentStart = $pos.start();
  let index = 1;
  let seen = 0;

  parent.forEach((child, offset) => {
    if (child.type.name !== "selectable_choice") return;
    seen += 1;
    if (parentStart + offset <= pos) index = seen;
  });

  return index;
}
