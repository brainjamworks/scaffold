import { Extension } from "@tiptap/core";
import { type NodeViewProps } from "@tiptap/react";

import { AssessmentRuntimeProblemContent } from "@/editor/blocks/assessment/shared/runtime/AssessmentRuntimeProblemContent";
import { createBlockRuntimeNodeView } from "@/editor/frame/runtime/create-block-runtime-node-view";

import { FillBlankRuntimeNode } from "./fill-blank-runtime";
import { fillBlanksBlockDefinition } from "./fill-blanks-definition";
import { FillBlanksBodyNode } from "./fill-blanks-body";
import { createFillBlanksNode } from "./node";

function FillBlanksRuntimeView(props: NodeViewProps) {
  return (
    <AssessmentRuntimeProblemContent
      blockClass="sc-fill-blanks"
      definition={fillBlanksBlockDefinition}
      props={props}
    />
  );
}

const FillBlanksRuntimeNode = createFillBlanksNode({
  addNodeView: () =>
    createBlockRuntimeNodeView({
      className: "sc-assessment-node-view",
      definition: fillBlanksBlockDefinition,
      view: { component: FillBlanksRuntimeView },
    }),
});

export const FillBlanksRuntimeExtension = Extension.create({
  name: "fill_blanks_runtime_bundle",

  addExtensions() {
    return [FillBlankRuntimeNode, FillBlanksBodyNode, FillBlanksRuntimeNode];
  },
});
