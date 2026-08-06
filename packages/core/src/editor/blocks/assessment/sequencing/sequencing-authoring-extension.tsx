import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import type { NodeViewProps } from "@tiptap/react";

import { AssessmentProblemContent } from "@/editor/blocks/assessment/shared/chrome/AssessmentProblemContent";
import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";

import { createSequencingNode } from "./node";
import { synchronizeSequencingAssessmentsInTransaction } from "./commands";
import { sequencingBlockDefinition } from "./sequencing-definition";
import { SequencingItemNode, SequencingItemsGroupNode } from "./sequencing-fields";

function SequencingAuthoringView(props: NodeViewProps) {
  return (
    <AssessmentProblemContent
      editable
      blockClass="sc-course-assessment-sequencing"
      nodeViewProps={props}
    />
  );
}

const SequencingAuthoringNode = createSequencingNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      className: "sc-assessment-node-view",
      definition: sequencingBlockDefinition,
      view: { component: SequencingAuthoringView },
    }),
});

export const SequencingAuthoringExtension = Extension.create({
  name: "sequencing_authoring_bundle",

  addExtensions() {
    return [SequencingItemNode, SequencingItemsGroupNode, SequencingAuthoringNode];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        filterTransaction(transaction) {
          if (transaction.docChanged) {
            synchronizeSequencingAssessmentsInTransaction(transaction);
          }
          return true;
        },
      }),
    ];
  },
});
