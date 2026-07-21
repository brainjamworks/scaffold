import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { ZodTypeAny } from "zod";

import type { CheckedMutationIssue } from "@/document/model/commands/checked-transactions";

import type { InsertAction } from "./insert-action";

export interface CatalogNodeAttrSchema {
  readonly nodeType: string;
  readonly schema: ZodTypeAny;
  readonly field?: string;
  readonly message?: string;
}

export function validateCatalogNodeAttrs(
  schemas: readonly CatalogNodeAttrSchema[],
): NonNullable<InsertAction["validateNode"]> {
  return (node) => validateNodeTreeAttrs(node, schemas);
}

function validateNodeTreeAttrs(
  node: ProseMirrorNode,
  schemas: readonly CatalogNodeAttrSchema[],
): CheckedMutationIssue | null {
  const byNodeType = new Map(schemas.map((schema) => [schema.nodeType, schema] as const));
  if (byNodeType.size === 0) return null;

  let issue: CheckedMutationIssue | null = null;
  visitNodeAndDescendants(node, (candidate) => {
    const schema = byNodeType.get(candidate.type.name);
    if (!schema) return true;

    const parsed = schema.schema.safeParse(candidate.attrs);
    if (parsed.success) return true;

    issue = {
      code: "invalid_catalog_content",
      ...(schema.field ? { field: schema.field } : {}),
      message:
        schema.message ?? `Catalog content contains invalid attrs for "${candidate.type.name}".`,
    };
    return false;
  });

  return issue;
}

function visitNodeAndDescendants(
  node: ProseMirrorNode,
  visitor: (node: ProseMirrorNode) => boolean,
): void {
  if (!visitor(node)) return;
  node.descendants((descendant) => visitor(descendant));
}
