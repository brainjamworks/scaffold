// @vitest-environment happy-dom

import { Node } from "@tiptap/core";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import {
  ASSESSMENT_QUESTION_CONTENT,
  ARRANGEMENT_CONTENT,
  BLOCK_CONTENT,
  CELL_ARRANGEMENT_CONTENT,
  COURSE_BLOCK_CONTENT,
  FILL_BLANK_INLINE_CONTENT,
  INLINE_CONTENT,
  SECTION_ARRANGEMENT_CONTENT,
  TEXT_CONTENT,
  fieldContainerSpec,
  textContentExpression,
} from "./content-groups";
import { RICH_CONTENT, richContentExpression, type RichContentExpressionOptions } from "./index";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import {
  ExtendedBlockquote,
  ExtendedBulletList,
  ExtendedCodeBlock,
  ExtendedHeading,
  ExtendedHorizontalRule,
  ExtendedListItem,
  ExtendedOrderedList,
} from "@/editor/rich-text/model/rich-text-blocks";

const TestDoc = Node.create({
  name: "doc",
  topNode: true,
  content: "test_field test_optional_field? test_curated_field test_optional_curated_field?",
  renderHTML() {
    return ["div", { "data-test-doc": "" }, 0];
  },
});

const TestField = Node.create({
  name: "test_field",
  ...fieldContainerSpec(),
  renderHTML() {
    return ["div", { "data-test-field": "" }, 0];
  },
});

const TestOptionalField = Node.create({
  name: "test_optional_field",
  ...fieldContainerSpec({ required: false }),
  renderHTML() {
    return ["div", { "data-test-optional-field": "" }, 0];
  },
});

const TestRichContentField = Node.create({
  name: "test_curated_field",
  content: richContentExpression(),
  defining: true,
  isolating: true,
  selectable: false,
  renderHTML() {
    return ["div", { "data-test-rich-content-field": "" }, 0];
  },
});

const TestOptionalRichContentField = Node.create({
  name: "test_optional_curated_field",
  content: richContentExpression({ required: false }),
  defining: true,
  isolating: true,
  selectable: false,
  renderHTML() {
    return ["div", { "data-test-optional-rich-content-field": "" }, 0];
  },
});

const TestFillBlankBody = Node.create({
  name: "test_fill_blank_body",
  content: `${FILL_BLANK_INLINE_CONTENT}+`,
  renderHTML() {
    return ["div", { "data-test-fill-blank-body": "" }, 0];
  },
});

const TestTextContentImage = Node.create({
  name: "test_text_content_image",
  group: TEXT_CONTENT,
  renderHTML() {
    return ["div", { "data-test-field-image": "" }];
  },
});

const TestTextContentMath = Node.create({
  name: "test_text_content_math",
  group: TEXT_CONTENT,
  renderHTML() {
    return ["div", { "data-test-field-math": "" }];
  },
});

const TestTextContentCode = Node.create({
  name: "test_text_content_code",
  group: TEXT_CONTENT,
  renderHTML() {
    return ["pre", { "data-test-field-code": "" }, ["code", 0]];
  },
});

const TestPlainBlock = Node.create({
  name: "test_plain_block",
  group: BLOCK_CONTENT,
  content: "paragraph",
  renderHTML() {
    return ["div", { "data-test-plain-block": "" }, 0];
  },
});

const TestCourseBlock = Node.create({
  name: "test_course_block",
  group: `${BLOCK_CONTENT} ${COURSE_BLOCK_CONTENT}`,
  content: "paragraph",
  renderHTML() {
    return ["div", { "data-test-course-block": "" }, 0];
  },
});

const TestRichContentBlock = Node.create({
  name: "test_opted_in_block",
  group: `${BLOCK_CONTENT} ${COURSE_BLOCK_CONTENT} ${RICH_CONTENT}`,
  content: "paragraph",
  renderHTML() {
    return ["div", { "data-test-rich-content-block": "" }, 0];
  },
});

const TestAssessmentQuestionBlock = Node.create({
  name: "test_assessment_question_block",
  group: `${BLOCK_CONTENT} ${COURSE_BLOCK_CONTENT} ${ASSESSMENT_QUESTION_CONTENT}`,
  content: "paragraph",
  renderHTML() {
    return ["div", { "data-test-assessment-question-block": "" }, 0];
  },
});

const TestArrangement = Node.create({
  name: "test_arrangement",
  group: ARRANGEMENT_CONTENT,
  renderHTML() {
    return ["div", { "data-test-arrangement": "" }];
  },
});

function makeFieldEditor() {
  return new Editor({
    extensions: [
      TestDoc,
      StarterKit.configure({
        document: false,
        paragraph: false,
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        undoRedo: false,
      }),
      ExtendedParagraph,
      ExtendedHeading,
      ExtendedBulletList,
      ExtendedOrderedList,
      ExtendedListItem,
      ExtendedBlockquote,
      ExtendedCodeBlock,
      ExtendedHorizontalRule,
      TestField,
      TestOptionalField,
      TestRichContentField,
      TestOptionalRichContentField,
      TestFillBlankBody,
      TestTextContentImage,
      TestTextContentMath,
      TestTextContentCode,
      TestPlainBlock,
      TestCourseBlock,
      TestRichContentBlock,
      TestAssessmentQuestionBlock,
      TestArrangement,
    ],
  });
}

