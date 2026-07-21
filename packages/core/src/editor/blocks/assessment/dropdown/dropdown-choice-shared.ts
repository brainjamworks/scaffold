import { Node, mergeAttributes, type JSONContent, type NodeViewRenderer } from "@tiptap/core";

import { textContentExpression } from "@/document/model/content-model/content-groups";

export type DropdownChoiceState = "correct" | "incorrect" | "missed" | null;

interface DropdownAccessibilityState {
  hasFeedback: boolean;
  selected: boolean;
  state: DropdownChoiceState;
  submitted: boolean;
}

export function describeDropdownAccessibilityState({
  hasFeedback,
  selected,
  state,
  submitted,
}: DropdownAccessibilityState): string | null {
  const parts: string[] = [];

  if (state === "missed") {
    parts.push("Correct answer");
  } else if (state === "correct") {
    parts.push(submitted ? "Submitted answer, correct" : "Selected answer, correct");
  } else if (state === "incorrect") {
    parts.push(submitted ? "Submitted answer, incorrect" : "Selected answer, incorrect");
  } else if (selected) {
    parts.push("Selected answer");
  }

  if (hasFeedback && state !== null) {
    parts.push("Feedback available");
  }

  return parts.length > 0 ? parts.join(". ") : null;
}

// Match selectable_choice_body's shape: the label is a field container.
// The editable content uses real text-content textblocks, so placeholder
// CSS applies to the inner <p> and textblock splits stay inside the choice row.
const DROPDOWN_CHOICE_LABEL_CONTENT = textContentExpression();

export function dropdownChoiceLabelContent(text?: string): JSONContent[] {
  return [
    {
      type: "paragraph",
      ...(text ? { content: [{ type: "text", text }] } : {}),
    },
  ];
}

export interface DropdownChoiceAttrs {
  id: string;
}

export function dropdownChoiceAttrs() {
  return {
    id: {
      default: "",
      parseHTML: (el: HTMLElement) => el.getAttribute("data-choice-id") ?? "",
      renderHTML: (attrs: { id: string }) => ({ "data-choice-id": attrs.id }),
    },
  };
}

interface DropdownChoiceNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createDropdownChoiceLabelNode(options: DropdownChoiceNodeOptions = {}) {
  return Node.create({
    name: "dropdown_choice_label",
    content: DROPDOWN_CHOICE_LABEL_CONTENT,
    defining: true,
    isolating: true,
    selectable: false,

    parseHTML() {
      return [{ tag: 'div[data-slot="dropdown-choice-label"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, {
          "data-slot": "dropdown-choice-label",
        }),
        0,
      ];
    },

    ...(options.addNodeView
      ? {
          addNodeView() {
            return options.addNodeView!();
          },
        }
      : {}),
  });
}

export function createDropdownChoiceNode(options: DropdownChoiceNodeOptions = {}) {
  return Node.create({
    name: "dropdown_choice",
    content: "dropdown_choice_label",
    defining: true,
    isolating: true,
    selectable: false,
    draggable: false,

    addAttributes() {
      return dropdownChoiceAttrs();
    },

    parseHTML() {
      return [{ tag: 'div[data-node="dropdown-choice"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-node": "dropdown-choice" }), 0];
    },

    ...(options.addNodeView
      ? {
          addNodeView() {
            return options.addNodeView!();
          },
        }
      : {}),
  });
}

export function createDropdownChoicesGroupNode(options: DropdownChoiceNodeOptions = {}) {
  return Node.create({
    name: "dropdown_choices_group",
    content: "dropdown_choice+",
    defining: true,
    isolating: true,
    selectable: false,

    parseHTML() {
      return [{ tag: 'div[data-slot="dropdown-choices-group"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, {
          "data-slot": "dropdown-choices-group",
        }),
        0,
      ];
    },

    ...(options.addNodeView
      ? {
          addNodeView() {
            return options.addNodeView!();
          },
        }
      : {}),
  });
}
