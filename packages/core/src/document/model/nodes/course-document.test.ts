// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import StarterKit from "@tiptap/starter-kit";
import { Fragment } from "@tiptap/pm/model";
import { describe, expect, it } from "vite-plus/test";

import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";

import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import {
  ARRANGEMENT_CONTENT,
  SECTION_ARRANGEMENT_CONTENT,
} from "@/document/model/content-model/content-groups";
import {
  COURSE_SECTION_NODE_TYPE,
  CourseDocumentNode,
  DocumentNode,
  createCourseSectionNode,
} from "@/document/model/nodes";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";

const TestArrangementNode = Node.create({
  name: "testArrangement",
  group: ARRANGEMENT_CONTENT,
  content: "paragraph*",
  parseHTML() {
    return [{ tag: "div[data-test-arrangement]" }];
  },
  renderHTML() {
    return ["div", { "data-test-arrangement": "" }, 0];
  },
});

const TestSectionArrangementNode = Node.create({
  name: "testSectionArrangement",
  group: SECTION_ARRANGEMENT_CONTENT,
  content: "paragraph*",
  parseHTML() {
    return [{ tag: "div[data-test-section-arrangement]" }];
  },
  renderHTML() {
    return ["div", { "data-test-section-arrangement": "" }, 0];
  },
});

function courseDocumentContent(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: {
          mode: "page",
          theme: createDefaultPersistedCourseTheme(),
        },
        content: [
          {
            type: "surface",
            attrs: {
              id: "surface00001",
              title: "Introduction",
              variant: "page-default",
            },
            content: [{ type: "paragraph" }],
          },
        ],
      },
    ],
  };
}

function makeEditor(content: JSONContent | string = courseDocumentContent()) {
  return new Editor({
    extensions: [
      DocumentNode,
      StarterKit.configure({
        document: false,
        paragraph: false,
        undoRedo: false,
      }),
      ExtendedParagraph,
      CourseDocumentNode,
      createCourseSectionNode(),
      SurfaceNode,
      RegionNode,
      TestArrangementNode,
      TestSectionArrangementNode,
      UniqueID.configure({
        attributeName: "id",
        types: "all",
        updateDocument: false,
      }),
    ],
    content,
  });
}

