import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import { Schema, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { describe, expect, it } from "vite-plus/test";

import { projectAuthoringCourseStructure } from "./project-authoring-course-structure";

const IDS = {
  pageUnavailable: id("unavail00001"),
  firstSurface: id("surface00001"),
  secondUnavailable: id("unavail00002"),
  firstSection: id("section00001"),
  secondSection: id("section00002"),
} as const;

const schema = new Schema({
  nodes: {
    doc: { content: "courseDocument" },
    text: {},
    courseDocument: {
      content:
        "(surface | unavailable_surface)+ | (courseSection (surface | unavailable_surface)+)+",
      attrs: { mode: { default: "page" } },
    },
    courseSection: {
      atom: true,
      attrs: { id: { default: null }, title: { default: null } },
    },
    surface: {
      atom: true,
      attrs: { id: { default: null }, variant: { default: null } },
    },
    unavailable_surface: {
      atom: true,
      attrs: {
        id: { default: null },
        capabilityId: { default: null },
        original: { default: null },
      },
    },
  },
});

describe("projectAuthoringCourseStructure", () => {
  it("projects a Page with one unavailable Surface from its safe wrapper ID", () => {
    const unavailable = unavailableSurface(IDS.pageUnavailable);
    makePrivateAttrsUnreadable(unavailable);

    expect(projectAuthoringCourseStructure(documentNode("page", [unavailable]))).toMatchObject({
      kind: "page",
      mode: "page",
      surfaceIds: [IDS.pageUnavailable],
      surfaces: [
        {
          id: IDS.pageUnavailable,
          index: 0,
          courseSectionId: null,
          courseSectionSurfaceIndex: null,
        },
      ],
    });
  });

  it("preserves supported and unavailable Surface order in an unsectioned Slideshow", () => {
    expect(
      projectAuthoringCourseStructure(
        documentNode("slideshow", [
          surface(IDS.firstSurface),
          unavailableSurface(IDS.secondUnavailable),
        ]),
      ),
    ).toMatchObject({
      kind: "unsectioned-slideshow",
      mode: "slideshow",
      surfaceIds: [IDS.firstSurface, IDS.secondUnavailable],
    });
  });

  it("preserves Course Section membership for unavailable Surfaces", () => {
    expect(
      projectAuthoringCourseStructure(
        documentNode("slideshow", [
          courseSection(IDS.firstSection, "Introduction"),
          unavailableSurface(IDS.pageUnavailable),
          courseSection(IDS.secondSection, "Practice"),
          surface(IDS.firstSurface),
          unavailableSurface(IDS.secondUnavailable),
        ]),
      ),
    ).toMatchObject({
      kind: "sectioned-slideshow",
      mode: "slideshow",
      surfaceIds: [IDS.pageUnavailable, IDS.firstSurface, IDS.secondUnavailable],
      courseSections: [
        {
          id: IDS.firstSection,
          title: "Introduction",
          surfaceIds: [IDS.pageUnavailable],
        },
        {
          id: IDS.secondSection,
          title: "Practice",
          surfaceIds: [IDS.firstSurface, IDS.secondUnavailable],
        },
      ],
    });
  });

  it.each([
    ["a missing unavailable Surface ID", [unavailableSurface(null)]],
    ["an invalid unavailable Surface ID", [unavailableSurface("short")]],
    ["a duplicate Surface ID", [surface(IDS.firstSurface), unavailableSurface(IDS.firstSurface)]],
    [
      "a missing Course Section ID",
      [courseSection(null, "Introduction"), unavailableSurface(IDS.pageUnavailable)],
    ],
  ])("refuses %s", (_label, children) => {
    expect(projectAuthoringCourseStructure(documentNode("slideshow", children))).toBeNull();
  });
});

function documentNode(
  mode: "page" | "slideshow",
  children: readonly ProseMirrorNode[],
): ProseMirrorNode {
  return schema.node("doc", null, [schema.node("courseDocument", { mode }, children)]);
}

function courseSection(id: unknown, title: unknown): ProseMirrorNode {
  return schema.node("courseSection", { id, title });
}

function surface(id: unknown): ProseMirrorNode {
  return schema.node("surface", { id, variant: "supported" });
}

function unavailableSurface(nodeId: unknown): ProseMirrorNode {
  return schema.node("unavailable_surface", {
    id: nodeId,
    capabilityId: "plus.private-surface",
    original: {
      type: "surface",
      attrs: { id: nodeId, variant: "plus.private-surface" },
      content: [{ type: "private_child", attrs: { secret: "must remain opaque" } }],
    },
  });
}

function makePrivateAttrsUnreadable(node: ProseMirrorNode): void {
  for (const attr of ["capabilityId", "original"] as const) {
    Object.defineProperty(node.attrs, attr, {
      configurable: true,
      get: () => {
        throw new Error(`Authoring Course Structure must not read ${attr}.`);
      },
    });
  }
}

function id(value: string): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(value);
}
