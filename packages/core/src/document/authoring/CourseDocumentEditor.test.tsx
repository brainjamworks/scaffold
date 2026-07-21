// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSONContent } from "@tiptap/core";
import { Fragment, Slice } from "@tiptap/pm/model";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import * as Y from "yjs";

import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";

import { COURSE_DOCUMENT_FRAGMENT } from "@/document/model/constants";
import { initializeCourseDocumentFragment } from "@/document/model/initialize-document";
import { slideCoverSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-cover";
import { CourseDocumentEditor } from "./CourseDocumentEditor";
import { initializeAuthoringCourseDocumentFragment } from "./initialize-authoring-document";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function createInitializedDocument(mode: "page" | "slideshow" = "page"): Y.Doc {
  const document = new Y.Doc();
  initializeCourseDocumentFragment(document, { mode });
  return document;
}

function createSlideshowDocumentWithSurfaces(surfaceIds: string[]): Y.Doc {
  const document = new Y.Doc();
  initializeAuthoringCourseDocumentFragment(document, authoringSlideshowDocument(surfaceIds));
  return document;
}

describe("CourseDocumentEditor", () => {
  it("reports document changes without serializing the editor", async () => {
    const document = createInitializedDocument();
    const onChange = vi.fn();
    const onReady = vi.fn();

    render(
      createElement(CourseDocumentEditor, {
        document,
        onChange,
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = onReady.mock.calls[0]?.[0];
    if (!editor) throw new Error("CourseDocumentEditor did not provide an editor");
    onChange.mockClear();
    const getJSON = vi.spyOn(editor, "getJSON");

    editor.commands.insertContent("a");

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(editor));
    expect(getJSON).not.toHaveBeenCalled();
  });

  it("mounts a prepared Yjs document with one page surface", async () => {
    const document = createInitializedDocument();
    const onReady = vi.fn();
    const onUpdate = vi.fn();

    render(
      createElement(CourseDocumentEditor, {
        document,
        onReady,
        onUpdate,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    const editor = onReady.mock.calls[0]?.[0];
    await waitFor(() => {
      expect(editor.getJSON().content?.[0]?.type).toBe("courseDocument");
    });

    const json = editor.getJSON();
    const courseDocument = json.content?.[0];
    const surface = courseDocument?.content?.[0];

    expect(screen.getByTestId("course-document-editor")).toBeInTheDocument();
    const editorRoot = screen.getByTestId("course-document-editor");
    await waitFor(() => {
      expect(editorRoot.querySelectorAll(":scope > [data-scaffold-overlay-host]")).toHaveLength(1);
    });
    expect(
      editorRoot.querySelector(".sc-authoring-chrome-root > [data-scaffold-overlay-host]"),
    ).toBeNull();
    expect(document.getXmlFragment(COURSE_DOCUMENT_FRAGMENT).length).toBeGreaterThan(0);
    expect(courseDocument?.attrs).toMatchObject({
      schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
      mode: "page",
      surfaceSize: "fluid",
      overflowMode: "grow",
    });
    expect(surface?.type).toBe("surface");
    expect(surface?.attrs?.["id"]).toEqual(expect.stringMatching(/^[0-9A-Z_a-z-]{12}$/));
    expect(editor.schema.nodes.mcq).toBeDefined();
    const uniqueIdExtension = editor.extensionManager.extensions.find(
      (extension: { name: string }) => extension.name === "uniqueID",
    );
    expect(uniqueIdExtension?.options.types).toEqual(
      expect.arrayContaining(["surface", "cell", "section", "mcq", "chart_block"]),
    );
    expect(uniqueIdExtension?.options.types).not.toBe("all");
    expect(uniqueIdExtension?.options.updateDocument).toBe(true);
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ type: "doc" }));
  });

  it("renders initialized slideshow documents in slideshow mode", async () => {
    const document = createInitializedDocument("slideshow");
    const onReady = vi.fn();

    render(
      createElement(CourseDocumentEditor, {
        document,
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    const editor = onReady.mock.calls[0]?.[0];
    await waitFor(() => {
      expect(editor.getJSON().content?.[0]?.attrs).toMatchObject({
        mode: "slideshow",
      });
    });
    expect(screen.getByRole("region", { name: "Slide canvas" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Page canvas" })).toBeNull();
  });

  it("renders authoring-only dividers after slideshow surfaces", async () => {
    const document = createSlideshowDocumentWithSurfaces(["slide-1", "slide-2", "slide-3"]);
    const onReady = vi.fn();

    render(
      createElement(CourseDocumentEditor, {
        document,
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(screen.getAllByTestId("authoring-slide-divider")).toHaveLength(3);
    });
    expect(screen.getByRole("button", { name: "Add slide after slide 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add slide after slide 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add slide after slide 3" })).toBeInTheDocument();

    const surfaceIds = Array.from(
      globalThis.document.body.querySelectorAll("[data-surface-id]"),
      (element) => element.getAttribute("data-surface-id"),
    );
    expect(surfaceIds).toEqual(["slide-1", "slide-2", "slide-3"]);
  });

  it("scopes slideshow transforms to each surface while dividers stay in document flow", async () => {
    const document = createSlideshowDocumentWithSurfaces(["slide-1", "slide-2"]);
    const onReady = vi.fn();

    render(createElement(CourseDocumentEditor, { document, onReady }));

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const stages = globalThis.document.body.querySelectorAll("[data-authoring-surface-stage]");
    const surfaces = globalThis.document.body.querySelectorAll("[data-surface]");
    const dividers = screen.getAllByTestId("authoring-slide-divider");

    expect(stages).toHaveLength(2);
    expect(surfaces).toHaveLength(2);
    expect(surfaces[0]?.closest("[data-authoring-surface-stage]")).toBe(stages[0]);
    expect(surfaces[1]?.closest("[data-authoring-surface-stage]")).toBe(stages[1]);
    expect(dividers).toHaveLength(2);
    expect(dividers.every((divider) => !divider.closest("[data-authoring-surface-stage]"))).toBe(
      true,
    );
  });

  it("renders an authoring-only divider after a single slideshow surface", async () => {
    const document = createSlideshowDocumentWithSurfaces(["slide-1"]);
    const onReady = vi.fn();

    render(
      createElement(CourseDocumentEditor, {
        document,
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(screen.getAllByTestId("authoring-slide-divider")).toHaveLength(1);
    });
    expect(screen.getByRole("button", { name: "Add slide after slide 1" })).toBeInTheDocument();
  });

  it("opens the slide template picker from the divider control", async () => {
    const user = userEvent.setup();
    const document = createSlideshowDocumentWithSurfaces(["slide-1"]);
    const onReady = vi.fn();

    render(
      createElement(CourseDocumentEditor, {
        document,
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = onReady.mock.calls[0]?.[0];

    await user.click(screen.getByRole("button", { name: "Add slide after slide 1" }));

    const dialog = await screen.findByRole("dialog", { name: "Choose slide template" });
    expect(within(dialog).getByRole("region", { name: "Title layouts" })).toBeInTheDocument();
    expect(within(dialog).getByRole("region", { name: "Content layouts" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Cover" })).toBeInTheDocument();
    expect(
      globalThis.document.body.querySelector('[data-surface-template-preview="slide-cover"]'),
    ).toBeDefined();

    await user.click(within(dialog).getByRole("button", { name: "Cover" }));

    await waitFor(() => {
      expect(screen.getAllByTestId("authoring-slide-divider")).toHaveLength(2);
    });

    const surfaces = editor.getJSON().content?.[0]?.content ?? [];
    expect(surfaces).toHaveLength(2);
    expect(surfaces.map((surface: JSONContent) => surface.attrs?.["variant"])).toEqual([
      "slide-cover",
      "slide-cover",
    ]);
    expect(screen.queryByRole("dialog", { name: "Choose slide template" })).toBeNull();
    expect(JSON.stringify(editor.getJSON())).not.toContain("authoring-slide-divider");
  });

  it("does not persist slideshow dividers into document JSON", async () => {
    const document = createSlideshowDocumentWithSurfaces(["slide-1", "slide-2"]);
    const onReady = vi.fn();

    render(
      createElement(CourseDocumentEditor, {
        document,
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = onReady.mock.calls[0]?.[0];
    await waitFor(() => {
      expect(screen.getAllByTestId("authoring-slide-divider")).toHaveLength(2);
    });

    const json = editor.getJSON();
    const courseDocument = json.content?.[0];
    expect(courseDocument?.content?.map((node: JSONContent) => node.type)).toEqual([
      "surface",
      "surface",
    ]);
    expect(JSON.stringify(json)).not.toContain("authoring-slide-divider");
  });

  it("does not render slide dividers for page documents", async () => {
    const document = createInitializedDocument("page");
    const onReady = vi.fn();

    render(
      createElement(CourseDocumentEditor, {
        document,
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    expect(screen.queryByTestId("authoring-slide-divider")).toBeNull();
    expect(globalThis.document.body.querySelector("[data-authoring-surface-stage]")).toBeNull();
  });

  it("mounts saved composite assessment content without invalid initial text selection warnings", async () => {
    const document = new Y.Doc();
    initializeAuthoringCourseDocumentFragment(document, authoringDocumentWithMcq());
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const onReady = vi.fn();

    render(
      createElement(CourseDocumentEditor, {
        document,
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = onReady.mock.calls[0]?.[0];

    await waitFor(() => {
      expect(editor.getJSON().content?.[0]?.type).toBe("courseDocument");
    });

    expect(findFirstNodeOfType(editor.getJSON(), "mcq")?.type).toBe("mcq");
    expect(await screen.findByRole("button", { name: "Add choice" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit 1 hint" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show feedback" })).toBeInTheDocument();
    expect(
      warn.mock.calls.some((args) =>
        args.some((arg) =>
          String(arg).includes(
            "TextSelection endpoint not pointing into a node with inline content",
          ),
        ),
      ),
    ).toBe(false);
  });

  it("mounts persisted v2 Gallery content without legacy authoring state", async () => {
    const document = new Y.Doc();
    initializeAuthoringCourseDocumentFragment(document, authoringDocumentWithGallery());
    const onReady = vi.fn();

    render(createElement(CourseDocumentEditor, { document, onReady }));

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = onReady.mock.calls[0]?.[0];
    expect(await screen.findByText("Shared authoring caption")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open First gallery image fullscreen" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("First gallery image caption")).toBeNull();

    const gallery = findFirstNodeOfType(editor.getJSON(), "gallery");
    expect(gallery?.attrs?.["data"]).toEqual({
      type: "gallery",
      layout: "carousel",
      caption: richTextDocument("Shared authoring caption"),
    });
    expect(gallery?.content?.map((item: JSONContent) => item.attrs?.["id"])).toEqual([
      "gallery-item-1",
      "gallery-item-2",
    ]);
    expect(JSON.stringify(gallery)).not.toContain("showCaptions");
  });

  it("does not let UniqueID mutate readonly editor documents", async () => {
    const document = createInitializedDocument();
    const onReady = vi.fn();

    render(
      createElement(CourseDocumentEditor, {
        document,
        editable: false,
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    const editor = onReady.mock.calls[0]?.[0];
    const uniqueIdExtension = editor.extensionManager.extensions.find(
      (extension: { name: string }) => extension.name === "uniqueID",
    );

    expect(uniqueIdExtension?.options.updateDocument).toBe(false);
  });

  it("keeps the live editor mounted while its authoring view is suspended", async () => {
    const document = createInitializedDocument();
    const onReady = vi.fn();
    const { rerender } = render(
      createElement(CourseDocumentEditor, {
        document,
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = onReady.mock.calls[0]?.[0];

    expect(editor.isEditable).toBe(true);
    expect(screen.getByTestId("course-document-editor")).toBeInTheDocument();

    rerender(
      createElement(CourseDocumentEditor, {
        document,
        onReady,
        suspended: true,
      }),
    );

    await waitFor(() => expect(editor.isEditable).toBe(false));
    expect(editor.isDestroyed).toBe(false);
    expect(screen.queryByTestId("course-document-editor")).toBeNull();
    expect(onReady).toHaveBeenCalledTimes(1);

    rerender(
      createElement(CourseDocumentEditor, {
        document,
        onReady,
        suspended: false,
      }),
    );

    await waitFor(() => expect(editor.isEditable).toBe(true));
    expect(screen.getByTestId("course-document-editor")).toBeInTheDocument();
    expect(editor.isDestroyed).toBe(false);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("generates a stable id for an inserted addressable block", async () => {
    const document = createInitializedDocument();
    const onReady = vi.fn();

    render(
      createElement(CourseDocumentEditor, {
        document,
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = onReady.mock.calls[0]?.[0];

    await waitFor(() => {
      expect(editor.getJSON().content?.[0]?.type).toBe("courseDocument");
    });

    expect(editor.commands.insertContent({ type: "chart_block" })).toBe(true);

    let chartId: unknown;
    editor.state.doc.descendants((node: ProseMirrorNode) => {
      if (node.type.name === "chart_block") {
        chartId = node.attrs["id"];
        return false;
      }
      return true;
    });

    expect(chartId).toEqual(expect.stringMatching(/^[0-9A-Z_a-z-]{12}$/));
  });

  it("regenerates nested component ids in pasted structured blocks", async () => {
    const document = createInitializedDocument();
    const onReady = vi.fn();

    render(
      createElement(CourseDocumentEditor, {
        document,
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = onReady.mock.calls[0]?.[0];
    await waitFor(() => {
      expect(editor.schema.nodes.chart_block).toBeDefined();
    });

    const chart = editor.schema.nodeFromJSON({
      type: "chart_block",
      attrs: {
        id: "block-chart",
        data: {
          kind: "chart",
          version: 1,
          chartType: "bar",
          caption: "Votes",
          data: {
            kind: "inlineTable",
            columns: [
              { id: "category", label: "Fruit", valueType: "category" },
              { id: "value", label: "Votes", valueType: "number" },
            ],
            rows: [{ id: "row-a", cells: { category: "Apples", value: 12 } }],
          },
          encoding: {
            chartType: "bar",
            x: { columnId: "category" },
            y: [{ columnId: "value" }],
          },
        },
      },
    });
    let slice = new Slice(Fragment.from(chart), 0, 0);

    editor.view.someProp(
      "transformPasted",
      (transformPasted: (slice: Slice, view: EditorView, plain: boolean) => Slice) => {
        slice = transformPasted(slice, editor.view, false);
        return false;
      },
    );

    const pasted = slice.content.firstChild?.toJSON();
    const data = pasted?.attrs?.["data"] as {
      data: {
        columns: Array<{ id: string }>;
        rows: Array<{ id: string; cells: Record<string, unknown> }>;
      };
      encoding: {
        x: { columnId: string };
        y: Array<{ columnId: string }>;
      };
    };
    const categoryId = data.data.columns[0]?.id;
    const valueId = data.data.columns[1]?.id;

    if (!categoryId || !valueId) {
      throw new Error("expected pasted chart columns to have stable ids");
    }

    expect(categoryId).toEqual(expect.stringMatching(/^[0-9A-Z_a-z-]{12}$/));
    expect(valueId).toEqual(expect.stringMatching(/^[0-9A-Z_a-z-]{12}$/));
    expect(data.data.rows[0]?.id).toEqual(expect.stringMatching(/^[0-9A-Z_a-z-]{12}$/));
    expect(data.data.rows[0]?.cells).toEqual({
      [categoryId]: "Apples",
      [valueId]: 12,
    });
    expect(data.encoding.x.columnId).toBe(categoryId);
    expect(data.encoding.y[0]?.columnId).toBe(valueId);
  });

  it("regenerates a pasted surface instance id while preserving its variant and current shape", async () => {
    const document = createSlideshowDocumentWithSurfaces(["slide-1"]);
    const onReady = vi.fn();

    render(createElement(CourseDocumentEditor, { document, onReady }));

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = onReady.mock.calls[0]?.[0];
    const source = slideCoverSurfaceDefinition.createSurface({ surfaceId: "pasted-slide" });
    const sourceNode = editor.schema.nodeFromJSON(source);
    let slice = new Slice(Fragment.from(sourceNode), 0, 0);

    editor.view.someProp(
      "transformPasted",
      (transformPasted: (slice: Slice, view: EditorView, plain: boolean) => Slice) => {
        slice = transformPasted(slice, editor.view, false);
        return false;
      },
    );

    const pasted = slice.content.firstChild?.toJSON();
    expect(pasted?.attrs?.["id"]).toEqual(expect.stringMatching(/^[0-9A-Z_a-z-]{12}$/));
    expect(pasted?.attrs?.["id"]).not.toBe("pasted-slide");
    expect(pasted?.attrs?.["variant"]).toBe("slide-cover");
    expect(pasted?.attrs?.["settings"]).toEqual(source.attrs?.["settings"]);
    expect(pasted?.content).toEqual(source.content);
  });
});

function authoringDocumentWithMcq(): JSONContent {
  return {
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
            attrs: { id: "surface-mcq", variant: "page-default" },
            content: [
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
                    content: [
                      {
                        type: "assessment_hints_group",
                        content: [
                          {
                            type: "assessment_hint",
                            content: [
                              {
                                type: "paragraph",
                                content: [{ type: "text", text: "Use elimination." }],
                              },
                            ],
                          },
                        ],
                      },
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
  };
}

function authoringDocumentWithGallery(): JSONContent {
  return {
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
            attrs: { id: "surface-gallery", variant: "page-default" },
            content: [
              {
                type: "gallery",
                attrs: {
                  id: "gallery-authoring",
                  data: {
                    type: "gallery",
                    layout: "carousel",
                    caption: richTextDocument("Shared authoring caption"),
                  },
                },
                content: [
                  galleryItem("gallery-item-1", "First gallery image", "first.jpg"),
                  galleryItem("gallery-item-2", "Second gallery image", "second.jpg"),
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function galleryItem(id: string, alt: string, fileName: string): JSONContent {
  return {
    type: "gallery_item",
    attrs: {
      id,
      data: {
        image: { mode: "external", src: `https://example.com/${fileName}`, alt },
        caption: richTextDocument(`${alt} caption`),
      },
    },
  };
}

function richTextDocument(text: string): JSONContent {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

function authoringSlideshowDocument(surfaceIds: string[]): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: {
          schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
          mode: "slideshow",
          surfaceSize: "16x9",
          overflowMode: "clip",
        },
        content: surfaceIds.map((surfaceId) =>
          slideCoverSurfaceDefinition.createSurface({ surfaceId }),
        ),
      },
    ],
  };
}

function findFirstNodeOfType(node: JSONContent | undefined, type: string): JSONContent | null {
  if (!node) return null;
  if (node.type === type) return node;
  for (const child of node.content ?? []) {
    const match = findFirstNodeOfType(child, type);
    if (match) return match;
  }
  return null;
}
