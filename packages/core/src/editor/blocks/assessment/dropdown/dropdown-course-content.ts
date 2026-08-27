import { DOMSerializer, type Node as PMNode } from "@tiptap/pm/model";

import { serializeStaticRichTextHtml } from "@/editor/rich-text/static/render-rich-text";

export interface DropdownCourseChoice {
  readonly html: string;
  readonly id: string;
  readonly text: string;
}

export interface DropdownCourseContent {
  readonly choices: readonly DropdownCourseChoice[];
}

export function dropdownCourseContentFromProseMirror(
  choicesGroup: PMNode,
  serializer: DOMSerializer,
): DropdownCourseContent {
  const choices: DropdownCourseChoice[] = [];

  choicesGroup.forEach((choice, _offset, index) => {
    if (choice.type.name !== "dropdown_choice") return;
    const id = String(choice.attrs["id"] ?? "");
    if (!id) return;
    const label = childByType(choice, "dropdown_choice_label");
    choices.push({
      id,
      text: label?.textContent.trim() || `Choice ${index + 1}`,
      html: serializeDropdownChoiceHtml(serializer, label),
    });
  });

  return { choices };
}

function serializeDropdownChoiceHtml(serializer: DOMSerializer, node: PMNode | null): string {
  if (!node) return "";
  const inlineParts: string[] = [];

  node.forEach((child) => {
    if (child.isTextblock) {
      const html = serializeStaticRichTextHtml(serializer, child.content).trim();
      if (html) inlineParts.push(html);
      return;
    }

    const text = child.textContent.trim();
    if (text) inlineParts.push(escapeHtmlText(text));
  });

  return inlineParts.join(" ");
}

function childByType(node: PMNode, typeName: string): PMNode | null {
  let found: PMNode | null = null;
  node.forEach((child) => {
    if (!found && child.type.name === typeName) found = child;
  });
  return found;
}

function escapeHtmlText(text: string): string {
  const element = document.createElement("span");
  element.textContent = text;
  return element.innerHTML;
}
