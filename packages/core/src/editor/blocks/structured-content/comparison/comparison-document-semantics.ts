import type {
  DocumentSemanticsDefinition,
  SemanticChildProjector,
} from "@/document/model/semantic-document";

import { COMPARISON_ROW_NODE } from "./content";

const projectComparisonChildren: SemanticChildProjector = ({ helpers, ownerId }) =>
  helpers.projectDirectOwnedMembers({
    nodeType: COMPARISON_ROW_NODE,
    describe: ({ ordinal }) =>
      Object.freeze({
        label: `Comparison row ${ordinal + 1}`,
        authoringAnchorId: ownerId,
      }),
  });

export const comparisonDocumentSemantics: DocumentSemanticsDefinition = Object.freeze({
  projectChildren: projectComparisonChildren,
});
