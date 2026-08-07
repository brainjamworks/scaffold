import type { AnyExtension, Extensions } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";

import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";

export function createTestNodeIdentityExtension(): AnyExtension {
  return UniqueID.configure({
    attributeName: "id",
    types: "all",
    updateDocument: false,
    generateID: () => createEmbeddedNodeId(),
  });
}

export function withTestNodeIdentity(extensions: Extensions | undefined): Extensions {
  const configured = extensions ?? [];
  return configured.some((extension) => extension.name === "uniqueID")
    ? configured
    : [...configured, createTestNodeIdentityExtension()];
}
