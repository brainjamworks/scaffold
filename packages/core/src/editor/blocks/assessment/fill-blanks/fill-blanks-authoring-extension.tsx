import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import type { NodeViewProps } from "@tiptap/react";

import { AssessmentProblemContent } from "@/editor/blocks/assessment/shared/chrome/AssessmentProblemContent";
import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";

import { FillBlankAuthoringNode } from "./fill-blank-authoring";
import { fillBlanksBlockDefinition } from "./fill-blanks-definition";
import { FillBlanksBodyNode } from "./fill-blanks-body";
import { createFillBlanksNode } from "./node";
import { cleanupRemovedFillBlanksInTransaction, repairFillBlanksInTransaction } from "./commands";

function FillBlanksAuthoringView(props: NodeViewProps) {
  return (
    <AssessmentProblemContent editable blockClass="sc-course-fill-blanks" nodeViewProps={props} />
  );
}

const FillBlanksAuthoringNode = createFillBlanksNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      className: "sc-assessment-node-view",
      definition: fillBlanksBlockDefinition,
      view: { component: FillBlanksAuthoringView },
    }),
});

export const FillBlanksAuthoringExtension = Extension.create({
  name: "fill_blanks_authoring_bundle",

  addExtensions() {
    return [FillBlankAuthoringNode, FillBlanksBodyNode, FillBlanksAuthoringNode];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, oldState, newState) {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;
          let tr = newState.tr;
          tr = cleanupRemovedFillBlanksInTransaction(oldState, newState, tr);
          const pasted = transactions.some(
            (transaction) =>
              transaction.getMeta("uiEvent") === "paste" || transaction.getMeta("paste") === true,
          );
          if (pasted) tr = repairFillBlanksInTransaction(newState, tr);
          return tr.docChanged ? tr : null;
        },
      }),
    ];
  },
});