describe("course document nodes", () => {
  it("creates a custom doc with one course document child", () => {
    const editor = makeEditor();

    const json = editor.getJSON();
    const courseDocument = json.content?.[0] as JSONContent | undefined;
    expect(json.type).toBe("doc");
    expect(courseDocument?.type).toBe("courseDocument");
    expect(courseDocument?.attrs).toMatchObject({
      schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
      mode: "page",
      surfaceSize: "fluid",
      overflowMode: "grow",
      theme: createDefaultPersistedCourseTheme(),
    });

    editor.destroy();
  });

  it("allows exactly one course document at the top level", () => {
    const editor = makeEditor();
    const { schema } = editor;
    const courseDocumentType = schema.nodes.courseDocument;
    const docType = schema.nodes.doc;

    expect(courseDocumentType).toBeDefined();
    expect(docType).toBeDefined();

    const courseDocument = courseDocumentType!.createAndFill({
      mode: "page",
    });

    expect(courseDocument).not.toBeNull();
    expect(docType!.validContent(Fragment.from(courseDocument!))).toBe(true);
    expect(docType!.validContent(Fragment.fromArray([courseDocument!, courseDocument!]))).toBe(
      false,
    );

    editor.destroy();
  });

  it("accepts only flat Surfaces or complete Course Section partitions", () => {
    const editor = makeEditor();
    const { schema } = editor;
    const courseDocumentType = schema.nodes.courseDocument!;
    const courseSectionType = schema.nodes[COURSE_SECTION_NODE_TYPE]!;
    const surfaceType = schema.nodes.surface!;
    const paragraphType = schema.nodes.paragraph!;
    const firstSurface = surfaceType.createChecked(
      { id: "surface00001", variant: "slide-content" },
      paragraphType.create(),
    );
    const secondSurface = surfaceType.createChecked(
      { id: "surface00002", variant: "slide-content" },
      paragraphType.create(),
    );
    const firstSection = courseSectionType.createChecked({
      id: "section00001",
      title: "Introduction",
    });
    const secondSection = courseSectionType.createChecked({
      id: "section00002",
      title: "Practice",
    });

    expect(courseDocumentType.spec.content).toBe("surface+ | (courseSection surface+)+");
    expect(courseDocumentType.validContent(Fragment.from(firstSurface))).toBe(true);
    expect(courseDocumentType.validContent(Fragment.fromArray([firstSurface, secondSurface]))).toBe(
      true,
    );
    expect(
      courseDocumentType.validContent(
        Fragment.fromArray([firstSection, firstSurface, secondSection, secondSurface]),
      ),
    ).toBe(true);
    expect(
      courseDocumentType.validContent(
        Fragment.fromArray([firstSurface, firstSection, secondSurface]),
      ),
    ).toBe(false);
    expect(
      courseDocumentType.validContent(
        Fragment.fromArray([firstSection, firstSection, firstSurface]),
      ),
    ).toBe(false);
    expect(
      courseDocumentType.validContent(
        Fragment.fromArray([firstSection, firstSurface, secondSection]),
      ),
    ).toBe(false);
    expect(courseDocumentType.validContent(Fragment.from(firstSection))).toBe(false);
    expect(courseDocumentType.validContent(Fragment.empty)).toBe(false);
    expect(surfaceType.validContent(Fragment.from(firstSection))).toBe(false);

    editor.destroy();
  });

  it("allows block content inside surfaces", () => {
    const editor = makeEditor();
    const { schema } = editor;
    const paragraphType = schema.nodes.paragraph;
    const surfaceType = schema.nodes.surface;

    expect(paragraphType).toBeDefined();
    expect(surfaceType).toBeDefined();

    const paragraph = paragraphType!.create();
    const text = schema.text("inline text");

    expect(surfaceType!.validContent(Fragment.from(paragraph))).toBe(true);
    expect(surfaceType!.validContent(Fragment.from(text))).toBe(false);

    editor.destroy();
  });

  it("requires surfaces to contain an editable anchor", () => {
    const editor = makeEditor();
    const { schema } = editor;
    const surfaceType = schema.nodes.surface;
    const paragraphType = schema.nodes.paragraph;

    expect(surfaceType).toBeDefined();
    expect(paragraphType).toBeDefined();
    expect(surfaceType!.spec.content).toBe("(block | arrangement | region)+");
    expect(surfaceType!.contentMatch.defaultType).toBe(paragraphType);
    expect(surfaceType!.validContent(Fragment.empty)).toBe(false);
    expect(surfaceType!.validContent(Fragment.from(paragraphType!.create()))).toBe(true);

    editor.destroy();
  });

  it("allows surface-owned regions inside surfaces", () => {
    const editor = makeEditor();
    const { schema } = editor;
    const surfaceType = schema.nodes.surface;
    const regionType = schema.nodes.region;
    const paragraphType = schema.nodes.paragraph;

    expect(surfaceType).toBeDefined();
    expect(regionType).toBeDefined();
    expect(paragraphType).toBeDefined();
    expect(regionType!.spec.content).toBe("(block | arrangement)+");

    const region = regionType!.create(null, [paragraphType!.create()]);
    expect(surfaceType!.validContent(Fragment.from(region))).toBe(true);

    editor.destroy();
  });

  it("marks empty surfaces as drop targets", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              attrs: { id: "surface00001", variant: "page-default" },
              content: [{ type: "paragraph" }],
            },
          ],
        },
      ],
    });
    const html = editor.getHTML();

    expect(html).toContain('data-empty="true"');

    editor.destroy();
  });

  it("round-trips attrs through rendered HTML", () => {
    const editor = makeEditor();
    const html = editor.getHTML();

    expect(html).toContain("data-course-document");
    expect(html).toContain(
      `data-scaffold-document-format-version="${SCAFFOLD_DOCUMENT_FORMAT_VERSION}"`,
    );
    expect(html).toContain("data-course-theme=");
    expect(html).not.toContain("data-course-theme-values=");
    expect(html).toContain("data-surface");
    expect(html).toContain('data-id="surface00001"');
    expect(html).not.toContain("data-surface-id");
    expect(html).toContain('data-surface-variant="page-default"');

    const nextEditor = makeEditor(html);
    const courseDocument = nextEditor.getJSON().content?.[0] as JSONContent | undefined;
    const surface = courseDocument?.content?.[0] as JSONContent | undefined;

    expect(courseDocument?.attrs).toMatchObject({
      schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
      mode: "page",
      surfaceSize: "fluid",
      overflowMode: "grow",
      theme: createDefaultPersistedCourseTheme(),
    });
    expect(surface?.attrs).toMatchObject({
      id: "surface00001",
      title: "Introduction",
      variant: "page-default",
    });

    editor.destroy();
    nextEditor.destroy();
  });

  it("round-trips valid non-default exact theme references unchanged", () => {
    const theme = {
      schemaVersion: 1 as const,
      design: { id: "scaffold-editorial", revision: "7" },
      colourSystem: { id: "scaffold-ocean", revision: "3" },
      overrides: {},
    };
    const content = courseDocumentContent();
    const courseDocument = content.content![0]!;
    courseDocument.attrs = {
      ...courseDocument.attrs,
      theme,
      branching: { startSurfaceId: "surface00001" },
    };
    courseDocument.content!.push({
      type: "surface",
      attrs: { id: "surface00002", title: "Next", variant: "page-default" },
      content: [{ type: "paragraph" }],
    });
    const editor = makeEditor(content);
    const html = editor.getHTML();
    const nextEditor = makeEditor(html);

    const reopenedCourse = nextEditor.getJSON().content?.[0] as JSONContent | undefined;
    expect(reopenedCourse?.attrs?.["theme"]).toEqual(theme);
    expect(reopenedCourse?.attrs?.["branching"]).toEqual({ startSurfaceId: "surface00001" });
    expect(reopenedCourse?.content?.map((surface) => surface.attrs?.["id"])).toEqual([
      "surface00001",
      "surface00002",
    ]);
    expect(html).toContain("data-course-theme=");
    expect(html).not.toContain("data-course-theme-values=");
    expect(html).not.toContain("radixThemeProps");
    expect(html).not.toContain("resolved");

    editor.destroy();
    nextEditor.destroy();
  });

  it.each([undefined, "not-json", '{"schemaVersion":1,"preset":{}}'])(
    "uses the required default for an absent or invalid HTML theme attribute",
    (serializedTheme) => {
      const themeAttribute =
        serializedTheme === undefined ? "" : `data-course-theme='${serializedTheme}'`;
      const editor = makeEditor(`
        <section data-course-document data-course-mode="page" ${themeAttribute}>
          <section data-surface data-surface-id="surface-1" data-surface-variant="page-default">
            <p>Content</p>
          </section>
        </section>
      `);

      expect((editor.getJSON().content?.[0] as JSONContent | undefined)?.attrs?.["theme"]).toEqual(
        createDefaultPersistedCourseTheme(),
      );

      editor.destroy();
    },
  );

  it("preserves unsupported document format versions parsed from HTML", () => {
    const futureVersion = SCAFFOLD_DOCUMENT_FORMAT_VERSION + 1;
    const editor = makeEditor(`
      <section
        data-course-document
        data-course-mode="page"
        data-scaffold-document-format-version="${futureVersion}"
      >
        <section data-surface data-id="surface00001">
          <p>Future content</p>
        </section>
      </section>
    `);
    const courseDocument = editor.getJSON().content?.[0] as JSONContent | undefined;

    expect(courseDocument?.attrs?.["schemaVersion"]).toBe(futureVersion);
    expect(editor.getHTML()).toContain(`data-scaffold-document-format-version="${futureVersion}"`);

    editor.destroy();
  });
});
