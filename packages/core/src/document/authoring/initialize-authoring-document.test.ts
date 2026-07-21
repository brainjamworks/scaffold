// @vitest-environment happy-dom

import Collaboration from "@tiptap/extension-collaboration";
import { Editor, type JSONContent } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vite-plus/test";
import * as Y from "yjs";

import { COURSE_DOCUMENT_FRAGMENT } from "@/document/model/constants";
import { createScaffoldDocumentContent } from "@/format/artifact";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { initializeAuthoringCourseDocumentFragment } from "./initialize-authoring-document";

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) {
    editor.destroy();
  }
});

describe("initializeAuthoringCourseDocumentFragment", () => {
  it("seeds saved authoring content with private assessment child nodes", () => {
    const doc = new Y.Doc();

    expect(() =>
      initializeAuthoringCourseDocumentFragment(doc, authoringDocumentWithMcq()),
    ).not.toThrow();

    const editor = new Editor({
      extensions: [
        ...createCourseDocumentAuthoringExtensions({ editable: true }),
        Collaboration.configure({
          document: doc,
          field: COURSE_DOCUMENT_FRAGMENT,
        }),
      ],
    });
    editors.push(editor);

    const json = editor.getJSON();
    const mcq = childAt(childAt(childAt(json, 0), 0), 0);

    expect(editor.schema.nodes["assessment_title"]).toBeDefined();
    expect(mcq?.type).toBe("mcq");
    expect(mcq?.content?.map((node) => node.type)).toEqual([
      "assessment_title",
      "assessment_instructions",
      "assessment_prompt",
      "assessment_choices_group",
      "assessment_actions_group",
    ]);
    expect(mcq?.content?.[4]?.content?.map((node) => node.type)).toEqual([
      "assessment_hints_group",
      "assessment_summary_feedback",
    ]);
  });
});

function authoringDocumentWithMcq(): JSONContent {
  const document = createScaffoldDocumentContent({
    mode: "page",
    surfaceId: "surface-mcq",
  });
  const surface = childAt(childAt(document, 0), 0);
  if (!surface) {
    throw new Error("expected default page surface");
  }

  surface.content = [
    {
      type: "mcq",
      attrs: {
        id: "mcq-1",
        assessment: {
          correctOptionId: "choice-a",
          summaryFeedback: null,
          choiceFeedback: {},
        },
      },
      content: [
        {
          type: "assessment_title",
          content: [{ type: "paragraph" }],
        },
        {
          type: "assessment_instructions",
          content: [{ type: "paragraph" }],
        },
        {
          type: "assessment_prompt",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Pick one" }],
            },
          ],
        },
        {
          type: "assessment_choices_group",
          content: [
            {
              type: "selectable_choice",
              attrs: { id: "choice-a" },
              content: [
                {
                  type: "selectable_choice_body",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "A" }],
                    },
                  ],
                },
              ],
            },
            {
              type: "selectable_choice",
              attrs: { id: "choice-b" },
              content: [
                {
                  type: "selectable_choice_body",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "B" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "assessment_actions_group",
          content: [{ type: "assessment_hints_group" }, { type: "assessment_summary_feedback" }],
        },
      ],
    },
  ];

  return document;
}

function childAt(node: JSONContent | undefined, index: number): JSONContent | undefined {
  return node?.content?.[index];
}
