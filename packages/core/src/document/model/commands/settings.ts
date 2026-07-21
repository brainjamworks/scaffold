import type { Transform } from "@tiptap/pm/transform";
import type { ZodTypeAny } from "zod";

import { resolveStableNode } from "../identity/resolve-stable-node";
import type { CheckedMutationResult } from "./checked-transactions";

type UpdateNodeSettingsCheckedInput<TTransform extends Transform> = {
  tr: TTransform;
  nodeId: string;
  nodeType: string;
  attr: string;
  schema: ZodTypeAny;
  value: unknown;
};

export function updateNodeSettingsChecked<TTransform extends Transform>({
  tr,
  nodeId,
  nodeType,
  attr,
  schema,
  value,
}: UpdateNodeSettingsCheckedInput<TTransform>): CheckedMutationResult<TTransform> {
  const target = resolveStableNode(tr.doc, { id: nodeId, nodeType });
  if (target.status === "missing") {
    return {
      ok: false,
      issue: {
        code: "missing_node",
        message: `Node "${nodeId}" was not found.`,
      },
    };
  }

  if (target.status === "invalid") {
    if (target.reason === "duplicate_id") {
      return {
        ok: false,
        issue: {
          code: "duplicate_node_id",
          message: `Node id "${nodeId}" is duplicated.`,
        },
      };
    }
    return {
      ok: false,
      issue: {
        code: "wrong_node_type",
        message: `Node "${nodeId}" is not "${nodeType}".`,
      },
    };
  }

  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      issue: {
        code: "invalid_settings_value",
        message: parsed.error.message,
      },
    };
  }

  try {
    tr.setNodeMarkup(target.pos, undefined, {
      ...target.node.attrs,
      [attr]: parsed.data,
    });
    tr.doc.check();
    return { ok: true, tr };
  } catch (error) {
    return {
      ok: false,
      issue: {
        code: "invalid_document_after_settings_update",
        message:
          error instanceof Error
            ? error.message
            : `Updating "${nodeType}" settings produced an invalid document.`,
      },
    };
  }
}
