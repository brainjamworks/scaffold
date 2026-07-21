import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { useState } from "react";

import * as Popover from "@/ui/components/Popover/Popover";
import { zIndex } from "@/ui/overlays/z-index";

import { createVocabularyTermNode, normalizeVocabularyText } from "../model/VocabularyTermNode";
import "../view/vocabulary-term.css";

function VocabularyTermRuntimeNodeView(props: NodeViewProps) {
  const [open, setOpen] = useState(false);
  const term = normalizeVocabularyText(props.node.attrs["term"]);
  const definition = normalizeVocabularyText(props.node.attrs["definition"]);

  return (
    <NodeViewWrapper
      as="span"
      data-type="vocab-term"
      data-vocab-term={term}
      data-vocab-definition={definition}
      contentEditable={false}
      className="sc-vocabulary-term sc-vocabulary-term--runtime"
    >
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button type="button" className="sc-vocabulary-term__trigger">
            {term}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="center"
            className="sc-vocabulary-term__content"
            collisionPadding={12}
            side="top"
            sideOffset={8}
            style={{ zIndex: zIndex.popover }}
          >
            <p className="sc-vocabulary-term__term">{term}</p>
            <p className="sc-vocabulary-term__definition">{definition}</p>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </NodeViewWrapper>
  );
}

export const VocabularyTermRuntimeNode = createVocabularyTermNode().extend({
  addNodeView() {
    return ReactNodeViewRenderer(VocabularyTermRuntimeNodeView, { as: "span" });
  },
});
