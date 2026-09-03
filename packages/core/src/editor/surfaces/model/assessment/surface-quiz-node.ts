import {
  DragDropCanvasDataSchema,
  ImageHotspotCanvasDataSchema,
  QuizSettingsSchema,
  type QuizSettings,
} from "@scaffold/contracts";
import { Node, mergeAttributes } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { BLOCK_CONTENT } from "@/document/model/content-model/content-groups";
import {
  matchFixedSurfaceChildren,
  snapshotSurfaceStructureChildrenFromProseMirror,
} from "@/editor/surfaces/model/policies/surface-fixed-structure";

import { SURFACE_CATEGORISE_QUESTION_NODE_TYPE } from "./surface-categorise-question-node";
import { SURFACE_DROPDOWN_QUESTION_NODE_TYPE } from "./surface-dropdown-question-node";
import { SURFACE_DRAG_DROP_QUESTION_NODE_TYPE } from "./surface-drag-drop-question-node";
import { SURFACE_FILL_BLANKS_QUESTION_NODE_TYPE } from "./surface-fill-blanks-question-node";
import { SURFACE_IMAGE_HOTSPOT_QUESTION_NODE_TYPE } from "./surface-image-hotspot-question-node";
import { SURFACE_MATCHING_QUESTION_NODE_TYPE } from "./surface-matching-question-node";
import { SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE } from "./surface-multiple-choice-question-node";
import { SURFACE_MULTISELECT_QUESTION_NODE_TYPE } from "./surface-multiselect-question-node";
import { SURFACE_SEQUENCING_QUESTION_NODE_TYPE } from "./surface-sequencing-question-node";

export const SURFACE_QUIZ_NODE_TYPE = "surface_quiz";

export const SURFACE_QUIZ_QUESTION_NODE_TYPES = Object.freeze([
  SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE,
  SURFACE_MULTISELECT_QUESTION_NODE_TYPE,
  SURFACE_DROPDOWN_QUESTION_NODE_TYPE,
  SURFACE_DRAG_DROP_QUESTION_NODE_TYPE,
  SURFACE_FILL_BLANKS_QUESTION_NODE_TYPE,
  SURFACE_CATEGORISE_QUESTION_NODE_TYPE,
  SURFACE_SEQUENCING_QUESTION_NODE_TYPE,
  SURFACE_MATCHING_QUESTION_NODE_TYPE,
  SURFACE_IMAGE_HOTSPOT_QUESTION_NODE_TYPE,
] as const);

export function requireSurfaceQuizChild(surface: ProseMirrorNode): ProseMirrorNode {
  const match = matchFixedSurfaceChildren(
    snapshotSurfaceStructureChildrenFromProseMirror(surface),
    [{ type: SURFACE_QUIZ_NODE_TYPE }],
  );
  if (!match.exact) {
    throw new Error("Quiz Surface requires exactly one private Quiz child.");
  }

  for (let index = 0; index < surface.childCount; index += 1) {
    const child = surface.child(index);
    if (child.type.name === SURFACE_QUIZ_NODE_TYPE) return child;
  }
  throw new Error("Quiz Surface requires exactly one private Quiz child.");
}

/**
 * Returns the stable keys of authored Quiz questions that cannot yet be shown
 * to a learner. This is local authoring readiness, not a publication
 * diagnostic: an image-hotspot question is intentionally incomplete until its
 * image has been chosen.
 */
export function surfaceQuizQuestionKeysNeedingSetup(quiz: ProseMirrorNode): string[] {
  if (quiz.type.name !== SURFACE_QUIZ_NODE_TYPE) {
    throw new Error(`Expected a private Quiz node, received "${quiz.type.name}".`);
  }

  const keys: string[] = [];
  for (let index = 0; index < quiz.childCount; index += 1) {
    const question = quiz.child(index);
    if (!surfaceQuizQuestionNeedsSetup(question)) continue;
    const id = question.attrs["id"];
    if (typeof id !== "string" || !id.trim()) {
      throw new Error("Quiz question needing setup is missing its stable id.");
    }
    keys.push(id);
  }
  return keys;
}

export function surfaceQuizQuestionNeedsSetup(question: ProseMirrorNode): boolean {
  if (question.type.name === SURFACE_IMAGE_HOTSPOT_QUESTION_NODE_TYPE) {
    const canvas = requireQuizCanvas(question, "image_hotspot_canvas", "image-hotspot");
    return ImageHotspotCanvasDataSchema.parse(canvas.attrs["data"] ?? {}).image === null;
  }
  if (question.type.name === SURFACE_DRAG_DROP_QUESTION_NODE_TYPE) {
    const canvas = requireQuizCanvas(question, "drag_drop_canvas", "Drag and Drop");
    const data = DragDropCanvasDataSchema.parse(canvas.attrs["data"] ?? {});
    return data.image === null || data.imageAspectRatio === null;
  }
  return false;
}

function requireQuizCanvas(
  question: ProseMirrorNode,
  canvasNodeType: string,
  label: string,
): ProseMirrorNode {
  let canvas: ProseMirrorNode | null = null;
  for (let index = 0; index < question.childCount; index += 1) {
    const child = question.child(index);
    if (child.type.name !== canvasNodeType) continue;
    if (canvas) throw new Error(`Quiz ${label} question contains more than one canvas.`);
    canvas = child;
  }
  if (!canvas) throw new Error(`Quiz ${label} question is missing its canvas.`);
  return canvas;
}

const SURFACE_QUIZ_CONTENT = `(${SURFACE_QUIZ_QUESTION_NODE_TYPES.join(" | ")})*`;

export const SurfaceQuizNode = Node.create({
  name: SURFACE_QUIZ_NODE_TYPE,
  group: BLOCK_CONTENT,
  content: SURFACE_QUIZ_CONTENT,
  defining: true,
  isolating: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    const settingsDefault: QuizSettings = QuizSettingsSchema.parse({});
    return {
      id: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-id"),
        renderHTML: (attrs: { id?: unknown }) =>
          typeof attrs.id === "string" && attrs.id.length > 0 ? { "data-id": attrs.id } : {},
      },
      settings: {
        default: settingsDefault,
        parseHTML: (element: HTMLElement) => {
          const raw = element.getAttribute("data-quiz-settings");
          if (!raw) return settingsDefault;
          try {
            const parsed = QuizSettingsSchema.safeParse(JSON.parse(raw));
            return parsed.success ? parsed.data : settingsDefault;
          } catch {
            return settingsDefault;
          }
        },
        renderHTML: (attrs: { settings: QuizSettings }) => ({
          "data-quiz-settings": JSON.stringify(attrs.settings),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: `section[data-node="${SURFACE_QUIZ_NODE_TYPE}"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "section",
      mergeAttributes(HTMLAttributes, {
        "data-node": SURFACE_QUIZ_NODE_TYPE,
        "data-surface-quiz": "",
      }),
      0,
    ];
  },
});
