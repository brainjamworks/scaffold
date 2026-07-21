// @vitest-environment jsdom

import { Editor, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import type { JSONContent } from "@tiptap/core";
import { DOMSerializer, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { describe, expect, it } from "vite-plus/test";

import { AssessmentHintNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hint";
import { AssessmentPromptNode } from "@/editor/blocks/assessment/shared/nodes/assessment-prompt";
import { isFieldContentEmpty } from "@/document/model/content-model/is-field-content-empty";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import {
  SelectableChoiceBodyNode,
  SelectableChoiceNode,
  selectableChoiceBodyContent,
} from "@/editor/blocks/assessment/shared/nodes/selectable-choice";
import {
  sanitizeAuthoredStaticRichTextHtml,
  sanitizeRenderedStaticRichTextHtml,
} from "@/editor/rich-text/static/sanitize-html";
import { isSafeRichTextLinkUri } from "@/editor/rich-text/model/link-safety";
import { serializeStaticRichTextHtml } from "@/editor/rich-text/static/render-rich-text";
import { MathInlineNode } from "@/editor/rich-text/math/authoring/MathInlineNodeView";
import { VocabularyTermStaticNode } from "@/editor/rich-text/vocabulary-term/static/VocabularyTermStaticNode";

/**
 * Test-only composite container. Mirrors the structural shape MCQ will
 * have in Phase 3, sized just enough to verify the shared nodes work
 * inside a parent that names them.
 */
const TestContainerNode = Node.create({
  name: "test_container",
  group: "block",
  content: "assessment_prompt selectable_choice+ assessment_hint*",
  parseHTML() {
    return [{ tag: 'div[data-node="test_container"]' }];
  },
  renderHTML() {
    return ["div", { "data-node": "test_container" }, 0];
  },
});

function makeEditor() {
  return new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      MathInlineNode,
      VocabularyTermStaticNode,
      AssessmentPromptNode,
      AssessmentHintNode,
      SelectableChoiceBodyNode,
      SelectableChoiceNode,
      TestContainerNode,
    ],
  });
}

function choice(id: string, _isCorrect: boolean, text?: string): JSONContent {
  return {
    type: "selectable_choice",
    attrs: { id },
    content: [
      {
        type: "selectable_choice_body",
        content: [
          text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" },
        ],
      },
    ],
  };
}

function firstNodeByType(editor: Editor, typeName: string): ProseMirrorNode {
  let found: ProseMirrorNode | null = null;
  editor.state.doc.descendants((node) => {
    if (node.type.name !== typeName) return true;
    found = node;
    return false;
  });
  if (!found) throw new Error(`${typeName} not found`);
  return found;
}

