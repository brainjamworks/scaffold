import { isEmbeddedId } from "@scaffold/contracts";
import type { Node as ProseMirrorNode, Schema } from "@tiptap/pm/model";

import type { DocumentEstablishmentIssue } from "./document-establishment";

const COMPATIBILITY_NODE_TYPES = new Set([
  "unavailable_block",
  "unavailable_layout",
  "unavailable_surface",
]);

export function assertMountedNodeIdentitySchema(schema: Schema): void {
  for (const [name, nodeType] of Object.entries(schema.nodes)) {
    if (name === "doc" || name === "text") continue;
    if (!("id" in (nodeType.spec.attrs ?? {}))) {
      throw new Error(`Mounted authoring node "${name}" must expose attrs.id.`);
    }
  }
}

export function assertParsedMountedNodeIdentity(
  document: ProseMirrorNode,
): readonly DocumentEstablishmentIssue[] {
  const issues: DocumentEstablishmentIssue[] = [];
  const owners = new Set<string>();
  const stack: Array<{ node: ProseMirrorNode; path: readonly (string | number)[] }> = [
    { node: document, path: [] },
  ];

  while (stack.length > 0) {
    const { node, path } = stack.pop()!;
    const name = node.type.name;
    if (name !== "doc" && name !== "text") {
      const id = node.attrs["id"];
      const idPath = [...path, "attrs", "id"];
      if (id === null || id === undefined) {
        issues.push(
          identityIssue("missing_embedded_node_id", "Mounted node is missing attrs.id.", idPath),
        );
      } else if (!isEmbeddedId(id)) {
        issues.push(
          identityIssue("invalid_embedded_node_id", "Mounted node attrs.id is malformed.", idPath),
        );
      } else if (owners.has(id)) {
        issues.push(
          identityIssue(
            "duplicate_embedded_node_id",
            `Mounted node attrs.id "${id}" is duplicated.`,
            idPath,
          ),
        );
      } else {
        owners.add(id);
      }
    }

    if (COMPATIBILITY_NODE_TYPES.has(name)) continue;
    for (let index = node.childCount - 1; index >= 0; index -= 1) {
      stack.push({ node: node.child(index), path: [...path, "content", index] });
    }
  }

  return issues;
}

function identityIssue(
  code: string,
  message: string,
  path: readonly (string | number)[],
): DocumentEstablishmentIssue {
  return { code, message, path };
}
