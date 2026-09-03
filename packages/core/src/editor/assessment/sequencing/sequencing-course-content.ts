import type { DOMSerializer, Node as PMNode } from "@tiptap/pm/model";

import { serializeStaticRichTextHtml } from "@/editor/rich-text/static/render-rich-text";

export interface SequencingCourseItem {
  readonly id: string;
  readonly html: string;
  readonly label: string;
}

export interface SequencingCourseContent {
  readonly items: readonly SequencingCourseItem[];
}

export function sequencingCourseContentFromProseMirror(
  group: PMNode,
  serializer: DOMSerializer,
): SequencingCourseContent {
  const items: SequencingCourseItem[] = [];
  group.forEach((child) => {
    if (child.type.name !== "sequencing_item") return;
    const id = String(child.attrs["id"] ?? "");
    if (!id) return;
    const label = child.textBetween(0, child.content.size, " ", " ").replace(/\s+/g, " ").trim();
    items.push({
      id,
      html: label ? serializeStaticRichTextHtml(serializer, child.content) : "",
      label,
    });
  });
  return { items };
}
