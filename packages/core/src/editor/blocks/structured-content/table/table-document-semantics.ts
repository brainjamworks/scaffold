import type {
  DocumentSemanticsDefinition,
  SemanticChildProjector,
} from "@/document/model/semantic-document";

const projectTableChildren: SemanticChildProjector = ({ helpers, ownerId }) =>
  helpers.projectDirectOwnedMembers({
    nodeType: "tableRow",
    describe: ({ ordinal }) =>
      Object.freeze({
        label: `Table row ${ordinal + 1}`,
        authoringAnchorId: ownerId,
      }),
  });

export const tableDocumentSemantics: DocumentSemanticsDefinition = Object.freeze({
  projectChildren: projectTableChildren,
});
