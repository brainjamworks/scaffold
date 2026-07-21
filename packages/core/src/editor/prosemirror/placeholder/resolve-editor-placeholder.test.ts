// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";

describe("editor placeholder resolver", () => {
  it("resolves block-owned field placeholders through block definitions", () => {
    const editor = new Editor({
      extensions: [...createCourseDocumentAuthoringExtensions({ editable: true })],
      content: {
        type: "doc",
        content: [
          {
            type: "courseDocument",
            content: [
              {
                type: "surface",
                attrs: {
                  id: "surface-placeholder-test",
                  variant: "page-default",
                },
                content: [
                  {
                    type: "callout",
                    attrs: { id: "callout-placeholder-test" },
                    content: [
                      {
                        type: "callout_title",
                        content: [{ type: "paragraph" }],
                      },
                      {
                        type: "callout_prompt",
                        content: [{ type: "paragraph" }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    document.body.append(editor.view.dom);

    expect(
      editor.view.dom.querySelector('p[data-placeholder="Enter your callout title"]'),
    ).not.toBeNull();
    expect(
      editor.view.dom.querySelector('p[data-placeholder="Write a short note for learners"]'),
    ).not.toBeNull();

    editor.destroy();
  });

  it("resolves empty assessment title and instruction placeholders through the owning definition", () => {
    const editor = new Editor({
      extensions: [...createCourseDocumentAuthoringExtensions({ editable: true })],
      content: {
        type: "doc",
        content: [
          {
            type: "courseDocument",
            content: [
              {
                type: "surface",
                attrs: {
                  id: "surface-assessment-placeholder-test",
                  variant: "page-default",
                },
                content: [
                  {
                    type: "mcq",
                    attrs: {
                      id: "mcq-placeholder-test",
                      assessment: { correctOptionId: "choice-a" },
                    },
                    content: [
                      { type: "assessment_title", content: [{ type: "paragraph" }] },
                      { type: "assessment_instructions", content: [{ type: "paragraph" }] },
                      { type: "assessment_prompt", content: [{ type: "paragraph" }] },
                      {
                        type: "assessment_choices_group",
                        content: [
                          {
                            type: "selectable_choice",
                            attrs: { id: "choice-a" },
                            content: [
                              {
                                type: "selectable_choice_body",
                                content: [{ type: "paragraph" }],
                              },
                            ],
                          },
                        ],
                      },
                      {
                        type: "assessment_actions_group",
                        content: [
                          { type: "assessment_hints_group" },
                          { type: "assessment_summary_feedback" },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    document.body.append(editor.view.dom);

    for (const placeholder of [
      "Enter your question title",
      "Enter your instructions",
      "Ask your question",
      "Enter your choice",
    ]) {
      expect(editor.view.dom.querySelector(`p[data-placeholder="${placeholder}"]`)).not.toBeNull();
    }

    editor.destroy();
  });

  it("resolves placeholders for editorial field blocks", () => {
    const editor = new Editor({
      extensions: [...createCourseDocumentAuthoringExtensions({ editable: true })],
      content: {
        type: "doc",
        content: [
          {
            type: "courseDocument",
            content: [
              {
                type: "surface",
                attrs: {
                  id: "surface-editorial-placeholder-test",
                  variant: "page-default",
                },
                content: [
                  {
                    type: "pull_quote",
                    attrs: { id: "pull-quote-placeholder-test" },
                    content: [
                      {
                        type: "pull_quote_body",
                        content: [{ type: "paragraph" }],
                      },
                      {
                        type: "pull_quote_attribution",
                        content: [{ type: "paragraph" }],
                      },
                    ],
                  },
                  {
                    type: "stat_highlight",
                    attrs: { id: "stat-placeholder-test" },
                    content: [
                      {
                        type: "stat_highlight_value",
                        content: [{ type: "paragraph" }],
                      },
                      {
                        type: "stat_highlight_label",
                        content: [{ type: "paragraph" }],
                      },
                      {
                        type: "stat_highlight_context",
                        content: [{ type: "paragraph" }],
                      },
                    ],
                  },
                  {
                    type: "chapter_epigraph",
                    attrs: { id: "epigraph-placeholder-test" },
                    content: [
                      {
                        type: "chapter_epigraph_body",
                        content: [{ type: "paragraph" }],
                      },
                      {
                        type: "chapter_epigraph_attribution",
                        content: [{ type: "paragraph" }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    document.body.append(editor.view.dom);

    for (const placeholder of [
      "Write the pull quote",
      "Attribution",
      "Key statistic",
      "Short label",
      "Add context for learners",
      "Write the opener quote",
    ]) {
      expect(editor.view.dom.querySelector(`p[data-placeholder="${placeholder}"]`)).not.toBeNull();
    }

    editor.destroy();
  });

  it("resolves placeholders for editorial blocks with nested block containers", () => {
    const editor = new Editor({
      extensions: [...createCourseDocumentAuthoringExtensions({ editable: true })],
      content: {
        type: "doc",
        content: [
          {
            type: "courseDocument",
            content: [
              {
                type: "surface",
                attrs: {
                  id: "surface-container-placeholder-test",
                  variant: "page-default",
                },
                content: [
                  {
                    type: "marginalia",
                    attrs: { id: "marginalia-placeholder-test" },
                    content: [
                      {
                        type: "marginalia_gutter",
                        content: [{ type: "paragraph" }],
                      },
                      {
                        type: "marginalia_main",
                        content: [{ type: "paragraph" }],
                      },
                    ],
                  },
                  {
                    type: "text_wrap_image",
                    attrs: { id: "text-wrap-placeholder-test" },
                    content: [
                      {
                        type: "text_wrap_image_body",
                        content: [{ type: "paragraph" }],
                      },
                    ],
                  },
                  {
                    type: "annotated_figure",
                    attrs: { id: "annotated-placeholder-test" },
                    content: [
                      { type: "annotated_figure_canvas" },
                      {
                        type: "annotated_figure_legend",
                        content: [
                          {
                            type: "annotated_figure_annotation",
                            attrs: { id: "annotated-placeholder-item-test", x: 50, y: 50 },
                            content: [{ type: "paragraph" }],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    document.body.append(editor.view.dom);

    for (const placeholder of [
      "Write a margin note",
      "Write the main content",
      "Write the text that wraps around the image",
      "Describe a numbered pin",
    ]) {
      const placeholderNode = editor.view.dom.querySelector(`p[data-placeholder="${placeholder}"]`);
      if (!placeholderNode) {
        throw new Error(`Missing placeholder: ${placeholder}`);
      }
    }

    editor.destroy();
  });

  it("resolves cover slide placeholders through surface slots", () => {
    const editor = new Editor({
      extensions: createCourseDocumentAuthoringExtensions({ editable: true }),
      content: {
        type: "doc",
        content: [
          {
            type: "courseDocument",
            attrs: { mode: "slideshow" },
            content: [
              {
                type: "surface",
                attrs: {
                  id: "surface-cover-placeholder-test",
                  variant: "slide-cover",
                },
                content: [
                  {
                    type: "surface_header",
                    content: [
                      {
                        type: "surface_header_footer_slot",
                        attrs: { position: "left" },
                        content: [{ type: "paragraph" }],
                      },
                      {
                        type: "surface_header_footer_slot",
                        attrs: { position: "center" },
                        content: [{ type: "paragraph" }],
                      },
                      {
                        type: "surface_header_footer_slot",
                        attrs: { position: "right" },
                        content: [{ type: "paragraph" }],
                      },
                    ],
                  },
                  {
                    type: "heading",
                    attrs: { level: 1 },
                  },
                  {
                    type: "slide_cover_subtitle",
                    content: [{ type: "paragraph" }],
                  },
                  {
                    type: "surface_footer",
                    content: [
                      {
                        type: "surface_header_footer_slot",
                        attrs: { position: "left" },
                        content: [{ type: "paragraph" }],
                      },
                      {
                        type: "surface_header_footer_slot",
                        attrs: { position: "center" },
                        content: [{ type: "paragraph" }],
                      },
                      {
                        type: "surface_header_footer_slot",
                        attrs: { position: "right" },
                        content: [{ type: "paragraph" }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    document.body.append(editor.view.dom);

    expect(editor.view.dom.querySelector('h1[data-placeholder="Lesson title"]')).not.toBeNull();
    expect(editor.view.dom.querySelector('p[data-placeholder="Short description"]')).not.toBeNull();
    expect(editor.view.dom.querySelectorAll('p[data-placeholder="Header"]')).toHaveLength(3);
    expect(editor.view.dom.querySelectorAll('p[data-placeholder="Footer"]')).toHaveLength(3);
    expect(editor.view.dom.querySelector('p[data-placeholder="Brand"]')).toBeNull();
    expect(editor.view.dom.querySelector('p[data-placeholder="Label"]')).toBeNull();
    expect(editor.view.dom.querySelector('p[data-placeholder="Details"]')).toBeNull();
    expect(
      editor.view.dom.querySelector('[data-header-footer-slot-position="left"]'),
    ).not.toBeNull();
    expect(
      editor.view.dom.querySelector('[data-header-footer-slot-position="center"]'),
    ).not.toBeNull();
    expect(
      editor.view.dom.querySelector('[data-header-footer-slot-position="right"]'),
    ).not.toBeNull();

    editor.destroy();
  });
});
