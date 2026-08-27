import type { DOMSerializer, Node as PMNode } from "@tiptap/pm/model";

import { selectableChoiceBodyContent } from "@/editor/blocks/assessment/shared/nodes/selectable-choice";
import { serializeStaticRichTextHtml } from "@/editor/rich-text/static/render-rich-text";

export interface SelectableChoiceCourseChoice {
  readonly id: string;
  readonly html: string;
  readonly label: string;
}

export interface SelectableChoiceCourseContent {
  readonly choices: readonly SelectableChoiceCourseChoice[];
}

export function selectableChoiceCourseContentFromProseMirror(
  group: PMNode,
  serializer: DOMSerializer,
): SelectableChoiceCourseContent {
  const choices: SelectableChoiceCourseChoice[] = [];
  group.forEach((choice) => {
    if (choice.type.name !== "selectable_choice") return;
    const id = choice.attrs["id"];
    if (typeof id !== "string" || !id.trim()) return;
    const body = selectableChoiceBodyContent(choice);
    choices.push({
      id,
      html: serializeStaticRichTextHtml(serializer, body),
      label: body.textBetween(0, body.size, " ").trim(),
    });
  });
  return { choices };
}
