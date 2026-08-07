import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type { SemanticProjectionHelpers } from "./definition";
import { projectStandardRichText } from "./rich-text-publication";

export function createSemanticProjectionHelpers(owner: ProseMirrorNode): SemanticProjectionHelpers {
  return Object.freeze({
    projectStandardRichText: (contentRoot?: ProseMirrorNode) =>
      projectStandardRichText({ owner, ...(contentRoot ? { contentRoot } : {}) }),
  });
}
