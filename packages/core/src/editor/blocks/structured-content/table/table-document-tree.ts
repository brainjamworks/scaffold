import type {
  DocumentTreeDefinition,
  DocumentTreeChildrenBuilder,
} from "@/document/model/document-tree";

const projectTableChildren: DocumentTreeChildrenBuilder = ({ helpers, ownerId }) =>
  helpers.projectDirectOwnedMembers({
    nodeType: "tableRow",
    describe: ({ ordinal }) =>
      Object.freeze({
        label: `Table row ${ordinal + 1}`,
        authoringAnchorId: ownerId,
      }),
  });

export const tableDocumentTree: DocumentTreeDefinition = Object.freeze({
  projectChildren: projectTableChildren,
});
