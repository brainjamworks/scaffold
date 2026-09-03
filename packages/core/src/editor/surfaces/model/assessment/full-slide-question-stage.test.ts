// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";

import { builtInSurfaceVariantRegistry } from "../built-in-surface-variant-definitions";
import {
  fullSlideQuestionFamilyForNodeType,
  fullSlideQuestionStageAttributes,
  type FullSlideQuestionFamily,
} from "./full-slide-question-stage";

const QUESTION_FAMILIES = [
  ["surface_multiple_choice_question", "multiple-choice", "slide-multiple-choice-question"],
  ["surface_multiselect_question", "multiselect", "slide-multiselect-question"],
  ["surface_dropdown_question", "dropdown", "slide-dropdown-question"],
  ["surface_fill_blanks_question", "fill-blanks", "slide-fill-blanks-question"],
  ["surface_categorise_question", "categorise", "slide-categorise-question"],
  ["surface_sequencing_question", "sequencing", "slide-sequencing-question"],
  ["surface_matching_question", "matching", "slide-matching-question"],
  ["surface_image_hotspot_question", "image-hotspot", "slide-image-hotspot-question"],
  ["surface_drag_drop_question", "drag-drop", "slide-drag-drop-question"],
] as const satisfies ReadonlyArray<readonly [string, FullSlideQuestionFamily, string]>;

describe("full-slide question stage identity", () => {
  it.each(QUESTION_FAMILIES)("maps %s to the %s family stage", (nodeType, family) => {
    expect(fullSlideQuestionFamilyForNodeType(nodeType)).toBe(family);
    expect(fullSlideQuestionStageAttributes(nodeType)).toEqual({
      "data-full-slide-question-stage": "",
      "data-full-slide-question-family": family,
    });
  });

  it("keeps unsupported registered node types observable", () => {
    expect(() => fullSlideQuestionFamilyForNodeType("unsupported_surface_question")).toThrow(
      'Unsupported full-slide question node type "unsupported_surface_question".',
    );
  });

  it("renders view-only stage attributes without changing private document data", () => {
    const composition = createCoreScaffoldAuthoringComposition();
    const surfaces = QUESTION_FAMILIES.map(([, , variantId]) => {
      const definition = builtInSurfaceVariantRegistry.get(variantId);
      if (!definition) throw new Error(`Expected ${variantId} Surface definition.`);
      return definition.createSurface({ surfaceId: createEmbeddedNodeId() });
    });
    const editor = new Editor({
      extensions: createCourseDocumentAuthoringExtensions({ editable: true, composition }),
      content: {
        type: "doc",
        content: [
          {
            type: "courseDocument",
            attrs: { mode: "slideshow" },
            content: [
              { type: "courseSection", attrs: { id: createEmbeddedNodeId(), title: "Questions" } },
              ...surfaces,
            ],
          },
        ],
      },
    });

    try {
      const portableDocument = editor.getJSON();
      const rendered = document.createElement("div");
      rendered.innerHTML = editor.getHTML();

      for (const [nodeType, family] of QUESTION_FAMILIES) {
        const stage = rendered.querySelector(`[data-node="${nodeType}"]`);
        expect(stage).not.toBeNull();
        expect(stage).toHaveAttribute("data-full-slide-question-stage", "");
        expect(stage).toHaveAttribute("data-full-slide-question-family", family);
        expect(builtInBlockRegistry.getByNodeType(nodeType)).toBeUndefined();
      }

      editor.commands.setContent(portableDocument);
      expect(editor.getJSON()).toEqual(portableDocument);
    } finally {
      editor.destroy();
    }
  });
});
