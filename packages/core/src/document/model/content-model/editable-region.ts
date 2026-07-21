import type { JSONContent } from "@tiptap/core";
import type { Schema, Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Fragment } from "@tiptap/pm/model";

export function editableRegionContentJSON(): JSONContent[] {
  return [{ type: "paragraph" }];
}

export function createEditableTextblock(schema: Schema): ProseMirrorNode | null {
  return schema.nodes.paragraph?.createAndFill() ?? null;
}

export function createEditableRegionFragment(schema: Schema): Fragment {
  const textblock = createEditableTextblock(schema);
  return textblock ? Fragment.from(textblock) : Fragment.empty;
}
