// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Extension, Node, type Editor as TiptapEditor, type JSONContent } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  createScaffoldApplication,
  defineScaffoldExtensionPack,
  type BlockCapability,
  type SurfaceCapability,
} from "@/composition/application/create-scaffold-application";
import { getScaffoldCapabilitiesForEditor } from "@/composition/extensions/scaffold-capabilities-storage";
import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";
import { calloutBlockDefinition } from "@/editor/blocks/presentation/callout/callout-definition";
import { createBlockInsertActions } from "@/editor/insertion/block-insert-action";
import { createInsertCatalog } from "@/editor/insertion/insert-catalog";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { createLayerWithContent } from "@/document/model/layers/layer-construction";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import type { SurfaceAuthoringViewProps } from "../../editor/surfaces/shared/surface-view-props";
import type { SurfaceRuntimeViewProps } from "../../editor/surfaces/shared/surface-view-props";
import { SurfaceRuntimeFrame } from "@/editor/surfaces/runtime/views/SurfaceRuntimeFrame";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";
import { getSemanticTargetInteractionEnvironmentForEditor } from "@/document/semantic-target-interaction";

import {
  checkRuntimeDocumentReadiness,
  CourseDocumentRuntimeRenderer as PublicCourseDocumentRuntimeRenderer,
  type CourseDocumentRuntimeRendererProps,
} from "./CourseDocumentRuntimeRenderer";

const runtimeComposition = createCoreScaffoldRuntimeComposition();
const coreProductAccess = { scaffoldPlusAuthorized: false } as const;
const plusProductAccess = { scaffoldPlusAuthorized: true } as const;

const calloutInsertCatalog = createInsertCatalog(
  createBlockInsertActions([calloutBlockDefinition]),
);
const documentEstablishmentCalls = vi.hoisted(() => vi.fn());

vi.mock("@/document/model/establishment/establish-authoring-document", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/document/model/establishment/establish-authoring-document")
    >();
  return {
    ...actual,
    establishAuthoringDocument: (...args: Parameters<typeof actual.establishAuthoringDocument>) => {
      documentEstablishmentCalls(...args);
      return actual.establishAuthoringDocument(...args);
    },
  };
});

function CourseDocumentRuntimeRenderer(
  props: Omit<CourseDocumentRuntimeRendererProps, "productAccess"> & {
    productAccess?: CourseDocumentRuntimeRendererProps["productAccess"];
  },
) {
  if (props.initialContent) normalizeRuntimeFixtureIds(props.initialContent);
  return (
    <PublicCourseDocumentRuntimeRenderer
      {...props}
      productAccess={props.productAccess ?? coreProductAccess}
    />
  );
}

function normalizeRuntimeFixtureIds(content: JSONContent): void {
  const seen = new Set<string>();
  const stack = [content];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.type !== "doc" && node.type !== "text") {
      const id = node.attrs?.id;
      if (!EmbeddedNodeIdSchema.safeParse(id).success || seen.has(String(id))) {
        node.attrs = { ...node.attrs, id: createEmbeddedNodeId() };
      }
      seen.add(String(node.attrs?.id));
    }
    stack.push(...(node.content ?? []));
  }
}

