import { NodeViewContent, useEditorState, type NodeViewProps } from "@tiptap/react";
import { MarginaliaDataSchema } from "@scaffold/contracts";

import { isFieldContentEmpty } from "@/document/model/content-model/is-field-content-empty";

import { emptyMarginaliaData } from "./content";
import "./Marginalia.css";

export function MarginaliaView(props: NodeViewProps) {
  const isEditable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });
  const parsed = MarginaliaDataSchema.safeParse(props.node.attrs["data"]);
  const data = parsed.success ? parsed.data : emptyMarginaliaData();
  const isEmpty =
    isFieldContentEmpty(props.node.child(0)) && isFieldContentEmpty(props.node.child(1));
  const isHidden = !isEditable && isEmpty;

  return (
    <div
      hidden={isHidden}
      aria-hidden={isHidden || undefined}
      data-position={data.position}
      className="sc-course-marginalia"
    >
      <NodeViewContent className="sc-course-marginalia__content" />
    </div>
  );
}
