import { BlockMath } from "@tiptap/extension-mathematics";

import { TEXT_CONTENT } from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";

/**
 * Block-level math node — extends Tiptap's official BlockMath to also
 * belong to `text_content` (in addition to its default `block` group).
 * Display-mode KaTeX rendering is owned by the extension; click-to-edit
 * handler can be wired via blockOptions in Editor.tsx if/when a real edit
 * modal lands.
 *
 * Attrs (owned by the extension): `latex: string`.
 * Default node name: `blockMath`.
 */
export const MathBlockNode = BlockMath.extend({
  group: `block ${TEXT_CONTENT}`,

  addAttributes() {
    return {
      ...this.parent?.(),
      id: stableNodeIdAttribute(),
    };
  },
});