beforeEach(() => {
  documentEstablishmentCalls.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function paragraph(text: string): JSONContent {
  return {
    type: "paragraph",
    content: [{ type: "text", text }],
  };
}

function slideshowDocumentContent(): JSONContent {
  const content = createScaffoldDocumentContent({
    initialCourseSectionTitle: "Runtime section",
    mode: "slideshow",
    surfaceId: "slide_000001",
  });
  const courseDocument = content.content?.[0];

  if (!courseDocument) {
    throw new Error("runtime renderer test document is missing courseDocument");
  }

  courseDocument.attrs = {
    ...courseDocument.attrs,
    mode: "slideshow",
  };
  courseDocument.content = [
    {
      type: "courseSection",
      attrs: { id: "section00001", title: "Runtime section" },
    },
    {
      type: "surface",
      attrs: { id: "slide_000001", variant: "slide-cover" },
      content: [paragraph("First slide content")],
    },
    {
      type: "surface",
      attrs: { id: "slide_000002", variant: "slide-cover" },
      content: [paragraph("Second slide content")],
    },
    {
      type: "surface",
      attrs: { id: "slide_000003", variant: "slide-cover" },
      content: [paragraph("Third slide content")],
    },
  ];

  return content;
}

function sectionedSlideshowDocumentContent(): JSONContent {
  const content = slideshowDocumentContent();
  const courseDocument = content.content?.[0];
  if (!courseDocument?.content) {
    throw new Error("sectioned runtime renderer fixture is missing Course Document content");
  }
  const [, firstSurface, secondSurface, thirdSurface] = courseDocument.content;
  courseDocument.content = [
    {
      type: "courseSection",
      attrs: { id: "section00001", title: "Introduction" },
    },
    firstSurface!,
    secondSurface!,
    {
      type: "courseSection",
      attrs: { id: "section00002", title: "Practice" },
    },
    thirdSurface!,
  ];
  return content;
}

function pageDocumentContent(): JSONContent {
  const content = createScaffoldDocumentContent({
    mode: "page",
    surfaceId: "surface-page",
  });
  const courseDocument = content.content?.[0];
  const surface = courseDocument?.content?.[0];

  if (!surface) {
    throw new Error("runtime renderer test page is missing its surface");
  }

  surface.content = [paragraph("Page content")];

  return content;
}

function tabsDocumentContent(): JSONContent {
  const content = pageDocumentContent();
  const surface = content.content?.[0]?.content?.[0];

  if (!surface) {
    throw new Error("runtime renderer tabs fixture is missing its surface");
  }

  surface.content = [
    {
      type: "layout",
      attrs: {
        id: "layout000001",
        variant: "tabs",
        options: { label: "Topics", variant: "default" },
      },
      content: [
        {
          type: "section",
          attrs: { id: "section00011", role: "tab-panel", verticalPosition: "top" },
          content: [
            createLayerWithContent([
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "First topic resource",
                    marks: [{ type: "link", attrs: { href: "https://example.com/first-topic" } }],
                  },
                ],
              },
            ]),
          ],
        },
        {
          type: "section",
          attrs: { id: "section00012", role: "tab-panel", verticalPosition: "top" },
          content: [createLayerWithContent([paragraph("Second topic")])],
        },
      ],
    },
  ];

  return content;
}

function surfaceById(surfaceId: string): HTMLElement {
  const surface = document.body.querySelector(`[data-node="surface"][data-id="${surfaceId}"]`);

  if (!(surface instanceof HTMLElement)) {
    throw new Error(`surface ${surfaceId} was not rendered`);
  }

  return surface;
}

