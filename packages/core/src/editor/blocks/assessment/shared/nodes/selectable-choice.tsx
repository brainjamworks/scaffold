import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  McqPrivateAssessmentSchema,
  MultiselectPrivateAssessmentSchema,
  type AssessmentFeedbackContent,
  type McqPrivateAssessment,
  type MultiselectPrivateAssessment,
} from "@scaffold/contracts";
import { SelectableChoiceAttrsSchema } from "@/schemas/shared";

import {
  fieldContainerSpec,
  textContentExpression,
} from "@/document/model/content-model/content-groups";
import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";

const SELECTABLE_CHOICE_BODY_CONTENT = textContentExpression();

export type ChoiceAssessmentParent =
  | {
      typeName: "mcq";
      pos: number;
      node: ProseMirrorNode;
    }
  | {
      typeName: "multiselect";
      pos: number;
      node: ProseMirrorNode;
    };

export interface PrivateChoiceState {
  isCorrect: boolean;
  feedback: AssessmentFeedbackContent | null;
}

export const emptyPrivateChoiceState: PrivateChoiceState = {
  isCorrect: false,
  feedback: null,
};

export interface SelectableChoiceNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function resolveChoiceAssessmentParent(
  editor: Editor,
  choicePos: number,
): ChoiceAssessmentParent | null {
  if (!isValidEditorDocPos(editor, choicePos)) return null;
  const $pos = editor.state.doc.resolve(choicePos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name !== "mcq" && node.type.name !== "multiselect") continue;
    return {
      typeName: node.type.name,
      pos: $pos.before(depth),
      node,
    };
  }
  return null;
}

export function setParentAssessment(
  editor: Editor,
  parent: ChoiceAssessmentParent,
  assessment: McqPrivateAssessment | MultiselectPrivateAssessment,
) {
  editor.view.dispatch(
    editor.state.tr.setNodeMarkup(parent.pos, null, {
      ...parent.node.attrs,
      assessment,
    }),
  );
}

export function readPrivateChoiceState(
  editor: Editor,
  choicePos: number,
  choiceId: string,
): PrivateChoiceState {
  if (!choiceId) return emptyPrivateChoiceState;
  const parent = resolveChoiceAssessmentParent(editor, choicePos);
  if (!parent) return emptyPrivateChoiceState;

  if (parent.typeName === "mcq") {
    const assessment = McqPrivateAssessmentSchema.parse(parent.node.attrs["assessment"] ?? {});
    return {
      isCorrect: assessment.correctOptionId === choiceId,
      feedback: assessment.feedbackByOptionId[choiceId] ?? null,
    };
  }

  const assessment = MultiselectPrivateAssessmentSchema.parse(
    parent.node.attrs["assessment"] ?? {},
  );
  return {
    isCorrect: assessment.correctOptionIds.includes(choiceId),
    feedback: assessment.feedbackByOptionId[choiceId] ?? null,
  };
}

export function setPrivateChoiceFeedback(
  editor: Editor,
  choicePos: number,
  choiceId: string,
  feedback: AssessmentFeedbackContent | null,
) {
  if (!choiceId) return;
  const parent = resolveChoiceAssessmentParent(editor, choicePos);
  if (!parent) return;

  if (parent.typeName === "mcq") {
    const assessment = McqPrivateAssessmentSchema.parse(parent.node.attrs["assessment"] ?? {});
    setParentAssessment(editor, parent, {
      ...assessment,
      feedbackByOptionId: nextFeedbackByOptionId(assessment.feedbackByOptionId, choiceId, feedback),
    });
    return;
  }

  const assessment = MultiselectPrivateAssessmentSchema.parse(
    parent.node.attrs["assessment"] ?? {},
  );
  setParentAssessment(editor, parent, {
    ...assessment,
    feedbackByOptionId: nextFeedbackByOptionId(assessment.feedbackByOptionId, choiceId, feedback),
  });
}

