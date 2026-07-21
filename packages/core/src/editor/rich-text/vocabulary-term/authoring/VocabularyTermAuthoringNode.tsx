import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import type { MouseEvent as ReactMouseEvent } from "react";

import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";
import { selectNodeAt } from "@/editor/selection/selection-commands";
import { cn } from "@/lib/cn";

import { createVocabularyTermNode, normalizeVocabularyText } from "../model/VocabularyTermNode";
import "../view/vocabulary-term.css";

function VocabularyTermAuthoringNodeView(props: NodeViewProps) {
  const term = normalizeVocabularyText(props.node.attrs["term"]);
  const definition = normalizeVocabularyText(props.node.attrs["definition"]);
  const pos = typeof props.getPos === "function" ? safeGetPos(props.getPos) : null;

  const selectSelf = (event: ReactMouseEvent) => {
    if (!props.editor.isEditable || typeof pos !== "number") return;
    event.preventDefault();
    selectNodeAt(props.editor, pos, { scrollIntoView: false });
  };

  return (
    <NodeViewWrapper
      as="span"
      data-type="vocab-term"
      data-vocab-term={term}
      data-vocab-definition={definition}
      contentEditable={false}
      onMouseDown={selectSelf}
      className={cn(
        "sc-vocabulary-term",
        "sc-vocabulary-term--authoring",
        props.selected && "sc-vocabulary-term--selected",
      )}
    >
      <span className="sc-vocabulary-term__trigger">{term}</span>
    </NodeViewWrapper>
  );
}

export const VocabularyTermAuthoringNode = createVocabularyTermNode().extend({
  addNodeView() {
    return ReactNodeViewRenderer(VocabularyTermAuthoringNodeView, { as: "span" });
  },
});
