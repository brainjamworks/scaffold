import type { Transform } from "@tiptap/pm/transform";

import type { ResolvedStableNode } from "../identity/resolve-stable-node";
import {
  MAX_SEMANTIC_LABEL_LENGTH,
  normalizeAuthoredSemanticLabel,
} from "../semantic-document/semantic-labels";
import type { CheckedMutationResult } from "./checked-transactions";

export function setSemanticLabelChecked<TTransform extends Transform>({
  tr,
  target,
  value,
}: {
  tr: TTransform;
  target: ResolvedStableNode;
  value: string;
}): CheckedMutationResult<TTransform> {
  const normalized = normalizeAuthoredSemanticLabel(value);
  if (normalized && normalized.length > MAX_SEMANTIC_LABEL_LENGTH) {
    return {
      ok: false,
      issue: {
        code: "semantic_label_too_long",
        message: `Outline labels must be ${MAX_SEMANTIC_LABEL_LENGTH} characters or fewer.`,
      },
    };
  }

  if (!target.node.type.spec.attrs?.["semanticLabel"]) {
    return {
      ok: false,
      issue: {
        code: "semantic_label_unavailable",
        message: "This item cannot store an outline label.",
      },
    };
  }

  try {
    tr.setNodeMarkup(target.pos, undefined, {
      ...target.node.attrs,
      semanticLabel: normalized,
    });
    tr.doc.check();
    return { ok: true, tr };
  } catch (error) {
    return {
      ok: false,
      issue: {
        code: "invalid_document_after_semantic_label_update",
        message:
          error instanceof Error
            ? error.message
            : "Updating the outline label produced an invalid document.",
      },
    };
  }
}
