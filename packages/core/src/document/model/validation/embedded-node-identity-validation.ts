import type { Schema } from "@tiptap/pm/model";
import { isEmbeddedId } from "@scaffold/contracts";

export type EmbeddedNodeIdentityIssueCode =
  | "missing_embedded_node_id"
  | "invalid_embedded_node_id"
  | "duplicate_embedded_node_id";

export interface EmbeddedNodeIdentityIssue {
  readonly code: EmbeddedNodeIdentityIssueCode;
  readonly message: string;
  readonly path: readonly (string | number)[];
}

export interface EmbeddedNodeIdentityValidationResult {
  readonly ok: boolean;
  readonly issues: readonly EmbeddedNodeIdentityIssue[];
}

interface PendingNode {
  readonly value: unknown;
  readonly path: readonly (string | number)[];
}

export function validateEmbeddedNodeIdentities(
  content: unknown,
  schema: Schema,
): EmbeddedNodeIdentityValidationResult {
  const eligibleNodeTypes = new Set(
    Object.keys(schema.nodes).filter((nodeType) => nodeType !== "doc" && nodeType !== "text"),
  );
  const issues: EmbeddedNodeIdentityIssue[] = [];
  const seenIds = new Set<string>();
  const pending: PendingNode[] = [{ value: content, path: [] }];

  while (pending.length > 0) {
    const current = pending.pop()!;
    if (!isRecord(current.value)) continue;

    const nodeType = current.value["type"];
    if (typeof nodeType !== "string" || !schema.nodes[nodeType]) continue;

    if (eligibleNodeTypes.has(nodeType)) {
      const attrs = isRecord(current.value["attrs"]) ? current.value["attrs"] : undefined;
      const id = attrs?.["id"];
      if (id === undefined) {
        issues.push(
          createIssue("missing_embedded_node_id", `node "${nodeType}" must have attrs.id`, [
            ...current.path,
            "attrs",
            "id",
          ]),
        );
      } else if (!isEmbeddedId(id)) {
        issues.push(
          createIssue(
            "invalid_embedded_node_id",
            `node "${nodeType}" attrs.id must be a valid embedded ID`,
            [...current.path, "attrs", "id"],
          ),
        );
      } else if (seenIds.has(id)) {
        issues.push(
          createIssue(
            "duplicate_embedded_node_id",
            `node "${nodeType}" attrs.id must be unique within the document`,
            [...current.path, "attrs", "id"],
          ),
        );
      } else {
        seenIds.add(id);
      }
    }

    const children = current.value["content"];
    if (!Array.isArray(children)) continue;
    for (let index = children.length - 1; index >= 0; index -= 1) {
      pending.push({ value: children[index], path: [...current.path, "content", index] });
    }
  }

  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze(issues) });
}

function createIssue(
  code: EmbeddedNodeIdentityIssueCode,
  message: string,
  path: readonly (string | number)[],
): EmbeddedNodeIdentityIssue {
  return Object.freeze({ code, message, path: Object.freeze([...path]) });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