describe("shared composite children", () => {
  it("round-trips a composite container with prompt + choices + hints", () => {
    const editor = makeEditor();
    const initial = {
      type: "doc",
      content: [
        {
          type: "test_container",
          content: [
            {
              type: "assessment_prompt",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Pick the prime." }],
                },
              ],
            },
            choice("a", false, "4"),
            choice("b", true, "7"),
            {
              type: "assessment_hint",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "A prime has exactly two divisors." }],
                },
              ],
            },
          ],
        },
      ],
    };
    editor.commands.setContent(initial);
    const json = editor.getJSON();
    const container = json.content?.[0] as JSONContent | undefined;
    expect(container?.type).toBe("test_container");
    expect(container?.content?.length).toBe(4);
    const choices = container?.content as JSONContent[] | undefined;
    expect(choices?.[1]?.attrs).toEqual({ id: "a" });
    expect(choices?.[2]?.attrs).toEqual({ id: "b" });
    editor.destroy();
  });

  it("discards a bare selectable_choice at the document level", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          ...choice("a", false, "Bare choice"),
        },
      ],
    });
    const json = editor.getJSON();
    // Either Tiptap dropped the bare choice and the doc is empty, or it
    // unwrapped it to a paragraph. Both are valid — the contract is
    // "no orphan selectable_choice survives at the top level".
    const topTypes = (json.content ?? []).map((n) => n.type);
    expect(topTypes).not.toContain("selectable_choice");
    editor.destroy();
  });

  it("round-trips selectable_choice attrs through HTML serialisation", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "test_container",
          content: [
            {
              type: "assessment_prompt",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Q" }] }],
            },
            {
              ...choice("xyz-42", true, "C"),
            },
          ],
        },
      ],
    });
    const html = editor.getHTML();
    expect(html).toContain('data-choice-id="xyz-42"');
    expect(html).not.toContain("data-correct");
    editor.destroy();
  });

  it("detects structurally empty rich-content slots", () => {
    const editor = makeEditor();
    const empty = editor.schema.nodeFromJSON({
      type: "assessment_prompt",
      content: [{ type: "paragraph" }],
    });
    const whitespace = editor.schema.nodeFromJSON({
      type: "assessment_prompt",
      content: [{ type: "paragraph", content: [{ type: "text", text: "   " }] }],
    });
    const hardBreakOnly = editor.schema.nodeFromJSON({
      type: "assessment_prompt",
      content: [{ type: "paragraph", content: [{ type: "hardBreak" }] }],
    });
    const text = editor.schema.nodeFromJSON({
      type: "assessment_prompt",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Learners see this." }],
        },
      ],
    });

    expect(isFieldContentEmpty(empty)).toBe(true);
    expect(isFieldContentEmpty(whitespace)).toBe(true);
    expect(isFieldContentEmpty(hardBreakOnly)).toBe(true);
    expect(isFieldContentEmpty(text)).toBe(false);
    editor.destroy();
  });

  it("serialises inline math as static KaTeX HTML", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "test_container",
          content: [
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            {
              type: "selectable_choice",
              attrs: { id: "math-choice" },
              content: [
                {
                  type: "selectable_choice_body",
                  content: [
                    {
                      type: "paragraph",
                      content: [
                        { type: "text", text: "Area " },
                        { type: "inlineMath", attrs: { latex: "x^2" } },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    const choice = firstNodeByType(editor, "selectable_choice");

    const html = serializeStaticRichTextHtml(
      DOMSerializer.fromSchema(editor.schema),
      selectableChoiceBodyContent(choice),
    );

    expect(html).toContain("Area");
    expect(html).toContain("katex");
    editor.destroy();
  });

  it("serialises inline vocabulary terms as visible static text with definition metadata", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "test_container",
          content: [
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            {
              type: "selectable_choice",
              attrs: { id: "vocab-choice" },
              content: [
                {
                  type: "selectable_choice_body",
                  content: [
                    {
                      type: "paragraph",
                      content: [
                        { type: "text", text: "Define " },
                        {
                          type: "vocabTerm",
                          attrs: {
                            term: "schema",
                            definition: "A structural contract for content.",
                          },
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
    });

    const choice = firstNodeByType(editor, "selectable_choice");

    const html = serializeStaticRichTextHtml(
      DOMSerializer.fromSchema(editor.schema),
      selectableChoiceBodyContent(choice),
    );

    expect(html).toContain("Define");
    expect(html).toContain("schema");
    expect(html).toContain('data-type="vocab-term"');
    expect(html).toContain('data-vocab-definition="A structural contract for content."');
    editor.destroy();
  });

  it("sanitizes hostile authored static HTML without stripping normal rich text", () => {
    const html = sanitizeAuthoredStaticRichTextHtml(
      [
        "<p><strong>Safe</strong> <em>text</em></p>",
        '<a href="javascript:alert(1)" onclick="alert(1)">bad link</a>',
        '<img src=x onerror="alert(1)">',
        "<script>alert(1)</script>",
        '<span data-type="vocab-term" data-vocab-term="schema" data-vocab-definition="Definition" style="color:red">schema</span>',
      ].join(""),
    );

    expect(html).toContain("<strong>Safe</strong>");
    expect(html).toContain("<em>text</em>");
    expect(html).toContain("bad link");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("style=");
    expect(html).toContain('data-type="vocab-term"');
    expect(html).toContain('data-vocab-definition="Definition"');
  });

  it("preserves rendered KaTeX structure while dropping active content", () => {
    const html = sanitizeRenderedStaticRichTextHtml(
      [
        '<span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mrow><msup><mi>x</mi><mn>2</mn></msup></mrow><annotation encoding="application/x-tex">x^2</annotation></semantics></math></span><span class="katex-html" aria-hidden="true"><span class="strut" style="height:0.8141em;"></span></span></span>',
        '<svg onload="alert(1)"><circle /></svg>',
      ].join(""),
    );

    expect(html).toContain('class="katex"');
    expect(html).toContain("<math");
    expect(html).toContain('encoding="application/x-tex"');
    expect(html).toContain('style="height:0.8141em;"');
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("onload");
  });

  it("allows only safe rich-text link URI schemes", () => {
    const context = { defaultValidate: () => true };

    expect(isSafeRichTextLinkUri("https://example.com", context)).toBe(true);
    expect(isSafeRichTextLinkUri("http://example.com", context)).toBe(true);
    expect(isSafeRichTextLinkUri("mailto:test@example.com", context)).toBe(true);
    expect(isSafeRichTextLinkUri("/relative/path", context)).toBe(true);
    expect(isSafeRichTextLinkUri("#section", context)).toBe(true);
    expect(isSafeRichTextLinkUri("javascript:alert(1)", context)).toBe(false);
    expect(isSafeRichTextLinkUri("data:text/html,<script>alert(1)</script>", context)).toBe(false);
  });
});
