import { describe, expect, it } from "vite-plus/test";

import { getCourseDocumentDefaultsForMode } from "@/document/model/course-document-defaults";
import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";

import {
  createScaffoldArtifact,
  createScaffoldDocumentContent,
  prepareScaffoldArtifactForAuthoring,
  readCourseDocumentMode,
} from "./artifact";

describe("Scaffold format", () => {
  it("creates a course document content envelope", () => {
    const content = createScaffoldDocumentContent({
      mode: "page",
      surfaceId: "surface-1",
    });

    expect(content).toMatchObject({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: {
            schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
            mode: "page",
            surfaceSize: "fluid",
            overflowMode: "grow",
          },
          content: [
            {
              type: "surface",
              attrs: { id: "surface-1", variant: "page-default" },
              content: [{ type: "paragraph" }],
            },
          ],
        },
      ],
    });
  });

  it("keeps the surface definition identity separate from the occurrence identity", () => {
    const supplied = createScaffoldDocumentContent({
      mode: "slideshow",
      surfaceId: "surface-supplied",
    });
    const generated = createScaffoldDocumentContent({ mode: "page" });

    expect(supplied.content?.[0]?.content?.[0]?.attrs).toMatchObject({
      id: "surface-supplied",
      variant: "slide-cover",
    });
    expect(generated.content?.[0]?.content?.[0]?.attrs).toMatchObject({
      id: expect.any(String),
      variant: "page-default",
    });
    expect(generated.content?.[0]?.content?.[0]?.attrs?.["id"]).not.toBe("page-default");
  });

  it("detects an uninitialized authoring bootstrap", () => {
    const prepared = prepareScaffoldArtifactForAuthoring({
      id: "artifact-1",
      title: "Untitled",
      mode: "slideshow",
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

  it("creates an artifact skeleton for a chosen document mode", () => {
    const initialized = createScaffoldArtifact({
      id: "artifact-1",
      title: "Untitled",
      mode: "slideshow",
    });

    expect(initialized).toMatchObject({
      id: "artifact-1",
      title: "Untitled",
      mode: "slideshow",
    });
    expect(readCourseDocumentMode(initialized.content)).toBe("slideshow");
    expect(initialized.content).toMatchObject({
      content: [
        {
          content: [
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
    expect(getCourseDocumentDefaultsForMode("branching")).toEqual({
      mode: "branching",
      surfaceSize: "fluid",
      overflowMode: "grow",
    });
  });

  it("rejects surface sizes that conflict with course mode", () => {
    expect(() =>
      createScaffoldDocumentContent({ mode: "slideshow", surfaceSize: "fluid" }),
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
      status: "ready",
      artifact: {
        id: "artifact-1",
        title: "Untitled",
        mode: "page",
        content,
      },
      source: "stored",
    });
  });

  it("migrates stored v1 content before reading current attrs", () => {
    const content = createScaffoldDocumentContent({ mode: "page" });
    const courseDocument = content.content?.[0];
    if (!courseDocument?.attrs) throw new Error("Expected courseDocument attrs.");
    courseDocument.attrs = { ...courseDocument.attrs, schemaVersion: 1 };

    const prepared = prepareScaffoldArtifactForAuthoring({
      id: "artifact-1",
      title: "Untitled",
      mode: "page",
      content,
    });

    expect(prepared).toMatchObject({
      status: "ready",
      artifact: {
        content: {
          content: [{ attrs: { schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION } }],
        },
      },
      source: "stored",
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
      status: "ready",
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
      status: "error",
      message: expect.stringContaining("newer than this runtime supports"),
    });
  });

  it("rejects unmigratable legacy Gallery content", () => {
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
      status: "error",
      message: expect.stringContaining("could not be migrated"),
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
      status: "error",
      message: 'Scaffold artifact mode "slideshow" does not match content mode "page".',
    });
  });
});
