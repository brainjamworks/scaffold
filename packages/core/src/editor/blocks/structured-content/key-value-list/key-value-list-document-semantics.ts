import type {
  DocumentSemanticsDefinition,
  SemanticChildProjector,
} from "@/document/model/semantic-document";

import { KEY_VALUE_ROW_NODE } from "./content";

const projectKeyValueListChildren: SemanticChildProjector = ({ helpers, ownerId }) =>
  helpers.projectDirectOwnedMembers({
    nodeType: KEY_VALUE_ROW_NODE,
    describe: ({ ordinal }) =>
      Object.freeze({
        label: `Key-value row ${ordinal + 1}`,
        authoringAnchorId: ownerId,
      }),
  });

export const keyValueListDocumentSemantics: DocumentSemanticsDefinition = Object.freeze({
  projectChildren: projectKeyValueListChildren,
});