function nextFeedbackByOptionId(
  current: Record<string, AssessmentFeedbackContent>,
  choiceId: string,
  feedback: AssessmentFeedbackContent | null,
): Record<string, AssessmentFeedbackContent> {
  const next = { ...current };
  if (feedback) next[choiceId] = feedback;
  else delete next[choiceId];
  return next;
}

/**
 * Author-side correctness toggle for a selectable_choice. Correctness is
 * stored on the ancestor assessment block's private `attrs.assessment`
 * payload, while the choice node remains visible document content only.
 */
export function toggleChoiceCorrect(editor: Editor, choicePos: number): boolean {
  if (!isValidEditorDocPos(editor, choicePos)) return false;
  const node = editor.state.doc.nodeAt(choicePos);
  if (!node || node.type.name !== "selectable_choice") return false;
  const attrs = SelectableChoiceAttrsSchema.safeParse(node.attrs);
  if (!attrs.success || !attrs.data.id) return false;

  const parent = resolveChoiceAssessmentParent(editor, choicePos);
  if (!parent) return false;

  if (parent.typeName === "mcq") {
    const assessment = McqPrivateAssessmentSchema.parse(parent.node.attrs["assessment"] ?? {});
    if (assessment.correctOptionId === attrs.data.id) return false;
    setParentAssessment(editor, parent, {
      ...assessment,
      correctOptionId: attrs.data.id,
    });
    return true;
  }

  const assessment = MultiselectPrivateAssessmentSchema.parse(
    parent.node.attrs["assessment"] ?? {},
  );
  const correctIds = new Set(assessment.correctOptionIds);
  const isCurrentlyCorrect = correctIds.has(attrs.data.id);
  if (isCurrentlyCorrect && correctIds.size <= 1) return false;
  if (isCurrentlyCorrect) correctIds.delete(attrs.data.id);
  else correctIds.add(attrs.data.id);

  setParentAssessment(editor, parent, {
    ...assessment,
    correctOptionIds: [...correctIds],
  });
  return true;
}

/**
 * Rich author-owned choice body. Kept as a named field container so choice
 * feedback can be a separate rich field without storing prose in attrs.
 */
export const SelectableChoiceBodyNode = Node.create({
  name: "selectable_choice_body",
  ...fieldContainerSpec({ content: SELECTABLE_CHOICE_BODY_CONTENT }),

  parseHTML() {
    return [{ tag: 'div[data-slot="selectable-choice-body"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-slot": "selectable-choice-body",
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SelectableChoiceBodyNodeView);
  },
});

function SelectableChoiceBodyNodeView() {
  return (
    <NodeViewWrapper data-slot="selectable-choice-body">
      <NodeViewContent />
    </NodeViewWrapper>
  );
}

/**
 * Shared assessment child schema: a selectable choice with field-owned visible
 * body content. Used by MCQ and Multiselect. Correctness and gated feedback are
 * owned by the ancestor assessment block's private attrs.
 */
export function createSelectableChoiceNode(options: SelectableChoiceNodeOptions = {}) {
  return Node.create({
    name: "selectable_choice",
    content: "selectable_choice_body",
    defining: true,
    isolating: true,
    selectable: false,
    draggable: false,

    addAttributes() {
      return {
        id: {
          default: "",
          parseHTML: (el: HTMLElement) => el.getAttribute("data-choice-id") ?? "",
          renderHTML: (attrs: { id: string }) => ({
            "data-choice-id": attrs.id,
          }),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'div[data-node="selectable-choice"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-node": "selectable-choice" }), 0];
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

export const SelectableChoiceNode = createSelectableChoiceNode();

export function selectableChoiceBodyContent(node: ProseMirrorNode): Fragment {
  const body = findChildByType(node, "selectable_choice_body");
  return body?.content ?? Fragment.empty;
}

function findChildByType(node: ProseMirrorNode, typeName: string): ProseMirrorNode | null {
  let found: ProseMirrorNode | null = null;
  node.forEach((child) => {
    if (found || child.type.name !== typeName) return;
    found = child;
  });
  return found;
}