describe("CourseDocumentRuntimeRenderer", () => {
  it("establishes a direct raw document exactly once before constructing Tiptap", async () => {
    const content = pageDocumentContent();
    normalizeRuntimeFixtureIds(content);
    const onReady = vi.fn();

    render(
      <PublicCourseDocumentRuntimeRenderer
        composition={runtimeComposition}
        initialContent={content}
        onReady={onReady}
        productAccess={coreProductAccess}
      />,
    );

    expect(await screen.findByTestId("course-document-runtime-renderer")).toBeInTheDocument();
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(documentEstablishmentCalls).toHaveBeenCalledTimes(1);
  });

  it("refuses a Plus-required learner document before constructing Tiptap", () => {
    const content = pageDocumentContent();
    content.content![0]!.attrs!["requiresScaffoldPlus"] = true;
    const onReady = vi.fn();

    expect(checkRuntimeDocumentReadiness(content, runtimeComposition, coreProductAccess)).toEqual({
      status: "requires-scaffold-plus",
    });

    render(
      <PublicCourseDocumentRuntimeRenderer
        composition={runtimeComposition}
        initialContent={content}
        onReady={onReady}
        productAccess={coreProductAccess}
      />,
    );

    expect(onReady).not.toHaveBeenCalled();
    expect(screen.queryByTestId("course-document-runtime-renderer")).toBeNull();
  });

  it("renders a Plus-required learner document after product access succeeds", async () => {
    const content = pageDocumentContent();
    content.content![0]!.attrs!["requiresScaffoldPlus"] = true;
    normalizeRuntimeFixtureIds(content);

    const readiness = checkRuntimeDocumentReadiness(content, runtimeComposition, plusProductAccess);
    if (readiness.status !== "supported") {
      throw new Error(`Expected supported runtime content: ${JSON.stringify(readiness)}`);
    }

    render(
      <PublicCourseDocumentRuntimeRenderer
        composition={runtimeComposition}
        initialContent={content}
        productAccess={plusProductAccess}
      />,
    );

    await waitFor(() => expect(screen.getByText("Page content")).toBeInTheDocument());
  });

  it.each([
    {
      name: "future format",
      mutate: (content: JSONContent) => {
        content.content![0]!.attrs!.schemaVersion = SCAFFOLD_DOCUMENT_FORMAT_VERSION + 1;
      },
    },
    {
      name: "invalid Course attrs",
      mutate: (content: JSONContent) => {
        delete content.content![0]!.attrs!.theme;
      },
    },
    {
      name: "missing mounted ID",
      mutate: (content: JSONContent) => {
        delete content.content![0]!.content![0]!.attrs!.id;
      },
    },
  ])("does not construct Tiptap for $name", ({ mutate }) => {
    const content = pageDocumentContent();
    mutate(content);
    const onReady = vi.fn();

    render(
      <PublicCourseDocumentRuntimeRenderer
        composition={runtimeComposition}
        initialContent={content}
        onReady={onReady}
        productAccess={coreProductAccess}
      />,
    );

    expect(onReady).not.toHaveBeenCalled();
    expect(screen.queryByTestId("course-document-runtime-renderer")).toBeNull();
  });

  it("does not construct Tiptap for compatibility working JSON", () => {
    const content = pageDocumentContent();
    content.content![0]!.content![0]!.content = [
      {
        type: "unavailable_block",
        attrs: {
          id: "plusblock001",
          capabilityId: "plus_private_block",
          original: {
            type: "plus_private_block",
            attrs: { id: "plusblock001", private: "must-not-render" },
          },
        },
      },
    ];
    const onReady = vi.fn();

    render(
      <CourseDocumentRuntimeRenderer
        composition={runtimeComposition}
        initialContent={content}
        onReady={onReady}
      />,
    );

    expect(onReady).not.toHaveBeenCalled();
    expect(screen.queryByTestId("course-document-runtime-renderer")).toBeNull();
    expect(document.body).not.toHaveTextContent("must-not-render");
  });

  it("refuses a throwing accessor without reading it before bounded establishment", () => {
    let invoked = false;
    const content = Object.defineProperty({}, "type", {
      enumerable: true,
      get() {
        invoked = true;
        throw new Error("hostile accessor");
      },
    }) as JSONContent;

    expect(() =>
      checkRuntimeDocumentReadiness(content, runtimeComposition, coreProductAccess),
    ).not.toThrow();
    expect(checkRuntimeDocumentReadiness(content, runtimeComposition, coreProductAccess)).toEqual({
      status: "invalid-learner-content",
      issues: expect.any(Array),
    });
    expect(invoked).toBe(false);
  });

  it("refuses a throwing property-read Proxy before renderer or onReady work", () => {
    const content = new Proxy(
      { type: "doc" },
      {
        get() {
          throw new Error("hostile read trap");
        },
      },
    ) as JSONContent;
    const onReady = vi.fn();

    expect(() =>
      render(
        <PublicCourseDocumentRuntimeRenderer
          composition={runtimeComposition}
          initialContent={content}
          onReady={onReady}
          productAccess={coreProductAccess}
        />,
      ),
    ).not.toThrow();
    expect(onReady).not.toHaveBeenCalled();
    expect(screen.queryByTestId("course-document-runtime-renderer")).toBeNull();
  });

  it("does not construct Tiptap for unknown learner nodes", () => {
    const content = pageDocumentContent();
    content.content![0]!.content![0]!.content = [
      { type: "plus_private_block", attrs: { id: "plusblock001" } },
    ];
    const onReady = vi.fn();

    render(
      <CourseDocumentRuntimeRenderer
        composition={runtimeComposition}
        initialContent={content}
        onReady={onReady}
      />,
    );

    expect(onReady).not.toHaveBeenCalled();
    expect(screen.queryByTestId("course-document-runtime-renderer")).toBeNull();
  });

  it("publishes named read-only document semantics without flattening nested controls", async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();
    const content = tabsDocumentContent();
    normalizeRuntimeFixtureIds(content);

    const readiness = checkRuntimeDocumentReadiness(content, runtimeComposition, coreProductAccess);
    expect(readiness.status).toBe("supported");
    if (readiness.status !== "supported") throw new Error("Expected supported runtime content.");
    expect(readiness.preparedDocument.content).toEqual(content);
    expect(readiness.preparedDocument.composition).toBe(runtimeComposition);

    render(
      <CourseDocumentRuntimeRenderer
        composition={runtimeComposition}
        artifactId="artifact-accessibility"
        initialContent={content}
        onReady={onReady}
      />,
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    const runtimeDocument = screen.getByRole("document", { name: "Course content" });
    expect(runtimeDocument).toHaveAttribute("contenteditable", "false");
    expect(screen.queryByRole("textbox")).toBeNull();

    const link = screen.getByRole("link", { name: "First topic resource" });
    link.focus();
    expect(document.activeElement).toBe(link);

    const tabs = screen.getAllByRole("tab");
    tabs[1]!.focus();
    await user.keyboard("{Enter}");
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(tabs[1]);
  });

  it("starts a fresh editor when runtime composition identity changes", async () => {
    const surfaceVariant = "private-identity-surface";
    const firstBlock = privateRuntimeBlockCapability("first_private_runtime_block");
    const secondBlock = privateRuntimeBlockCapability("second_private_runtime_block");
    const firstComposition = createScaffoldApplication({
      packs: [
        defineScaffoldExtensionPack({
          id: "first-private-runtime-identity",
          blocks: [firstBlock],
          surfaces: [privateRuntimeSurfaceCapability(surfaceVariant, "first")],
        }),
      ],
    }).runtime;
    const secondComposition = createScaffoldApplication({
      packs: [
        defineScaffoldExtensionPack({
          id: "second-private-runtime-identity",
          blocks: [secondBlock],
          surfaces: [privateRuntimeSurfaceCapability(surfaceVariant, "second")],
        }),
      ],
    }).runtime;
    const initialContent = privateSurfaceDocumentContent(surfaceVariant);
    const readyEditors: TiptapEditor[] = [];
    const onReady = vi.fn((editor: TiptapEditor) => readyEditors.push(editor));
    const { rerender } = render(
      <CourseDocumentRuntimeRenderer
        composition={firstComposition}
        initialContent={initialContent}
        onReady={onReady}
      />,
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(getScaffoldCapabilitiesForEditor(readyEditors[0]!)).toBe(firstComposition.capabilities);
    expect(readyEditors[0]?.schema.nodes[firstBlock.definition.nodeType]).toBeDefined();
    expect(readyEditors[0]?.schema.nodes[secondBlock.definition.nodeType]).toBeUndefined();
    expect(document.body.querySelector('[data-private-runtime-view="first"]')).not.toBeNull();

    rerender(
      <CourseDocumentRuntimeRenderer
        composition={firstComposition}
        initialContent={initialContent}
        onReady={onReady}
      />,
    );
    expect(onReady).toHaveBeenCalledTimes(1);

    rerender(
      <CourseDocumentRuntimeRenderer
        composition={secondComposition}
        initialContent={initialContent}
        onReady={onReady}
      />,
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(2));
    expect(readyEditors[1]).not.toBe(readyEditors[0]);
    expect(readyEditors[0]?.isDestroyed).toBe(true);
    expect(getScaffoldCapabilitiesForEditor(readyEditors[1]!)).toBe(secondComposition.capabilities);
    expect(readyEditors[1]?.schema.nodes[secondBlock.definition.nodeType]).toBeDefined();
    expect(readyEditors[1]?.schema.nodes[firstBlock.definition.nodeType]).toBeUndefined();
    expect(readyEditors[1]?.state).not.toBe(readyEditors[0]?.state);
    expect(document.body.querySelector('[data-private-runtime-view="second"]')).not.toBeNull();
    expect(document.body.querySelector('[data-private-runtime-view="first"]')).toBeNull();
  });

  it("marks the visible surface and hides inactive surfaces", async () => {
    const onReady = vi.fn();

    render(
      <CourseDocumentRuntimeRenderer
        composition={runtimeComposition}
        artifactId="artifact-renderer"
        initialContent={slideshowDocumentContent()}
        visibleSurfaceId="slide_000002"
        onReady={onReady}
      />,
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    const inactiveSurface = surfaceById("slide_000001");
    const activeSurface = surfaceById("slide_000002");

    expect(activeSurface.getAttribute("data-runtime-surface-visible")).toBe("true");
    expect(activeSurface.hasAttribute("data-runtime-surface-hidden")).toBe(false);
    expect(activeSurface.hasAttribute("hidden")).toBe(false);
    expect(activeSurface.getAttribute("aria-hidden")).toBeNull();

    expect(inactiveSurface.getAttribute("data-runtime-surface-hidden")).toBe("true");
    expect(inactiveSurface.hasAttribute("hidden")).toBe(true);
    expect(inactiveSurface.getAttribute("aria-hidden")).toBe("true");
    expect(inactiveSurface.hasAttribute("data-runtime-surface-visible")).toBe(false);
  });

  it("mounts isolated runtime environments that present Surfaces without authoring effects", async () => {
    const readyEditors: TiptapEditor[] = [];
    const onReady = vi.fn((editor: TiptapEditor) => readyEditors.push(editor));
    const initiatingControl = document.createElement("button");
    document.body.append(initiatingControl);
    initiatingControl.focus();
    const click = vi.spyOn(HTMLElement.prototype, "click");
    const view = render(
      <div>
        <div data-testid="first-semantic-runtime">
          <CourseDocumentRuntimeRenderer
            composition={runtimeComposition}
            initialContent={slideshowDocumentContent()}
            visibleSurfaceId="slide_000001"
            onReady={onReady}
          />
        </div>
        <div data-testid="second-semantic-runtime">
          <CourseDocumentRuntimeRenderer
            composition={runtimeComposition}
            initialContent={slideshowDocumentContent()}
            visibleSurfaceId="slide_000001"
            onReady={onReady}
          />
        </div>
      </div>,
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(2));
    const firstEditor = readyEditors[0]!;
    const secondEditor = readyEditors[1]!;
    const firstEnvironment = getSemanticTargetInteractionEnvironmentForEditor(firstEditor);
    const secondEnvironment = getSemanticTargetInteractionEnvironmentForEditor(secondEditor);
    const beforeSelection = firstEditor.state.selection.toJSON();

    expect(firstEnvironment).not.toBe(secondEnvironment);
    expect(firstEnvironment.registry).not.toBe(secondEnvironment.registry);
    await expect(
      firstEnvironment.coordinator.activate(EmbeddedNodeIdSchema.parse("slide_000002"), {
        origin: "configured-presentation",
      }),
    ).resolves.toEqual({
      kind: "reached",
      requestedId: "slide_000002",
    });

    const firstRuntime = screen.getByTestId("first-semantic-runtime");
    const secondRuntime = screen.getByTestId("second-semantic-runtime");
    await waitFor(() =>
      expect(firstRuntime.querySelector('[data-id="slide_000002"]')).toHaveAttribute(
        "data-runtime-surface-visible",
        "true",
      ),
    );
    expect(secondRuntime.querySelector('[data-id="slide_000001"]')).toHaveAttribute(
      "data-runtime-surface-visible",
      "true",
    );
    expect(firstEditor.state.selection.toJSON()).toEqual(beforeSelection);
    expect(document.activeElement).toBe(initiatingControl);
    expect(click).not.toHaveBeenCalled();

    view.unmount();
    await waitFor(() => expect(firstEditor.isDestroyed).toBe(true));
    expect(() =>
      firstEnvironment.registry.register({
        ownerId: EmbeddedNodeIdSchema.parse("owner0000001"),
        activate: async () => {
          throw new Error("not called");
        },
      }),
    ).toThrowError("Cannot register a semantic activation binding after registry disposal");
  });

  it("marks runtime surface states and hides non-current surfaces", async () => {
    const onReady = vi.fn();

    render(
      <CourseDocumentRuntimeRenderer
        composition={runtimeComposition}
        artifactId="artifact-renderer"
        initialContent={slideshowDocumentContent()}
        surfaceStates={{
          slide_000001: "previous",
          slide_000002: "current",
          slide_000003: "next",
        }}
        onReady={onReady}
      />,
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    const previousSurface = surfaceById("slide_000001");
    const currentSurface = surfaceById("slide_000002");
    const nextSurface = surfaceById("slide_000003");

    expect(previousSurface.getAttribute("data-runtime-surface-state")).toBe("previous");
    expect(previousSurface.getAttribute("data-runtime-surface-hidden")).toBe("true");
    expect(previousSurface.getAttribute("aria-hidden")).toBe("true");
    expect(previousSurface.hasAttribute("hidden")).toBe(true);

    expect(currentSurface.getAttribute("data-runtime-surface-state")).toBe("current");
    expect(currentSurface.getAttribute("data-runtime-surface-visible")).toBe("true");
    expect(currentSurface.hasAttribute("data-runtime-surface-hidden")).toBe(false);
    expect(currentSurface.hasAttribute("hidden")).toBe(false);
    expect(currentSurface.getAttribute("aria-hidden")).toBeNull();

    expect(nextSurface.getAttribute("data-runtime-surface-state")).toBe("next");
    expect(nextSurface.getAttribute("data-runtime-surface-hidden")).toBe("true");
    expect(nextSurface.getAttribute("aria-hidden")).toBe("true");
    expect(nextSurface.hasAttribute("hidden")).toBe(true);
  });

  it("keeps Course Section boundaries hidden and outside Surface visibility state", async () => {
    const onReady = vi.fn();

    render(
      <CourseDocumentRuntimeRenderer
        composition={runtimeComposition}
        artifactId="artifact-sectioned-renderer"
        initialContent={sectionedSlideshowDocumentContent()}
        surfaceStates={{
          slide_000001: "previous",
          slide_000002: "current",
          slide_000003: "next",
        }}
        onReady={onReady}
      />,
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    const boundaries = document.body.querySelectorAll<HTMLElement>("[data-course-section]");
    expect(boundaries).toHaveLength(2);
    for (const boundary of boundaries) {
      expect(boundary.hidden).toBe(true);
      expect(boundary.getAttribute("aria-hidden")).toBe("true");
      expect(boundary.textContent).toBe("");
    }
    expect(document.body.querySelectorAll('[data-node="surface"]')).toHaveLength(3);
    expect(surfaceById("slide_000002").getAttribute("data-runtime-surface-state")).toBe("current");
    expect(screen.queryByText("Introduction")).toBeNull();
    expect(screen.queryByText("Practice")).toBeNull();
  });

  it("updates visible surface markers without mutating document JSON", async () => {
    const readyEditors: TiptapEditor[] = [];
    const onReady = vi.fn((readyEditor: TiptapEditor) => {
      readyEditors.push(readyEditor);
    });
    const initialContent = slideshowDocumentContent();
    const { rerender } = render(
      <CourseDocumentRuntimeRenderer
        composition={runtimeComposition}
        artifactId="artifact-renderer"
        initialContent={initialContent}
        visibleSurfaceId="slide_000001"
        onReady={onReady}
      />,
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = readyEditors[0];
    if (!editor) {
      throw new Error("runtime renderer did not provide an editor");
    }
    const beforeVisibilityChange = editor.getJSON();

    rerender(
      <CourseDocumentRuntimeRenderer
        composition={runtimeComposition}
        artifactId="artifact-renderer"
        initialContent={initialContent}
        visibleSurfaceId="slide_000002"
        onReady={onReady}
      />,
    );

    await waitFor(() =>
      expect(surfaceById("slide_000002").getAttribute("data-runtime-surface-visible")).toBe("true"),
    );

    expect(editor.getJSON()).toEqual(beforeVisibilityChange);
  });

  it("updates runtime surface state markers without mutating document JSON", async () => {
    const readyEditors: TiptapEditor[] = [];
    const onReady = vi.fn((readyEditor: TiptapEditor) => {
      readyEditors.push(readyEditor);
    });
    const initialContent = slideshowDocumentContent();
    const { rerender } = render(
      <CourseDocumentRuntimeRenderer
        composition={runtimeComposition}
        artifactId="artifact-renderer"
        initialContent={initialContent}
        surfaceStates={{
          slide_000001: "current",
          slide_000002: "next",
          slide_000003: "hidden",
        }}
        onReady={onReady}
      />,
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = readyEditors[0];
    if (!editor) {
      throw new Error("runtime renderer did not provide an editor");
    }
    const beforeStateChange = editor.getJSON();

    rerender(
      <CourseDocumentRuntimeRenderer
        composition={runtimeComposition}
        artifactId="artifact-renderer"
        initialContent={initialContent}
        surfaceStates={{
          slide_000001: "previous",
          slide_000002: "current",
          slide_000003: "next",
        }}
        onReady={onReady}
      />,
    );

    await waitFor(() =>
      expect(surfaceById("slide_000002").getAttribute("data-runtime-surface-state")).toBe(
        "current",
      ),
    );

    expect(editor.getJSON()).toEqual(beforeStateChange);
  });

  it("preserves page rendering when no visible surface id is supplied", async () => {
    const onReady = vi.fn();

    render(
      <CourseDocumentRuntimeRenderer
        composition={runtimeComposition}
        artifactId="artifact-renderer"
        initialContent={pageDocumentContent()}
        onReady={onReady}
      />,
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    const surface = surfaceById("surface-page");

    expect(surface.hasAttribute("data-runtime-surface-hidden")).toBe(false);
    expect(surface.hasAttribute("data-runtime-surface-visible")).toBe(false);
    expect(surface.hasAttribute("hidden")).toBe(false);
    expect(surface.getAttribute("aria-hidden")).toBeNull();
  });

  it("keeps layout interaction state isolated between mounted runtime sessions", async () => {
    const user = userEvent.setup();
    const onFirstReady = vi.fn();
    const onSecondReady = vi.fn();
    const content = tabsDocumentContent();

    render(
      <div>
        <div data-testid="first-runtime">
          <CourseDocumentRuntimeRenderer
            composition={runtimeComposition}
            artifactId="first-artifact"
            initialContent={content}
            onReady={onFirstReady}
          />
        </div>
        <div data-testid="second-runtime">
          <CourseDocumentRuntimeRenderer
            composition={runtimeComposition}
            artifactId="second-artifact"
            initialContent={content}
            onReady={onSecondReady}
          />
        </div>
      </div>,
    );

    await waitFor(() => {
      expect(onFirstReady).toHaveBeenCalledTimes(1);
      expect(onSecondReady).toHaveBeenCalledTimes(1);
    });

    const firstRuntime = within(screen.getByTestId("first-runtime"));
    const secondRuntime = within(screen.getByTestId("second-runtime"));
    const firstTabs = firstRuntime.getAllByRole("tab");
    const secondTabs = secondRuntime.getAllByRole("tab");

    expect(firstTabs[0]?.getAttribute("aria-selected")).toBe("true");
    expect(secondTabs[0]?.getAttribute("aria-selected")).toBe("true");

    await user.click(firstTabs[1]!);

    await waitFor(() => {
      expect(firstTabs[1]?.getAttribute("aria-selected")).toBe("true");
    });
    expect(secondTabs[0]?.getAttribute("aria-selected")).toBe("true");
    expect(secondTabs[1]?.getAttribute("aria-selected")).toBe("false");
  });

  it("renders v2 Gallery captions without authoring or settings chrome", async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();

    render(
      <CourseDocumentRuntimeRenderer
        composition={runtimeComposition}
        artifactId="artifact-gallery"
        initialContent={galleryDocumentContent()}
        onReady={onReady}
      />,
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    expect(screen.getByText("Shared runtime caption")).toBeInTheDocument();
    expect(screen.queryByText("First runtime item caption")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add image" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Remove image/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Open block settings" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Open First runtime image fullscreen" }));
    const dialog = await screen.findByRole("dialog", { name: "Gallery viewer" });
    expect(within(dialog).getByText("First runtime item caption").tagName).toBe("STRONG");
  });

  it("renders persisted semantic alignment without authoring chrome", async () => {
    const initialContent = alignmentParityDocumentContent();
    const onRuntimeReady = vi.fn();

    const view = render(
      <div data-testid="alignment-runtime">
        <CourseDocumentRuntimeRenderer
          composition={runtimeComposition}
          artifactId="artifact-alignment"
          initialContent={initialContent}
          onReady={onRuntimeReady}
        />
      </div>,
    );

    await waitFor(() => expect(onRuntimeReady).toHaveBeenCalledTimes(1));

    const runtime = view.getByTestId("alignment-runtime");
    const runtimeRegion = requiredElement(runtime, '[data-vertical-content-position="bottom"]');
    const runtimeText = requiredElement(runtime, '[data-text-align="right"]');
    const runtimeFrame = requiredElement(
      runtime,
      '[data-runtime-frame="block"][data-id="callout00002"]',
    );

    expect(runtimeRegion.getAttribute("data-vertical-content-position")).toBe("bottom");
    expect(runtimeText.getAttribute("data-text-align")).toBe("right");
    expect(runtimeFrame.style.width).toBe("60%");
    expect(runtimeFrame.style.marginLeft).toBe("auto");
    expect(runtimeFrame.style.marginRight).toBe("auto");
    expect(runtime.querySelector("[data-authoring-frame]")).toBeNull();
    expect(runtime.querySelector("[data-authoring-chrome]")).toBeNull();
    expect(runtime.querySelector('[contenteditable="true"]')).toBeNull();
  });
});

function alignmentParityDocumentContent(): JSONContent {
  const item = calloutInsertCatalog.getById("callout");
  if (!item) throw new Error("Callout catalog item is not registered");
  const callout = item.content() as JSONContent;

  return {
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
            attrs: { id: "surface-alignment", variant: "page-default" },
            content: [
              {
                type: "region",
                attrs: { id: "region-alignment", verticalPosition: "bottom" },
                content: [
                  createLayerWithContent([
                    paragraphWithAlignment("Aligned text", "right"),
                    {
                      ...callout,
                      attrs: {
                        ...callout.attrs,
                        id: "callout00002",
                        frame: { align: "center", widthMode: "percent", widthPercent: 60 },
                      },
                    },
                  ]),
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function galleryDocumentContent(): JSONContent {
  const content = pageDocumentContent();
  const surface = content.content?.[0]?.content?.[0];
  if (!surface) throw new Error("Gallery runtime fixture is missing its surface");

  surface.content = [
    {
      type: "gallery",
      attrs: {
        id: "gallery-runtime",
        data: {
          type: "gallery",
          layout: "carousel",
          caption: richTextDocument("Shared runtime caption"),
        },
      },
      content: [
        {
          type: "gallery_item",
          attrs: {
            id: "gallery-runtime-item-1",
            data: {
              image: {
                mode: "external",
                src: "https://example.com/runtime-first.jpg",
                alt: "First runtime image",
              },
              caption: richTextDocument("First runtime item caption", [{ type: "bold" }]),
            },
          },
        },
      ],
    },
  ];

  return content;
}

function richTextDocument(text: string, marks?: JSONContent["marks"]): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text, ...(marks ? { marks } : {}) }],
      },
    ],
  };
}

function paragraphWithAlignment(text: string, textAlign: "left" | "center" | "right") {
  return {
    type: "paragraph",
    attrs: { textAlign },
    content: [{ type: "text", text }],
  } satisfies JSONContent;
}

function requiredElement(root: HTMLElement, selector: string): HTMLElement {
  const element = root.querySelector(selector);
  if (!(element instanceof HTMLElement)) throw new Error(`Missing element ${selector}`);
  return element;
}

function privateRuntimeBlockCapability(nodeType: string): BlockCapability {
  return {
    definition: { nodeType, title: `Private ${nodeType}` },
    authoringExtension: Extension.create({
      name: `${nodeType}_authoring_bundle`,
      addExtensions: () => [Node.create({ name: nodeType, group: "block", atom: true })],
    }),
    runtimeExtension: Extension.create({
      name: `${nodeType}_runtime_bundle`,
      addExtensions: () => [Node.create({ name: nodeType, group: "block", atom: true })],
    }),
  };
}

function privateRuntimeSurfaceCapability(id: string, viewId: string): SurfaceCapability {
  const RuntimeView = (props: SurfaceRuntimeViewProps) => (
    <SurfaceRuntimeFrame {...props} attributes={{ "data-private-runtime-view": viewId }} />
  );

  return {
    definition: {
      id,
      modes: ["page"],
      title: `Private ${viewId} Surface`,
      description: "Private Surface used to verify runtime view isolation",
      structurePolicy: {
        fixedChildren: [{ type: "paragraph" }],
        allowRootInsertion: true,
      },
      createSurface: ({ surfaceId }) => ({
        type: "surface",
        attrs: { id: surfaceId, variant: id, settings: {} },
        content: [paragraph("Private composition identity")],
      }),
    },
    authoringView: { variantId: id, component: PrivateIdentitySurfaceAuthoringView },
    runtimeView: { variantId: id, component: RuntimeView },
  };
}

function PrivateIdentitySurfaceAuthoringView(_props: SurfaceAuthoringViewProps) {
  return null;
}

function privateSurfaceDocumentContent(variant: string): JSONContent {
  const content = pageDocumentContent();
  content.content![0]!.content = [
    {
      type: "surface",
      attrs: { id: "private-identity-surface-instance", variant, settings: {} },
      content: [paragraph("Private composition identity")],
    },
  ];
  return content;
}
