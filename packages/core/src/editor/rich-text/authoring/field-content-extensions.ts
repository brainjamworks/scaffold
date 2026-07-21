import type { Extensions } from "@tiptap/core";

import { createScaffoldRichTextAuthoringExtensions } from "./extensions";

export function createFieldContentEditorExtensions(): Extensions {
  return createScaffoldRichTextAuthoringExtensions({ undoRedo: false });
}
