import { describe, expect, it } from "vite-plus/test";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";

import { createCourseDocumentAuthoringEnvironment } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { prepareScaffoldArtifactForAuthoring as prepareScaffoldArtifactForAuthoringInternal } from "@/document/authoring/prepare-scaffold-artifact-for-authoring";
import { getCourseDocumentDefaultsForMode } from "@/document/model/course-document-defaults";
import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";

import {
  createScaffoldArtifact,
  createScaffoldDocumentContent,
  readCourseDocumentMode,
} from "./artifact";

const authoringEnvironment = createCourseDocumentAuthoringEnvironment({
  composition: createCoreScaffoldAuthoringComposition(),
});
const coreProductAccess = { scaffoldPlusAuthorized: false } as const;

function prepareScaffoldArtifactForAuthoring(value: unknown, productAccess = coreProductAccess) {
  return prepareScaffoldArtifactForAuthoringInternal(value, authoringEnvironment, productAccess);
}

describe("Scaffold format", () => {
  it("creates a course document content envelope", () => {
    const content = createScaffoldDocumentContent({
      mode: "page",
      surfaceId: "surface_0001",
    });

    expect(content).toMatchObject({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: {
            schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
            requiresScaffoldPlus: false,
            mode: "page",
            surfaceSize: "fluid",
            overflowMode: "grow",
            theme: createDefaultPersistedCourseTheme(),
          },
          content: [
            {
              type: "surface",
              attrs: { id: "surface_0001", variant: "page-default" },
              content: [{ type: "paragraph" }],
            },
          ],
        },
      ],
    });
    expect(EmbeddedNodeIdSchema.safeParse(content.content?.[0]?.attrs?.["id"]).success).toBe(true);
  });

  it("creates an explicitly Scaffold Plus-required artifact without changing format version", () => {
    const artifact = createScaffoldArtifact({
      id: "artifact-plus",
      title: "Plus course",
      mode: "page",
      requiresScaffoldPlus: true,
    });

    expect(artifact.content.content?.[0]?.attrs).toMatchObject({
      schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
      requiresScaffoldPlus: true,
    });
    expect(SCAFFOLD_DOCUMENT_FORMAT_VERSION).toBe(4);
  });

  it("refuses to prepare a Plus-required artifact without product access", () => {
    const artifact = createScaffoldArtifact({
      id: "artifact-plus",
      title: "Plus course",
      mode: "page",
      requiresScaffoldPlus: true,
    });

    expect(prepareScaffoldArtifactForAuthoring(artifact)).toEqual({
      status: "requires-scaffold-plus",
    });
  });

  it("keeps the surface definition identity separate from the occurrence identity", () => {
    const supplied = createScaffoldDocumentContent({
      mode: "slideshow",
      initialCourseSectionTitle: "Introduction",
      surfaceId: "surface_0002",
    });
    const generated = createScaffoldDocumentContent({ mode: "page" });

    expect(supplied.content?.[0]?.content?.[0]).toMatchObject({
      type: "courseSection",
      attrs: { title: "Introduction" },
    });
    expect(supplied.content?.[0]?.content?.[1]?.attrs).toMatchObject({
      id: "surface_0002",
      variant: "slide-cover",
    });
    expect(generated.content?.[0]?.content?.[0]?.attrs).toMatchObject({
      id: expect.any(String),
      variant: "page-default",
    });
    expect(generated.content?.[0]?.content?.[0]?.attrs?.["id"]).not.toBe("page-default");
  });

  it("rejects malformed caller-supplied surface identities instead of normalizing them", () => {
    expect(() =>
      createScaffoldDocumentContent({
        mode: "page",
        surfaceId: "surface-1",
      }),
    ).toThrow();

    expect(() =>
      createScaffoldArtifact({
        id: "artifact-1",
        title: "Untitled",
        mode: "page",
        surfaceId: "",
      }),
    ).toThrow();
  });

  it("detects an uninitialized authoring bootstrap", () => {
    const prepared = prepareScaffoldArtifactForAuthoring({
      id: "artifact-1",
      title: "Untitled",
      mode: "slideshow",
      initialCourseSectionTitle: "Introduction",
      content: null,
    });

    expect(prepared).toEqual({
      status: "uninitialized",
      bootstrap: {
        id: "artifact-1",
        title: "Untitled",
        mode: "slideshow",
        content: null,
      },
    });
  });

  it("rejects a hostile artifact envelope without invoking accessors", () => {
    let invoked = false;
    const hostile = Object.defineProperty({}, "content", {
      enumerable: true,
      get() {
        invoked = true;
        return createScaffoldDocumentContent({ mode: "page" });
      },
    });

    expect(prepareScaffoldArtifactForAuthoring(hostile)).toMatchObject({
      status: "invalid",
      issues: [expect.objectContaining({ code: "invalid_json_value" })],
    });
    expect(invoked).toBe(false);
  });

  it("creates an artifact skeleton for a chosen document mode", () => {
    const initialized = createScaffoldArtifact({
      id: "artifact-1",
      title: "Untitled",
      mode: "slideshow",
      initialCourseSectionTitle: "Introduction",
    });

    expect(initialized).toMatchObject({
      id: "artifact-1",
      title: "Untitled",
      mode: "slideshow",
    });
    expect(readCourseDocumentMode(initialized.content)).toBe("slideshow");
    expect(initialized.content.content?.[0]?.attrs?.["theme"]).toEqual(
      createDefaultPersistedCourseTheme(),
    );
    expect(initialized.content).toMatchObject({
      content: [
        {
          content: [
            {
              type: "courseSection",
              attrs: { title: "Introduction" },
            },
            {
              attrs: { variant: "slide-cover" },
              content: [
                { type: "heading" },
                {
                  type: "slide_cover_subtitle",
                  content: [{ type: "paragraph" }],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it("creates slideshow skeletons with slide surface view defaults", () => {
    const initialized = createScaffoldArtifact({
      id: "artifact-1",
      title: "Untitled",
      mode: "slideshow",
      initialCourseSectionTitle: "Introduction",
    });

    expect(initialized.content).toMatchObject({
      content: [
        {
          attrs: {
            mode: "slideshow",
            surfaceSize: "16x9",
            overflowMode: "clip",
          },
        },
      ],
    });
  });

  it("keeps branching document view defaults fluid", () => {
    expect(getCourseDocumentDefaultsForMode("branching")).toMatchObject({
      mode: "branching",
      surfaceSize: "fluid",
      overflowMode: "grow",
      theme: createDefaultPersistedCourseTheme(),
    });
  });

  it("rejects surface sizes that conflict with course mode", () => {
    expect(() =>
      createScaffoldDocumentContent({
        mode: "slideshow",
        initialCourseSectionTitle: "Introduction",
        surfaceSize: "fluid",
      }),
    ).toThrow();
    expect(() => createScaffoldDocumentContent({ mode: "page", surfaceSize: "16x9" })).toThrow();
  });

  it("prepares stored artifact content for authoring", () => {
    const content = createScaffoldDocumentContent({ mode: "page" });

    const prepared = prepareScaffoldArtifactForAuthoring({
      id: "artifact-1",
      title: "Untitled",
      mode: "page",
      content,
    });

    expect(prepared).toMatchObject({
      status: "supported",
      artifact: {
        id: "artifact-1",
        title: "Untitled",
        mode: "page",
        content,
      },
      source: "stored",
    });
  });

  it("returns a typed unavailable outcome with canonical content and safe inventory", () => {
    const content = createScaffoldDocumentContent({ mode: "page", surfaceId: "surface00001" });
    const surface = content.content?.[0]?.content?.[0];
    if (!surface) throw new Error("Expected default Surface.");
    surface.content = [
      {
        type: "plus_private_block",
        attrs: { id: "plusblock001", private: "must stay private" },
      },
    ];

    const prepared = prepareScaffoldArtifactForAuthoring({
      id: "artifact-plus",
      title: "Plus course",
      mode: "page",
      content,
    });

    expect(prepared).toMatchObject({
      status: "unavailable",
      artifact: { content },
      unavailableContent: [
        {
          kind: "block",
          capabilityId: "plus_private_block",
          stableId: "plusblock001",
        },
      ],
    });
    expect(
      JSON.stringify(prepared.status === "unavailable" ? prepared.unavailableContent : null),
    ).not.toContain("must stay private");
    expect(prepared).not.toHaveProperty("workingDocument");
    expect(prepared).toHaveProperty("authoringMount");
    if (prepared.status !== "unavailable") throw new Error("Expected unavailable preparation.");
    expect(Object.keys(prepared.authoringMount)).toEqual([]);
    expect(Object.isFrozen(prepared.authoringMount)).toBe(true);
    expect(JSON.stringify(prepared)).not.toContain('"original"');
  });

  it("preserves the unsupported-format branch without preparing mountable content", () => {
    const content = createScaffoldDocumentContent({ mode: "page" });
    content.content![0]!.attrs!["schemaVersion"] = SCAFFOLD_DOCUMENT_FORMAT_VERSION + 1;

    const prepared = prepareScaffoldArtifactForAuthoring({
      id: "artifact-future",
      title: "Future",
      mode: "page",
      content,
    });

    expect(prepared).toMatchObject({
      status: "unsupported-core-format",
      documentVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION + 1,
      supportedVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
    });
    expect(prepared).not.toHaveProperty("artifact");
  });

  it.each([
    {
      name: "a Page containing multiple Surfaces",
      mode: "page" as const,
      content: () =>
        courseContent("page", (firstSurface) => [
          firstSurface,
          surfaceWithId(firstSurface, "surface00002"),
        ]),
    },
    {
      name: "a partially sectioned Slideshow",
      mode: "slideshow" as const,
      content: () =>
        courseContent("slideshow", (firstSurface) => [
          firstSurface,
          courseSection("section00001", "Practice"),
          surfaceWithId(firstSurface, "surface00002"),
        ]),
    },
    {
      name: "invalid Course Section attributes",
      mode: "slideshow" as const,
      content: () =>
        courseContent("slideshow", (firstSurface) => [
          courseSection("section00001", " "),
          firstSurface,
        ]),
    },
    {
      name: "a Course Section containing child content",
      mode: "slideshow" as const,
      content: () =>
        courseContent("slideshow", (firstSurface) => [
          {
            ...courseSection("section00001", "Practice"),
            content: [{ type: "paragraph" }],
          },
          firstSurface,
        ]),
    },
  ])("rejects stored content with $name", ({ mode, content }) => {
    expect(
      prepareScaffoldArtifactForAuthoring({
        id: "artifact-1",
        title: "Untitled",
        mode,
        content: content(),
      }),
    ).toMatchObject({ status: "invalid" });
  });

  it("rejects stored v1 content without converting it", () => {
    const content = createScaffoldDocumentContent({ mode: "page" });
    const courseDocument = content.content?.[0];
    if (!courseDocument?.attrs) throw new Error("Expected courseDocument attrs.");
    const { theme: _currentTheme, ...legacyAttrs } = courseDocument.attrs;
    courseDocument.attrs = { ...legacyAttrs, schemaVersion: 1 };

    const prepared = prepareScaffoldArtifactForAuthoring({
      id: "artifact-1",
      title: "Untitled",
      mode: "page",
      content,
    });

    expect(prepared).toMatchObject({
      status: "unsupported-core-format",
      message: expect.stringContaining("older than this runtime supports"),
    });
  });

  it("leaves stored current v3 content unchanged in meaning", () => {
    const content = createScaffoldDocumentContent({ mode: "page" });

    const prepared = prepareScaffoldArtifactForAuthoring({
      id: "artifact-1",
      title: "Untitled",
      mode: "page",
      content,
    });

    expect(prepared).toMatchObject({
      status: "supported",
      artifact: { content },
      source: "stored",
    });
  });

  it("rejects stored content from a future format version", () => {
    const content = createScaffoldDocumentContent({ mode: "page" });
    const courseDocument = content.content?.[0];
    if (!courseDocument?.attrs) throw new Error("Expected courseDocument attrs.");
    courseDocument.attrs = {
      ...courseDocument.attrs,
      schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION + 1,
    };

    expect(
      prepareScaffoldArtifactForAuthoring({
        id: "artifact-1",
        title: "Untitled",
        mode: "page",
        content,
      }),
    ).toMatchObject({
      status: "unsupported-core-format",
      message: expect.stringContaining("newer than this runtime supports"),
    });
  });

  it("rejects legacy Gallery content at the format boundary", () => {
    const content = createScaffoldDocumentContent({ mode: "page" });
    const courseDocument = content.content?.[0];
    if (!courseDocument?.attrs) throw new Error("Expected courseDocument attrs.");
    courseDocument.attrs = { ...courseDocument.attrs, schemaVersion: 1 };
    const surface = courseDocument.content?.[0];
    if (!surface) throw new Error("Expected surface.");
    surface.content = [
      {
        type: "gallery",
        attrs: {
          id: "gallery-1",
          data: { type: "gallery", layout: "carousel", showCaptions: true },
        },
        content: [
          {
            type: "gallery_item",
            attrs: {
              id: "gallery-item-1",
              data: { mode: "external", src: "not-a-url", alt: "", caption: "" },
            },
          },
        ],
      },
    ];

    expect(
      prepareScaffoldArtifactForAuthoring({
        id: "artifact-1",
        title: "Untitled",
        mode: "page",
        content,
      }),
    ).toMatchObject({
      status: "unsupported-core-format",
      message: expect.stringContaining("older than this runtime supports"),
    });
  });

  it("rejects artifacts whose mode disagrees with stored content", () => {
    const content = createScaffoldDocumentContent({ mode: "page" });

    const prepared = prepareScaffoldArtifactForAuthoring({
      id: "artifact-1",
      title: "Untitled",
      mode: "slideshow",
      content,
    });

    expect(prepared).toMatchObject({
      status: "invalid",
      message: 'Scaffold artifact mode "slideshow" does not match content mode "page".',
    });
  });
});

function courseContent(
  mode: "page" | "slideshow",
  children: (firstSurface: JSONContent) => JSONContent[],
): JSONContent {
  const content = createScaffoldDocumentContent(
    mode === "slideshow"
      ? { mode, initialCourseSectionTitle: "Introduction", surfaceId: "surface00001" }
      : { mode, surfaceId: "surface00001" },
  );
  const courseDocument = content.content?.[0];
  const firstSurface = courseDocument?.content?.[mode === "slideshow" ? 1 : 0];
  if (!courseDocument || !firstSurface) throw new Error("Expected Course Document content.");
  courseDocument.content = children(firstSurface);
  return content;
}

function surfaceWithId(surface: JSONContent, id: string): JSONContent {
  return {
    ...structuredClone(surface),
    attrs: { ...surface.attrs, id },
  };
}

function courseSection(id: string, title: string): JSONContent {
  return { type: "courseSection", attrs: { id, title } };
}
