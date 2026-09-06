import type {
  DocumentTreeDefinition,
  DocumentTreeChildrenBuilder,
} from "@/document/model/document-tree";

import { GLOSSARY_ENTRY_NODE } from "./content";

const projectGlossaryChildren: DocumentTreeChildrenBuilder = ({ helpers, ownerId }) =>
  helpers.projectDirectOwnedMembers({
    nodeType: GLOSSARY_ENTRY_NODE,
    describe: ({ ordinal }) =>
      Object.freeze({
        label: `Glossary entry ${ordinal + 1}`,
        authoringAnchorId: ownerId,
      }),
  });

export const glossaryDocumentTree: DocumentTreeDefinition = Object.freeze({
  projectChildren: projectGlossaryChildren,
});
