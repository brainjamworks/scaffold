import type {
  DocumentSemanticsDefinition,
  SemanticChildProjector,
} from "@/document/model/semantic-document";

import { GLOSSARY_ENTRY_NODE } from "./content";

const projectGlossaryChildren: SemanticChildProjector = ({ helpers, ownerId }) =>
  helpers.projectDirectOwnedMembers({
    nodeType: GLOSSARY_ENTRY_NODE,
    describe: ({ ordinal }) =>
      Object.freeze({
        label: `Glossary entry ${ordinal + 1}`,
        authoringAnchorId: ownerId,
      }),
  });

export const glossaryDocumentSemantics: DocumentSemanticsDefinition = Object.freeze({
  projectChildren: projectGlossaryChildren,
});