describe("content groups", () => {
  it("exports structural arrangement groups", () => {
    expect(BLOCK_CONTENT).toBe("block");
    expect(COURSE_BLOCK_CONTENT).toBe("course_block");
    expect(ARRANGEMENT_CONTENT).toBe("arrangement");
    expect(CELL_ARRANGEMENT_CONTENT).toBe("cell_arrangement");
    expect(SECTION_ARRANGEMENT_CONTENT).toBe("section_arrangement");
  });

  it("exports authored text and inline content groups", () => {
    expect(TEXT_CONTENT).toBe("text_content");
    expect(RICH_CONTENT).toBe("rich_content");
    expect(INLINE_CONTENT).toBe("inline");
  });

  it("exports fill-blank inline content without a separate rich-text group", () => {
    expect(FILL_BLANK_INLINE_CONTENT).toBe("fill_blank_inline_content");
  });

  it("exports assessment question content for quiz children", () => {
    expect(ASSESSMENT_QUESTION_CONTENT).toBe("assessment_question");
  });

  it("marks assessment question nodes without marking ordinary course blocks", () => {
    const assessmentGroups = groupSet(TestAssessmentQuestionBlock.config.group);
    const courseBlockGroups = groupSet(TestCourseBlock.config.group);

    expect(assessmentGroups.has(BLOCK_CONTENT)).toBe(true);
    expect(assessmentGroups.has(COURSE_BLOCK_CONTENT)).toBe(true);
    expect(assessmentGroups.has(ASSESSMENT_QUESTION_CONTENT)).toBe(true);

    expect(courseBlockGroups.has(BLOCK_CONTENT)).toBe(true);
    expect(courseBlockGroups.has(COURSE_BLOCK_CONTENT)).toBe(true);
    expect(courseBlockGroups.has(ASSESSMENT_QUESTION_CONTENT)).toBe(false);
  });

  it("provides reusable text-content expressions for field containers", () => {
    expect(textContentExpression()).toBe("text_content+");
    expect(textContentExpression({ required: false })).toBe("text_content*");
    expect(fieldContainerSpec()).toMatchObject({
      content: "text_content+",
      defining: true,
      isolating: true,
      selectable: false,
    });
    expect(fieldContainerSpec({ content: "paragraph" })).toMatchObject({
      content: "paragraph",
      defining: true,
      isolating: true,
      selectable: false,
    });
  });

  it("provides reusable mixed text and rich-content expressions", () => {
    const optional: RichContentExpressionOptions = { required: false };

    expect(richContentExpression()).toBe("(text_content | rich_content)+");
    expect(richContentExpression(optional)).toBe("(text_content | rich_content)*");
  });

  it("does not serialize schema-only text or rich-content group names in document JSON", () => {
    const editor = makeFieldEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        { type: "test_field", content: [{ type: "paragraph" }] },
        {
          type: "test_curated_field",
          content: [
            {
              type: "test_opted_in_block",
              content: [{ type: "paragraph" }],
            },
          ],
        },
      ],
    });
    const json = editor.getJSON();

    expect(json).toEqual({
      type: "doc",
      content: [
        { type: "test_field", content: [{ type: "paragraph" }] },
        {
          type: "test_curated_field",
          content: [
            {
              type: "test_opted_in_block",
              content: [{ type: "paragraph" }],
            },
          ],
        },
      ],
    });
    expect(JSON.stringify(json)).not.toContain(TEXT_CONTENT);
    expect(JSON.stringify(json)).not.toContain(RICH_CONTENT);

    editor.destroy();
  });

  it("keeps rich toolbar and supported field nodes in text content", () => {
    const editor = makeFieldEditor();

    expect(editor.schema.nodes["paragraph"]?.spec.group).toBe(
      "block text_content fill_blank_inline_content",
    );
    expect(editor.schema.nodes["heading"]?.spec.group).toBe("block text_content");
    expect(editor.schema.nodes["bulletList"]?.spec.group).toBe("block text_content");
    expect(editor.schema.nodes["orderedList"]?.spec.group).toBe("block text_content");
    expect(editor.schema.nodes["blockquote"]?.spec.group).toBe("block text_content");
    expect(editor.schema.nodes["codeBlock"]?.spec.group).toBe("block text_content");
    expect(editor.schema.nodes["horizontalRule"]?.spec.group).toBe("block text_content");
    expect(editor.schema.nodes["test_text_content_image"]?.spec.group).toBe("text_content");
    expect(editor.schema.nodes["test_text_content_math"]?.spec.group).toBe("text_content");
    expect(editor.schema.nodes["test_text_content_code"]?.spec.group).toBe("text_content");

    editor.destroy();
  });

  it("keeps fill-blank body content limited to paragraph-like textblocks", () => {
    const editor = makeFieldEditor();
    const body = editor.schema.nodes["test_fill_blank_body"];
    const paragraph = editor.schema.nodes["paragraph"]?.createAndFill();
    const image = editor.schema.nodes["test_text_content_image"]?.create();
    const math = editor.schema.nodes["test_text_content_math"]?.create();

    expect(body).toBeDefined();
    expect(paragraph).toBeDefined();
    expect(image).toBeDefined();
    expect(math).toBeDefined();

    expect(() => body?.createChecked(null, [paragraph!])).not.toThrow();
    expect(() => body?.createChecked(null, [image!])).toThrow();
    expect(() => body?.createChecked(null, [math!])).toThrow();

    editor.destroy();
  });

  it("allows curated text content without allowing every block or arrangement", () => {
    const editor = makeFieldEditor();
    const field = editor.schema.nodes["test_field"];
    const optionalField = editor.schema.nodes["test_optional_field"];
    const paragraph = editor.schema.nodes["paragraph"]?.createAndFill();
    const heading = editor.schema.nodes["heading"]?.create({ level: 2 });
    const bulletList = editor.schema.nodes["bulletList"]?.createAndFill();
    const orderedList = editor.schema.nodes["orderedList"]?.createAndFill();
    const blockquote = editor.schema.nodes["blockquote"]?.createAndFill();
    const codeBlock = editor.schema.nodes["codeBlock"]?.create();
    const horizontalRule = editor.schema.nodes["horizontalRule"]?.create();
    const image = editor.schema.nodes["test_text_content_image"]?.create();
    const math = editor.schema.nodes["test_text_content_math"]?.create();
    const code = editor.schema.nodes["test_text_content_code"]?.create();
    const plainBlock = editor.schema.nodes["test_plain_block"]?.createAndFill();
    const courseBlock = editor.schema.nodes["test_course_block"]?.createAndFill();
    const arrangement = editor.schema.nodes["test_arrangement"]?.create();

    expect(field).toBeDefined();
    expect(optionalField).toBeDefined();
    expect(paragraph).toBeDefined();
    expect(heading).toBeDefined();
    expect(bulletList).toBeDefined();
    expect(orderedList).toBeDefined();
    expect(blockquote).toBeDefined();
    expect(codeBlock).toBeDefined();
    expect(horizontalRule).toBeDefined();
    expect(image).toBeDefined();
    expect(math).toBeDefined();
    expect(code).toBeDefined();
    expect(plainBlock).toBeDefined();
    expect(courseBlock).toBeDefined();
    expect(arrangement).toBeDefined();

    expect(() =>
      field?.createChecked(null, [
        paragraph!,
        heading!,
        bulletList!,
        orderedList!,
        blockquote!,
        codeBlock!,
        horizontalRule!,
        image!,
        math!,
        code!,
      ]),
    ).not.toThrow();
    expect(() => optionalField?.createChecked()).not.toThrow();
    expect(() => field?.createChecked(null, [plainBlock!])).toThrow();
    expect(() => field?.createChecked(null, [courseBlock!])).toThrow();
    expect(() => field?.createChecked(null, [arrangement!])).toThrow();

    editor.destroy();
  });

  it("allows only curated text and explicitly opted-in rich blocks in rich content", () => {
    const editor = makeFieldEditor();
    const field = editor.schema.nodes["test_curated_field"];
    const optionalField = editor.schema.nodes["test_optional_curated_field"];
    const paragraph = editor.schema.nodes["paragraph"]?.createAndFill();
    const richBlock = editor.schema.nodes["test_opted_in_block"]?.createAndFill();
    const plainBlock = editor.schema.nodes["test_plain_block"]?.createAndFill();
    const courseBlock = editor.schema.nodes["test_course_block"]?.createAndFill();
    const assessmentBlock = editor.schema.nodes["test_assessment_question_block"]?.createAndFill();
    const arrangement = editor.schema.nodes["test_arrangement"]?.create();

    expect(field).toBeDefined();
    expect(optionalField).toBeDefined();
    expect(paragraph).toBeDefined();
    expect(richBlock).toBeDefined();
    expect(plainBlock).toBeDefined();
    expect(courseBlock).toBeDefined();
    expect(assessmentBlock).toBeDefined();
    expect(arrangement).toBeDefined();

    expect(() => field?.createChecked(null, [paragraph!, richBlock!, paragraph!])).not.toThrow();
    expect(() => field?.createChecked(null, [richBlock!])).not.toThrow();
    expect(() => optionalField?.createChecked()).not.toThrow();
    expect(() => field?.createChecked(null, [plainBlock!])).toThrow();
    expect(() => field?.createChecked(null, [courseBlock!])).toThrow();
    expect(() => field?.createChecked(null, [assessmentBlock!])).toThrow();
    expect(() => field?.createChecked(null, [arrangement!])).toThrow();

    editor.destroy();
  });
});

function groupSet(group: unknown): Set<string> {
  return new Set(typeof group === "string" ? group.split(/\s+/) : []);
}
