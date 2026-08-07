// @vitest-environment happy-dom

import { Node, getSchema, type NodeConfig } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import StarterKit from "@tiptap/starter-kit";
import {
  DOMParser as ProseMirrorDOMParser,
  DOMSerializer as ProseMirrorDOMSerializer,
  Fragment,
  type Node as ProseMirrorNode,
} from "@tiptap/pm/model";
import { describe, expect, it } from "vite-plus/test";

import { COURSE_SECTION_NODE_TYPE, createCourseSectionNode } from "./course-section";

const COURSE_SECTION_ID = "EfGhIj789_--";

const TestDocumentNode = Node.create({
  name: "doc",
  topNode: true,
  content: `${COURSE_SECTION_NODE_TYPE}+`,
});

function makeSchema(courseSectionNode = createCourseSectionNode()) {
  return getSchema([
    TestDocumentNode,
    StarterKit.configure({ document: false }),
    courseSectionNode,
    UniqueID.configure({
      attributeName: "id",
      types: "all",
      updateDocument: false,
    }),
  ]);
}

describe("Course Section node", () => {
  it("is a selectable contentless atom whose local attributes contain only title", () => {
    const extension = createCourseSectionNode();
    const schema = makeSchema(extension);
    const courseSectionType = schema.nodes[COURSE_SECTION_NODE_TYPE];
    const addAttributes = extension.config.addAttributes as
      | (() => Record<string, unknown>)
      | undefined;

    expect(courseSectionType).toBeDefined();
    expect(courseSectionType!.spec.atom).toBe(true);
    expect(courseSectionType!.spec.selectable).toBe(true);
    expect(courseSectionType!.spec.draggable).toBe(false);
    expect(courseSectionType!.spec.content).toBe("");
    expect(courseSectionType!.isLeaf).toBe(true);
    expect(Object.keys(addAttributes?.() ?? {})).toEqual(["title"]);
    expect(courseSectionType!.spec.attrs?.["id"]).toBeDefined();
    expect(courseSectionType!.validContent(Fragment.empty)).toBe(true);
  });

  it("round-trips canonical JSON with empty content", () => {
    const schema = makeSchema();
    const original = schema.nodes[COURSE_SECTION_NODE_TYPE]!.createChecked({
      id: COURSE_SECTION_ID,
      title: "Introduction",
    });
    const roundTripped = schema.nodeFromJSON(original.toJSON());

    expect(roundTripped.toJSON()).toEqual({
      type: COURSE_SECTION_NODE_TYPE,
      attrs: { id: COURSE_SECTION_ID, title: "Introduction" },
    });
    expect(roundTripped.content.size).toBe(0);
  });

  it("rejects structurally invalid child content", () => {
    const schema = makeSchema();
    const courseSectionType = schema.nodes[COURSE_SECTION_NODE_TYPE]!;

    expect(() =>
      courseSectionType.createChecked(
        { id: COURSE_SECTION_ID, title: "Introduction" },
        schema.text("Visible content is not a Course Section title"),
      ),
    ).toThrow();
  });

  it("parses and renders only the canonical inert HTML markers", () => {
    const parsed = parseCourseSection(
      `<div data-course-section data-course-section-title="  Introduction &amp; setup  "></div>`,
    );
    const alternate = parseCourseSection(
      `<div data-course-section data-title="Alternate title"></div>`,
    );
    const rendered = serializeCourseSection(parsed);

    expect(parsed.attrs).toMatchObject({ id: null, title: "Introduction & setup" });
    expect(alternate.attrs).toMatchObject({ id: null, title: null });
    expect(rendered.hasAttribute("data-course-section")).toBe(true);
    expect(rendered.getAttribute("data-course-section-title")).toBe("Introduction & setup");
    expect(rendered.hidden).toBe(true);
    expect(rendered.getAttribute("aria-hidden")).toBe("true");
    expect(rendered.hasAttribute("data-title")).toBe(false);
    expect(rendered.childNodes).toHaveLength(0);
  });

  it("safely escapes authored title text in serialized HTML", () => {
    const schema = makeSchema();
    const title = 'Introduction "quoted" & <unsafe>';
    const courseSection = schema.nodes[COURSE_SECTION_NODE_TYPE]!.createChecked({
      id: COURSE_SECTION_ID,
      title,
    });
    const rendered = serializeCourseSection(courseSection, schema);

    expect(rendered.getAttribute("data-course-section-title")).toBe(title);
    expect(rendered.outerHTML).toContain("&quot;quoted&quot;");
    expect(rendered.outerHTML).toContain("&amp;");
    expect(rendered.querySelector("unsafe")).toBeNull();
    expect(rendered.textContent).toBe("");
    expect(parseCourseSection(rendered.outerHTML).attrs["title"]).toBe(title);
  });

  it("retains an optional composition-specific NodeView injection", () => {
    const addNodeView: NonNullable<NodeConfig["addNodeView"]> = () => () => ({
      dom: document.createElement("div"),
    });

    expect(createCourseSectionNode({ addNodeView }).config.addNodeView).toBe(addNodeView);
    expect(createCourseSectionNode().config.addNodeView).toBeUndefined();
  });
});

function parseCourseSection(html: string): ProseMirrorNode {
  const container = document.createElement("div");
  container.innerHTML = html;
  const parsed = ProseMirrorDOMParser.fromSchema(makeSchema()).parse(container);
  const courseSection = parsed.firstChild;
  if (!courseSection) throw new Error("Expected a parsed Course Section node.");
  return courseSection;
}

function serializeCourseSection(
  courseSection: ProseMirrorNode,
  schema = makeSchema(),
): HTMLElement {
  const container = document.createElement("div");
  container.appendChild(ProseMirrorDOMSerializer.fromSchema(schema).serializeNode(courseSection));
  const element = container.firstElementChild;
  if (!(element instanceof HTMLElement)) {
    throw new Error("Expected a serialized Course Section element.");
  }
  return element;
}
