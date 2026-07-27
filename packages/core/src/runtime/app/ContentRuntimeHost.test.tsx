// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSONContent } from "@tiptap/core";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createScaffoldDocumentContent } from "@/format/artifact";
import { emptyCalloutData } from "@/editor/blocks/presentation/callout/content";
import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import type { XapiPort } from "@/host/ports";

import { ContentRuntimeHost } from "./ContentRuntimeHost";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";
import {
  XAPI_ACTIVITY_TYPES,
  XAPI_EXTENSIONS,
  XAPI_VERBS,
  createLayoutSectionActivityId,
  createSurfaceActivityId,
  type XapiSession,
} from "../xapi";

const runtimeStoreFactories = vi.hoisted(() => ({
  assessment: vi.fn(),
  learnerActivity: vi.fn(),
}));

vi.mock("../assessment/assessment-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../assessment/assessment-store")>();
  return {
    ...actual,
    createAssessmentStore: (...args: Parameters<typeof actual.createAssessmentStore>) => {
      runtimeStoreFactories.assessment(...args);
      return actual.createAssessmentStore(...args);
    },
  };
});

vi.mock("../learner-activity/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../learner-activity/store")>();
  return {
    ...actual,
    createLearnerActivityStore: (...args: Parameters<typeof actual.createLearnerActivityStore>) => {
      runtimeStoreFactories.learnerActivity(...args);
      return actual.createLearnerActivityStore(...args);
    },
  };
});

class ResizeObserverStub implements ResizeObserver {
  readonly observe = vi.fn((target: Element) => {
    if (!target.matches(".sc-slideshow-player__viewport, .sc-slideshow-player__stage")) return;
    this.callback(
      [{ target, contentRect: { width: 1024, height: 576 } } as ResizeObserverEntry],
      this,
    );
  });
  readonly unobserve = vi.fn();
  readonly disconnect = vi.fn();

  constructor(private readonly callback: ResizeObserverCallback) {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  runtimeStoreFactories.assessment.mockClear();
  runtimeStoreFactories.learnerActivity.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createXapiPort(
  activityId = "https://learning.example.test/courses/artifact-1",
): XapiPort & { send: ReturnType<typeof vi.fn<XapiPort["send"]>> } {
  return {
    activityId,
    send: vi.fn(async () => undefined),
  };
}

function statementVerbs(port: ReturnType<typeof createXapiPort>): string[] {
  return port.send.mock.calls.map(([statement]) => statement.verb.display.en ?? "");
}

interface StoreXapiOptions {
  readonly getXapiSession?: () => XapiSession | null;
}

function runtimeDocumentWithBlock(block: JSONContent): JSONContent {
  const content = runtimeDocumentContent();
  const courseDocument = content.content?.[0];
  const surface = courseDocument?.content?.[0];

  if (!surface) {
    throw new Error("runtime test document is missing its first surface");
  }

  surface.content = [block];

  return content;
}

function runtimeDocumentWithLayout(kind: "tabs" | "paginated"): JSONContent {
  const layoutId = kind === "tabs" ? "layout-tabs" : "layout-pages";
  const sectionIds = kind === "tabs" ? ["tab-one", "tab-two"] : ["page-one", "page-two"];
  const labels = kind === "tabs" ? ["Overview", "Practice"] : ["First page", "Second page"];

  return runtimeDocumentWithBlock({
    type: "layout",
    attrs: {
      id: layoutId,
      variant: kind,
      ...(kind === "tabs" ? { options: { variant: "default", label: "Lesson sections" } } : {}),
    },
    content: sectionIds.map((id, index) => ({
      type: "section",
      attrs: {
        id,
        role: kind === "tabs" ? "tab-panel" : "page",
        options: { label: labels[index] },
      },
      content: [{ type: "paragraph" }],
    })),
  });
}

function runtimeAccordionLayout(layoutId: string, sectionPrefix: string): JSONContent {
  return {
    type: "layout",
    attrs: {
      id: layoutId,
      variant: "accordion",
      options: {
        variant: "default",
        label: "Topics",
        allowMultiple: true,
      },
    },
    content: [
      {
        type: "section",
        attrs: {
          id: `${sectionPrefix}-one`,
          role: "accordion-panel",
          options: { defaultOpen: true },
        },
        content: [
          {
            type: "accordion_section_title",
            content: [paragraph("Before class")],
          },
          {
            type: "accordion_section_panel",
            content: [paragraph("Before class content")],
          },
        ],
      },
      {
        type: "section",
        attrs: {
          id: `${sectionPrefix}-two`,
          role: "accordion-panel",
          options: { defaultOpen: false },
        },
        content: [
          {
            type: "accordion_section_title",
            content: [paragraph("After class")],
          },
          {
            type: "accordion_section_panel",
            content: [paragraph("After class content")],
          },
        ],
      },
    ],
  };
}

function runtimeDocumentWithAccordion(): JSONContent {
  return runtimeDocumentWithBlock(runtimeAccordionLayout("layout-accordion", "accordion"));
}

function slideshowDocumentWithTabs(): JSONContent {
  const content = runtimeDocumentContent({
    mode: "slideshow",
    surfaceIds: ["slide-one", "slide-two"],
  });
  const courseDocument = content.content?.[0];
  const definition = builtInSurfaceVariantRegistry.get("slide-content");
  if (!courseDocument || !definition) {
    throw new Error("runtime slideshow test document is missing its slide definition");
  }
  courseDocument.content = [
    definition.createSurface({ surfaceId: "slide-one" }),
    definition.createSurface({ surfaceId: "slide-two" }),
  ];
  const firstRegion = courseDocument.content[0]?.content?.find((node) => node.type === "region");
  const secondRegion = courseDocument.content[1]?.content?.find((node) => node.type === "region");

  if (!firstRegion || !secondRegion) {
    throw new Error("runtime slideshow test document is missing its content regions");
  }

  firstRegion.content = [
    {
      type: "layout",
      attrs: {
        id: "layout-slide-one",
        variant: "tabs",
        options: { variant: "default", label: "First slide sections" },
      },
      content: [
        {
          type: "section",
          attrs: { id: "tab-slide-one", role: "tab-panel", options: { label: "First tab" } },
          content: [{ type: "paragraph" }],
        },
      ],
    },
  ];
  secondRegion.content = [
    {
      type: "layout",
      attrs: {
        id: "layout-slide-two",
        variant: "tabs",
        options: { variant: "default", label: "Second slide sections" },
      },
      content: [
        {
          type: "section",
          attrs: { id: "tab-slide-two", role: "tab-panel", options: { label: "Second tab" } },
          content: [{ type: "paragraph" }],
        },
      ],
    },
  ];

  return content;
}

function slideshowDocumentWithAccordions(): JSONContent {
  const content = slideshowDocumentWithTabs();
  const surfaces = content.content?.[0]?.content;
  const firstRegion = surfaces?.[0]?.content?.find((node) => node.type === "region");
  const secondRegion = surfaces?.[1]?.content?.find((node) => node.type === "region");

  if (!firstRegion || !secondRegion) {
    throw new Error("runtime accordion slideshow is missing its content regions");
  }

  firstRegion.content = [runtimeAccordionLayout("layout-accordion-one", "accordion-slide-one")];
  secondRegion.content = [runtimeAccordionLayout("layout-accordion-two", "accordion-slide-two")];

  return content;
}

function runtimeDocumentContent({
  mode = "page",
  surfaceIds = ["surface-runtime"],
}: {
  mode?: "page" | "slideshow" | "branching";
  surfaceIds?: Array<string | null>;
} = {}): JSONContent {
  if (mode === "branching") {
    const pageDefinition = builtInSurfaceVariantRegistry.get("page-default");
    if (!pageDefinition) throw new Error("runtime page definition is missing");
    return {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: {
            schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
            mode: "branching",
            surfaceSize: "fluid",
            overflowMode: "grow",
          },
          content: surfaceIds.map((id) =>
            id === null
              ? { type: "surface", attrs: {}, content: [{ type: "paragraph" }] }
              : pageDefinition.createSurface({ surfaceId: id }),
          ),
        },
      ],
    };
  }

  const content = createScaffoldDocumentContent({
    mode,
    surfaceId: surfaceIds[0] ?? "surface-runtime",
  });
  const courseDocument = content.content?.[0];

  if (!courseDocument) {
    throw new Error("runtime test document is missing courseDocument");
  }

  courseDocument.attrs = { ...courseDocument.attrs, mode };
  const definition = builtInSurfaceVariantRegistry.get(
    mode === "slideshow" ? "slide-cover" : "page-default",
  );
  if (!definition) throw new Error("runtime test definition is missing");
  courseDocument.content = surfaceIds.map((id) =>
    id === null
      ? { type: "surface", attrs: {}, content: [{ type: "paragraph" }] }
      : definition.createSurface({ surfaceId: id }),
  );

  return content;
}

function frameAttrs(widthPercent: number): JSONContent["attrs"] {
  return {
    align: "center",
    aspectRatio: null,
    widthMode: "percent",
    widthPercent,
  };
}

function paragraph(text: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function assessmentActions(): JSONContent {
  return {
    type: "assessment_actions_group",
    content: [{ type: "assessment_hints_group" }, { type: "assessment_summary_feedback" }],
  };
}

function selectableChoice(id: string, text: string): JSONContent {
  return {
    type: "selectable_choice",
    attrs: { id },
    content: [{ type: "selectable_choice_body", content: [paragraph(text)] }],
  };
}

function assessmentShellContent(response: JSONContent): JSONContent[] {
  return [
    { type: "assessment_title", content: [{ type: "paragraph" }] },
    { type: "assessment_instructions", content: [{ type: "paragraph" }] },
    { type: "assessment_prompt", content: [{ type: "paragraph" }] },
    response,
    assessmentActions(),
  ];
}

function runtimeMcqBlock(): JSONContent {
  return {
    type: "mcq",
    attrs: {
      id: "mcq-strict-runtime",
      assessment: {
        correctOptionId: "choice-b",
        feedbackByOptionId: {},
        summaryFeedback: null,
      },
      settings: {
        feedbackMode: "on_submit",
        isGraded: true,
        showAnswer: true,
        legend: "Choose a letter",
        points: 1,
        maxAttempts: null,
      },
    },
    content: assessmentShellContent({
      type: "assessment_choices_group",
      content: [selectableChoice("choice-a", "A"), selectableChoice("choice-b", "B")],
    }),
  };
}

function runtimeMatchingBlock(): JSONContent {
  const pair = (itemId: string, targetId: string, item: string, target: string): JSONContent => ({
    type: "matching_pair",
    attrs: { itemId, targetId },
    content: [
      { type: "matching_item", content: [paragraph(item)] },
      { type: "matching_target", content: [paragraph(target)] },
    ],
  });

  return {
    type: "matching",
    attrs: {
      id: "matching-strict-runtime",
      assessment: {
        correctPairs: [
          { itemId: "item-a", targetId: "target-a" },
          { itemId: "item-b", targetId: "target-b" },
        ],
        feedbackByItemId: {},
        summaryFeedback: null,
      },
      settings: {
        feedbackMode: "on_submit",
        isGraded: true,
        showAnswer: true,
        legend: "Match terms",
        points: 1,
        maxAttempts: null,
      },
    },
    content: assessmentShellContent({
      type: "matching_pairs_group",
      content: [
        pair("item-a", "target-a", "Term A", "Target A"),
        pair("item-b", "target-b", "Term B", "Target B"),
      ],
    }),
  };
}

function runtimeImageHotspotBlock(): JSONContent {
  return {
    type: "image_hotspot",
    attrs: {
      id: "hotspot-strict-runtime",
      assessment: {
        gradingMode: "partial-credit",
        correctHotspotIds: ["hotspot-a"],
        feedbackByHotspotId: {},
        missFeedback: null,
        summaryFeedback: null,
      },
    },
    content: assessmentShellContent({
      type: "image_hotspot_canvas",
      attrs: {
        data: {
          image: {
            mode: "external",
            src: "https://example.com/runtime-hotspot.png",
            alt: "Runtime hotspot",
          },
          hotspots: [{ id: "hotspot-a", centerX: 20, centerY: 20, radius: 8, label: "A" }],
          maxClicks: null,
          debug: false,
        },
      },
    }),
  };
}

function surfaceById(surfaceId: string): HTMLElement {
  const surface = document.body.querySelector(`[data-surface-id="${surfaceId}"]`);

  if (!(surface instanceof HTMLElement)) {
    throw new Error(`surface ${surfaceId} was not rendered`);
  }

  return surface;
}

function calloutBlock(widthPercent: number): JSONContent {
  return {
    type: "callout",
    attrs: {
      id: "block-callout-runtime",
      data: emptyCalloutData(),
      frame: frameAttrs(widthPercent),
    },
    content: [
      { type: "callout_title", content: [paragraph("Runtime callout")] },
      { type: "callout_prompt", content: [paragraph("Projected in runtime.")] },
    ],
  };
}

describe("ContentRuntimeHost", () => {
  it("renders page content through the runtime renderer surface", async () => {
    const onEditorReady = vi.fn();

    render(
      <ContentRuntimeHost
        artifactId="artifact-1"
        initialContent={runtimeDocumentContent()}
        onEditorReady={onEditorReady}
      />,
    );

    await waitFor(() => expect(onEditorReady).toHaveBeenCalledTimes(1));

    expect(screen.getByTestId("scaffold-runtime-host")).toBeInTheDocument();
    expect(screen.getByTestId("page-player")).toBeInTheDocument();
    expect(screen.getByTestId("course-document-runtime-renderer")).toBeInTheDocument();
    expect(screen.queryByTestId("course-document-editor")).toBeNull();
    expect(screen.getByRole("region", { name: "Course content" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Page canvas" })).toBeNull();

    const editableSurface = document.body.querySelector(".ProseMirror");
    expect(editableSurface?.getAttribute("contenteditable")).toBe("false");
  });

  it("mounts independent assessment and learner activity stores for valid content", () => {
    render(
      <ContentRuntimeHost artifactId="artifact-1" initialContent={runtimeDocumentContent()} />,
    );

    expect(screen.getByTestId("scaffold-runtime-host")).toBeInTheDocument();
    expect(screen.getByTestId("page-player")).toBeInTheDocument();
    expect(runtimeStoreFactories.assessment).toHaveBeenCalledTimes(1);
    expect(runtimeStoreFactories.learnerActivity).toHaveBeenCalledTimes(1);
  });

  it("injects one recording-unavailable session accessor into both authoritative stores", () => {
    render(
      <ContentRuntimeHost artifactId="artifact-1" initialContent={runtimeDocumentContent()} />,
    );

    const assessmentOptions = runtimeStoreFactories.assessment.mock
      .calls[0]?.[0] as StoreXapiOptions;
    const learnerActivityOptions = runtimeStoreFactories.learnerActivity.mock
      .calls[0]?.[0] as StoreXapiOptions;

    expect(assessmentOptions.getXapiSession).toEqual(expect.any(Function));
    expect(learnerActivityOptions.getXapiSession).toBe(assessmentOptions.getXapiSession);
    expect(assessmentOptions.getXapiSession?.()).toBeNull();
  });

  it("starts xAPI only when valid content has a ready renderer", async () => {
    const port = createXapiPort();
    const onEditorReady = vi.fn();

    render(
      <ScaffoldServicesProvider ports={{ xapi: port }}>
        <ContentRuntimeHost
          artifactId="artifact-1"
          courseTitle="Course One"
          initialContent={runtimeDocumentContent()}
          onEditorReady={onEditorReady}
        />
      </ScaffoldServicesProvider>,
    );

    await waitFor(() => expect(onEditorReady).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(port.send).toHaveBeenCalledTimes(2));

    expect(port.send.mock.calls[0]?.[0]).toMatchObject({
      verb: { display: { en: "initialized" } },
      object: {
        id: port.activityId,
        definition: { name: { en: "Course One" } },
      },
    });
    expect(port.send.mock.calls[1]?.[0]).toMatchObject({
      verb: XAPI_VERBS.experienced,
      object: {
        id: createSurfaceActivityId(port.activityId, "surface-runtime"),
        definition: {
          type: XAPI_ACTIVITY_TYPES.surface,
          extensions: {
            [XAPI_EXTENSIONS.surfaceKind]: "page",
            [XAPI_EXTENSIONS.surfacePosition]: 1,
            [XAPI_EXTENSIONS.surfaceCount]: 1,
          },
        },
      },
    });
  });

  it("records every active slideshow surface transition as experienced", async () => {
    const user = userEvent.setup();
    const port = createXapiPort();

    render(
      <ScaffoldServicesProvider ports={{ xapi: port }}>
        <ContentRuntimeHost
          artifactId="artifact-slideshow"
          initialContent={runtimeDocumentContent({
            mode: "slideshow",
            surfaceIds: ["slide-one", "slide-two"],
          })}
        />
      </ScaffoldServicesProvider>,
    );

    await waitFor(() => expect(statementVerbs(port)).toEqual(["initialized", "experienced"]));
    await user.click(screen.getByRole("button", { name: "Next slide" }));
    await waitFor(() =>
      expect(statementVerbs(port)).toEqual(["initialized", "experienced", "experienced"]),
    );
    await user.click(screen.getByRole("button", { name: "Previous slide" }));
    await waitFor(() =>
      expect(statementVerbs(port)).toEqual([
        "initialized",
        "experienced",
        "experienced",
        "experienced",
      ]),
    );

    expect(
      port.send.mock.calls.slice(1).map(([statement]) => ({
        id: statement.object.id,
        extensions: statement.object.definition?.extensions,
      })),
    ).toStrictEqual([
      {
        id: createSurfaceActivityId(port.activityId, "slide-one"),
        extensions: {
          [XAPI_EXTENSIONS.surfaceKind]: "slide",
          [XAPI_EXTENSIONS.surfacePosition]: 1,
          [XAPI_EXTENSIONS.surfaceCount]: 2,
        },
      },
      {
        id: createSurfaceActivityId(port.activityId, "slide-two"),
        extensions: {
          [XAPI_EXTENSIONS.surfaceKind]: "slide",
          [XAPI_EXTENSIONS.surfacePosition]: 2,
          [XAPI_EXTENSIONS.surfaceCount]: 2,
        },
      },
      {
        id: createSurfaceActivityId(port.activityId, "slide-one"),
        extensions: {
          [XAPI_EXTENSIONS.surfaceKind]: "slide",
          [XAPI_EXTENSIONS.surfacePosition]: 1,
          [XAPI_EXTENSIONS.surfaceCount]: 2,
        },
      },
    ]);
  });

  it("records initial and changed active tab sections as experienced", async () => {
    const user = userEvent.setup();
    const port = createXapiPort();

    render(
      <ScaffoldServicesProvider ports={{ xapi: port }}>
        <ContentRuntimeHost
          artifactId="artifact-tabs"
          initialContent={runtimeDocumentWithLayout("tabs")}
        />
      </ScaffoldServicesProvider>,
    );

    const layoutSectionStatements = () =>
      port.send.mock.calls
        .map(([statement]) => statement)
        .filter(
          (statement) => statement.object.definition?.type === XAPI_ACTIVITY_TYPES.layoutSection,
        );

    await waitFor(() => expect(layoutSectionStatements()).toHaveLength(1));
    await user.click(screen.getByRole("tab", { name: "Overview" }));
    expect(layoutSectionStatements()).toHaveLength(1);
    await user.click(screen.getByRole("tab", { name: "Practice" }));
    await waitFor(() => expect(layoutSectionStatements()).toHaveLength(2));
    await user.click(screen.getByRole("tab", { name: "Overview" }));
    await waitFor(() => expect(layoutSectionStatements()).toHaveLength(3));

    expect(
      layoutSectionStatements().map((statement) => ({
        id: statement.object.id,
        extensions: statement.object.definition?.extensions,
      })),
    ).toStrictEqual([
      {
        id: createLayoutSectionActivityId(port.activityId, "layout-tabs", "tab-one"),
        extensions: {
          [XAPI_EXTENSIONS.layoutKind]: "tabs",
          [XAPI_EXTENSIONS.layoutSectionPosition]: 1,
          [XAPI_EXTENSIONS.layoutSectionCount]: 2,
        },
      },
      {
        id: createLayoutSectionActivityId(port.activityId, "layout-tabs", "tab-two"),
        extensions: {
          [XAPI_EXTENSIONS.layoutKind]: "tabs",
          [XAPI_EXTENSIONS.layoutSectionPosition]: 2,
          [XAPI_EXTENSIONS.layoutSectionCount]: 2,
        },
      },
      {
        id: createLayoutSectionActivityId(port.activityId, "layout-tabs", "tab-one"),
        extensions: {
          [XAPI_EXTENSIONS.layoutKind]: "tabs",
          [XAPI_EXTENSIONS.layoutSectionPosition]: 1,
          [XAPI_EXTENSIONS.layoutSectionCount]: 2,
        },
      },
    ]);
  });

  it("records initial and changed active paginated sections as experienced", async () => {
    const user = userEvent.setup();
    const port = createXapiPort();

    render(
      <ScaffoldServicesProvider ports={{ xapi: port }}>
        <ContentRuntimeHost
          artifactId="artifact-pages"
          initialContent={runtimeDocumentWithLayout("paginated")}
        />
      </ScaffoldServicesProvider>,
    );

    const layoutSectionStatements = () =>
      port.send.mock.calls
        .map(([statement]) => statement)
        .filter(
          (statement) => statement.object.definition?.type === XAPI_ACTIVITY_TYPES.layoutSection,
        );

    await waitFor(() => expect(layoutSectionStatements()).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(layoutSectionStatements()).toHaveLength(2));
    await user.click(screen.getByRole("button", { name: "Previous page" }));
    await waitFor(() => expect(layoutSectionStatements()).toHaveLength(3));

    expect(
      layoutSectionStatements().map((statement) => ({
        id: statement.object.id,
        extensions: statement.object.definition?.extensions,
      })),
    ).toStrictEqual([
      {
        id: createLayoutSectionActivityId(port.activityId, "layout-pages", "page-one"),
        extensions: {
          [XAPI_EXTENSIONS.layoutKind]: "paginated",
          [XAPI_EXTENSIONS.layoutSectionPosition]: 1,
          [XAPI_EXTENSIONS.layoutSectionCount]: 2,
        },
      },
      {
        id: createLayoutSectionActivityId(port.activityId, "layout-pages", "page-two"),
        extensions: {
          [XAPI_EXTENSIONS.layoutKind]: "paginated",
          [XAPI_EXTENSIONS.layoutSectionPosition]: 2,
          [XAPI_EXTENSIONS.layoutSectionCount]: 2,
        },
      },
      {
        id: createLayoutSectionActivityId(port.activityId, "layout-pages", "page-one"),
        extensions: {
          [XAPI_EXTENSIONS.layoutKind]: "paginated",
          [XAPI_EXTENSIONS.layoutSectionPosition]: 1,
          [XAPI_EXTENSIONS.layoutSectionCount]: 2,
        },
      },
    ]);
  });

  it("records layout sections only when their slideshow surface is presented", async () => {
    const user = userEvent.setup();
    const port = createXapiPort();

    render(
      <ScaffoldServicesProvider ports={{ xapi: port }}>
        <ContentRuntimeHost
          artifactId="artifact-slide-tabs"
          initialContent={slideshowDocumentWithTabs()}
        />
      </ScaffoldServicesProvider>,
    );

    const layoutSectionIds = () =>
      port.send.mock.calls
        .map(([statement]) => statement)
        .filter(
          (statement) => statement.object.definition?.type === XAPI_ACTIVITY_TYPES.layoutSection,
        )
        .map((statement) => statement.object.id);

    await waitFor(() =>
      expect(layoutSectionIds()).toStrictEqual([
        createLayoutSectionActivityId(port.activityId, "layout-slide-one", "tab-slide-one"),
      ]),
    );

    await user.click(screen.getByRole("button", { name: "Next slide" }));

    await waitFor(() =>
      expect(layoutSectionIds()).toStrictEqual([
        createLayoutSectionActivityId(port.activityId, "layout-slide-one", "tab-slide-one"),
        createLayoutSectionActivityId(port.activityId, "layout-slide-two", "tab-slide-two"),
      ]),
    );

    await user.click(screen.getByRole("button", { name: "Previous slide" }));

    await waitFor(() =>
      expect(layoutSectionIds()).toStrictEqual([
        createLayoutSectionActivityId(port.activityId, "layout-slide-one", "tab-slide-one"),
        createLayoutSectionActivityId(port.activityId, "layout-slide-two", "tab-slide-two"),
        createLayoutSectionActivityId(port.activityId, "layout-slide-one", "tab-slide-one"),
      ]),
    );
  });

  it("records accordion sections when they open and not when they close", async () => {
    const user = userEvent.setup();
    const port = createXapiPort();

    render(
      <ScaffoldServicesProvider ports={{ xapi: port }}>
        <ContentRuntimeHost
          artifactId="artifact-accordion"
          initialContent={runtimeDocumentWithAccordion()}
        />
      </ScaffoldServicesProvider>,
    );

    const layoutSectionStatements = () =>
      port.send.mock.calls
        .map(([statement]) => statement)
        .filter(
          (statement) => statement.object.definition?.type === XAPI_ACTIVITY_TYPES.layoutSection,
        );

    await waitFor(() => expect(layoutSectionStatements()).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "Expand After class" }));
    await waitFor(() => expect(layoutSectionStatements()).toHaveLength(2));
    await user.click(screen.getByRole("button", { name: "Collapse Before class" }));
    expect(layoutSectionStatements()).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Expand Before class" }));
    await waitFor(() => expect(layoutSectionStatements()).toHaveLength(3));

    expect(
      layoutSectionStatements().map((statement) => ({
        id: statement.object.id,
        extensions: statement.object.definition?.extensions,
      })),
    ).toStrictEqual([
      {
        id: createLayoutSectionActivityId(port.activityId, "layout-accordion", "accordion-one"),
        extensions: {
          [XAPI_EXTENSIONS.layoutKind]: "accordion",
          [XAPI_EXTENSIONS.layoutSectionPosition]: 1,
          [XAPI_EXTENSIONS.layoutSectionCount]: 2,
        },
      },
      {
        id: createLayoutSectionActivityId(port.activityId, "layout-accordion", "accordion-two"),
        extensions: {
          [XAPI_EXTENSIONS.layoutKind]: "accordion",
          [XAPI_EXTENSIONS.layoutSectionPosition]: 2,
          [XAPI_EXTENSIONS.layoutSectionCount]: 2,
        },
      },
      {
        id: createLayoutSectionActivityId(port.activityId, "layout-accordion", "accordion-one"),
        extensions: {
          [XAPI_EXTENSIONS.layoutKind]: "accordion",
          [XAPI_EXTENSIONS.layoutSectionPosition]: 1,
          [XAPI_EXTENSIONS.layoutSectionCount]: 2,
        },
      },
    ]);
  });

  it("records open accordion sections only on the presented slideshow surface", async () => {
    const user = userEvent.setup();
    const port = createXapiPort();

    render(
      <ScaffoldServicesProvider ports={{ xapi: port }}>
        <ContentRuntimeHost
          artifactId="artifact-slide-accordions"
          initialContent={slideshowDocumentWithAccordions()}
        />
      </ScaffoldServicesProvider>,
    );

    const layoutSectionIds = () =>
      port.send.mock.calls
        .map(([statement]) => statement)
        .filter(
          (statement) => statement.object.definition?.type === XAPI_ACTIVITY_TYPES.layoutSection,
        )
        .map((statement) => statement.object.id);

    await waitFor(() =>
      expect(layoutSectionIds()).toStrictEqual([
        createLayoutSectionActivityId(
          port.activityId,
          "layout-accordion-one",
          "accordion-slide-one-one",
        ),
      ]),
    );

    await user.click(screen.getByRole("button", { name: "Next slide" }));

    await waitFor(() =>
      expect(layoutSectionIds()).toStrictEqual([
        createLayoutSectionActivityId(
          port.activityId,
          "layout-accordion-one",
          "accordion-slide-one-one",
        ),
        createLayoutSectionActivityId(
          port.activityId,
          "layout-accordion-two",
          "accordion-slide-two-one",
        ),
      ]),
    );
  });

  it("keeps learning available when the xAPI Activity IRI is invalid", async () => {
    const port = createXapiPort("not an absolute IRI");
    const onEditorReady = vi.fn();

    expect(() =>
      render(
        <ScaffoldServicesProvider ports={{ xapi: port }}>
          <ContentRuntimeHost
            artifactId="artifact-1"
            initialContent={runtimeDocumentContent()}
            onEditorReady={onEditorReady}
          />
        </ScaffoldServicesProvider>,
      ),
    ).not.toThrow();

    await waitFor(() => expect(onEditorReady).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("page-player")).toBeInTheDocument();
    expect(port.send).not.toHaveBeenCalled();
  });

  it("terminates a started xAPI session when the learner runtime unmounts", async () => {
    const port = createXapiPort();
    const root = render(
      <ScaffoldServicesProvider ports={{ xapi: port }}>
        <ContentRuntimeHost
          artifactId="artifact-1"
          courseTitle="Course One"
          initialContent={runtimeDocumentContent()}
        />
      </ScaffoldServicesProvider>,
    );

    await waitFor(() => expect(statementVerbs(port)).toEqual(["initialized", "experienced"]));
    root.unmount();
    await waitFor(() =>
      expect(statementVerbs(port)).toEqual(["initialized", "experienced", "terminated"]),
    );
  });

  it("starts a fresh xAPI session when the learner runtime remounts", async () => {
    const port = createXapiPort();
    const runtime = (
      <ScaffoldServicesProvider ports={{ xapi: port }}>
        <ContentRuntimeHost
          artifactId="artifact-1"
          courseTitle="Course One"
          initialContent={runtimeDocumentContent()}
        />
      </ScaffoldServicesProvider>
    );
    const firstRoot = render(runtime);

    await waitFor(() => expect(statementVerbs(port)).toEqual(["initialized", "experienced"]));
    firstRoot.unmount();
    await waitFor(() =>
      expect(statementVerbs(port)).toEqual(["initialized", "experienced", "terminated"]),
    );

    render(runtime);

    await waitFor(() =>
      expect(statementVerbs(port)).toEqual([
        "initialized",
        "experienced",
        "terminated",
        "initialized",
        "experienced",
      ]),
    );
  });

  it("starts a replacement xAPI session without reconstructing authoritative stores", async () => {
    const firstPort = createXapiPort("https://learning.example.test/courses/placement-1");
    const secondPort = createXapiPort("https://learning.example.test/courses/placement-2");
    const content = runtimeDocumentContent();
    const { rerender } = render(
      <ScaffoldServicesProvider ports={{ xapi: firstPort }}>
        <ContentRuntimeHost
          artifactId="artifact-1"
          courseTitle="Course One"
          initialContent={content}
        />
      </ScaffoldServicesProvider>,
    );

    await waitFor(() => expect(statementVerbs(firstPort)).toEqual(["initialized", "experienced"]));
    const assessmentOptions = runtimeStoreFactories.assessment.mock
      .calls[0]?.[0] as StoreXapiOptions;
    const learnerActivityOptions = runtimeStoreFactories.learnerActivity.mock
      .calls[0]?.[0] as StoreXapiOptions;
    const getSession = assessmentOptions.getXapiSession;
    const firstSession = getSession?.();
    expect(firstSession).not.toBeNull();

    rerender(
      <ScaffoldServicesProvider ports={{ xapi: secondPort }}>
        <ContentRuntimeHost
          artifactId="artifact-1"
          courseTitle="Course One"
          initialContent={content}
        />
      </ScaffoldServicesProvider>,
    );

    await waitFor(() =>
      expect(statementVerbs(firstPort)).toEqual(["initialized", "experienced", "terminated"]),
    );
    await waitFor(() => expect(statementVerbs(secondPort)).toEqual(["initialized", "experienced"]));

    expect(runtimeStoreFactories.assessment).toHaveBeenCalledTimes(1);
    expect(runtimeStoreFactories.learnerActivity).toHaveBeenCalledTimes(1);
    expect(learnerActivityOptions.getXapiSession).toBe(getSession);
    expect(getSession?.()).not.toBe(firstSession);
  });

  it("keeps MCQ selection interactive through StrictMode replay", async () => {
    const user = userEvent.setup();
    render(
      <StrictMode>
        <ContentRuntimeHost
          artifactId="artifact-strict-mcq"
          initialContent={runtimeDocumentWithBlock(runtimeMcqBlock())}
        />
      </StrictMode>,
    );

    const choice = await screen.findByRole("radio", { name: "B" });
    await user.click(choice);

    await waitFor(() => expect((choice as HTMLInputElement).checked).toBe(true));
  });

  it("keeps Matching connectors interactive through StrictMode replay", async () => {
    const user = userEvent.setup();
    render(
      <StrictMode>
        <ContentRuntimeHost
          artifactId="artifact-strict-matching"
          initialContent={runtimeDocumentWithBlock(runtimeMatchingBlock())}
        />
      </StrictMode>,
    );

    await user.click(await screen.findByRole("button", { name: "Select matching item 1" }));
    await user.click(screen.getByRole("button", { name: "Match target 1" }));

    await waitFor(() =>
      expect(document.body.querySelector("[data-matching-connectors]")).not.toBeNull(),
    );
  });

  it("keeps Image Hotspot markers interactive through StrictMode replay", async () => {
    render(
      <StrictMode>
        <ContentRuntimeHost
          artifactId="artifact-strict-hotspot"
          initialContent={runtimeDocumentWithBlock(runtimeImageHotspotBlock())}
        />
      </StrictMode>,
    );

    const canvas = await screen.findByRole("group", { name: "Image hotspot response area" });
    canvas.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    });
    fireEvent.click(canvas, { clientX: 20, clientY: 20 });

    await waitFor(() =>
      expect(document.body.querySelector("[data-hotspot-marker-id]")).not.toBeNull(),
    );
  });

  it("passes an initial assessment snapshot to the strict provider boundary", () => {
    expect(() =>
      render(
        <ContentRuntimeHost
          artifactId="artifact-1"
          initialAssessmentSnapshot={{
            snapshotVersion: 2,
            artifactId: "foreign-artifact",
            problems: {},
            quizzes: {},
          }}
          initialContent={runtimeDocumentContent()}
        />,
      ),
    ).toThrow(/artifactId/);
  });

  it("passes an initial learner activity snapshot to its strict sibling provider", () => {
    render(
      <ContentRuntimeHost
        artifactId="artifact-1"
        initialLearnerActivitySnapshot={{
          snapshotVersion: 1,
          artifactId: "foreign-artifact",
          activities: {},
        }}
        initialContent={runtimeDocumentContent()}
      />,
    );

    expect(screen.getByTestId("learner-activity-runtime-error")).toBeInTheDocument();
    expect(screen.queryByTestId("page-player")).toBeNull();
  });

  it("hydrates runtime content from an initial JSON snapshot", async () => {
    const onEditorReady = vi.fn();

    render(
      <ContentRuntimeHost
        artifactId="artifact-1"
        initialContent={runtimeDocumentWithBlock(calloutBlock(72))}
        onEditorReady={onEditorReady}
      />,
    );

    await waitFor(() => expect(onEditorReady).toHaveBeenCalledTimes(1));

    expect(screen.getByText("Runtime callout")).toBeInTheDocument();
    expect(screen.getByText("Projected in runtime.")).toBeInTheDocument();
    expect(screen.getByTestId("course-document-runtime-renderer")).toBeInTheDocument();
    expect(screen.queryByTestId("course-document-editor")).toBeNull();
  });

  it("installs StudentGuard so runtime document changes are rejected", async () => {
    const onEditorReady = vi.fn();

    render(
      <ContentRuntimeHost
        artifactId="artifact-1"
        initialContent={runtimeDocumentContent()}
        onEditorReady={onEditorReady}
      />,
    );

    await waitFor(() => expect(onEditorReady).toHaveBeenCalledTimes(1));
    const editor = onEditorReady.mock.calls[0]?.[0];
    const before = editor.getJSON();

    expect(
      editor.extensionManager.extensions.some(
        (extension: { name: string }) => extension.name === "studentGuard",
      ),
    ).toBe(true);
    editor.commands.insertContent("runtime mutation");
    expect(editor.getJSON()).toEqual(before);
  });

  it("does not expose authoring chrome or proposal review surfaces", async () => {
    const onEditorReady = vi.fn();

    render(
      <ContentRuntimeHost
        artifactId="artifact-1"
        initialContent={runtimeDocumentContent()}
        onEditorReady={onEditorReady}
      />,
    );

    await waitFor(() => expect(onEditorReady).toHaveBeenCalledTimes(1));

    expect(screen.queryByTestId("authoring-agent-dock")).toBeNull();
    expect(document.body.querySelector("[data-scaffold-interaction-bubble]")).toBeNull();
    expect(document.body.querySelector('[data-authoring-chrome="bubble"]')).toBeNull();
    expect(document.body.querySelector('[data-authoring-chrome="menu"]')).toBeNull();
    expect(document.body.querySelector("[data-authoring-move-handle]")).toBeNull();
    expect(document.body.querySelector("[data-authoring-resize-handle]")).toBeNull();
  });

  it("renders an unavailable runtime state for invalid content without repair writes", () => {
    const onEditorReady = vi.fn();

    render(
      <ContentRuntimeHost
        artifactId="artifact-1"
        initialContent={{ type: "doc", content: [{ type: "paragraph" }] }}
        onEditorReady={onEditorReady}
      />,
    );

    expect(
      screen
        .getByTestId("scaffold-runtime-unavailable")
        .getAttribute("data-runtime-unavailable-reason"),
    ).toBe("invalid-course-document");
    expect(screen.queryByTestId("course-document-editor")).toBeNull();
    expect(screen.queryByTestId("course-document-runtime-renderer")).toBeNull();
    expect(onEditorReady).not.toHaveBeenCalled();
    expect(screen.queryByText(/repair/i)).toBeNull();
  });

  it("rejects invalid content before malformed ancillary snapshots can hydrate stores", () => {
    const xapi = createXapiPort();

    expect(() =>
      render(
        <ScaffoldServicesProvider ports={{ xapi }}>
          <ContentRuntimeHost
            artifactId="artifact-1"
            initialAssessmentSnapshot={{ malformed: true }}
            initialLearnerActivitySnapshot={{ malformed: true }}
            initialContent={{ type: "doc", content: [{ type: "paragraph" }] }}
          />
        </ScaffoldServicesProvider>,
      ),
    ).not.toThrow();

    expect(screen.getByTestId("scaffold-runtime-host")).toBeInTheDocument();
    expect(screen.getByTestId("scaffold-runtime-unavailable")).toBeInTheDocument();
    expect(runtimeStoreFactories.assessment).not.toHaveBeenCalled();
    expect(runtimeStoreFactories.learnerActivity).not.toHaveBeenCalled();
    expect(xapi.send).not.toHaveBeenCalled();
  });

  it("rejects invalid content before learner activity loading or store construction", () => {
    const load = vi.fn(async () => null);

    render(
      <ScaffoldServicesProvider
        ports={{
          learnerActivity: {
            load,
            save: vi.fn(),
          },
        }}
      >
        <ContentRuntimeHost
          artifactId="artifact-1"
          initialContent={{ type: "doc", content: [{ type: "paragraph" }] }}
        />
      </ScaffoldServicesProvider>,
    );

    expect(screen.getByTestId("scaffold-runtime-unavailable")).toBeInTheDocument();
    expect(load).not.toHaveBeenCalled();
    expect(runtimeStoreFactories.assessment).not.toHaveBeenCalled();
    expect(runtimeStoreFactories.learnerActivity).not.toHaveBeenCalled();
  });

  it("renders unavailable when initial content is missing", () => {
    const onEditorReady = vi.fn();

    render(
      <ContentRuntimeHost
        artifactId="artifact-1"
        initialContent={null}
        onEditorReady={onEditorReady}
      />,
    );

    expect(
      screen
        .getByTestId("scaffold-runtime-unavailable")
        .getAttribute("data-runtime-unavailable-reason"),
    ).toBe("missing-initial-content");
    expect(screen.queryByTestId("course-document-runtime-renderer")).toBeNull();
    expect(onEditorReady).not.toHaveBeenCalled();
  });

  it("renders unavailable when initial content is invalid", () => {
    const onEditorReady = vi.fn();

    render(
      <ContentRuntimeHost
        artifactId="artifact-1"
        initialContent={{ type: "doc", content: [{ type: "paragraph" }] }}
        onEditorReady={onEditorReady}
      />,
    );

    expect(
      screen
        .getByTestId("scaffold-runtime-unavailable")
        .getAttribute("data-runtime-unavailable-reason"),
    ).toBe("invalid-course-document");
    expect(screen.queryByTestId("course-document-runtime-renderer")).toBeNull();
    expect(onEditorReady).not.toHaveBeenCalled();
  });

  it("renders unavailable for invalid surface variants without mounting the renderer", () => {
    const onEditorReady = vi.fn();
    const content = runtimeDocumentContent();
    const surface = content.content?.[0]?.content?.[0];
    if (!surface) {
      throw new Error("runtime test document is missing its first surface");
    }
    surface.attrs = { ...surface.attrs, variant: "mystery-surface" };
    const contentBeforeRender = JSON.stringify(content);

    render(
      <ContentRuntimeHost
        artifactId="artifact-1"
        initialContent={content}
        onEditorReady={onEditorReady}
      />,
    );

    expect(
      screen
        .getByTestId("scaffold-runtime-unavailable")
        .getAttribute("data-runtime-unavailable-reason"),
    ).toBe("invalid-surface-variant");
    expect(screen.queryByTestId("course-document-runtime-renderer")).toBeNull();
    expect(onEditorReady).not.toHaveBeenCalled();
    expect(JSON.stringify(content)).toBe(contentBeforeRender);
  });

  it("renders a deterministic unavailable state for duplicate surface ids", () => {
    const onEditorReady = vi.fn();
    const content = runtimeDocumentContent({
      mode: "slideshow",
      surfaceIds: ["duplicate-slide", "duplicate-slide"],
    });

    render(
      <ContentRuntimeHost
        artifactId="artifact-1"
        initialContent={content}
        onEditorReady={onEditorReady}
      />,
    );

    expect(
      screen
        .getByTestId("scaffold-runtime-unavailable")
        .getAttribute("data-runtime-unavailable-reason"),
    ).toBe("duplicate-surface-id");
    expect(screen.queryByTestId("page-player")).toBeNull();
    expect(screen.queryByTestId("slideshow-player")).toBeNull();
    expect(screen.queryByTestId("course-document-runtime-renderer")).toBeNull();
    expect(onEditorReady).not.toHaveBeenCalled();
  });

  it("does not construct a player for invalid surface settings or structure", () => {
    const onEditorReady = vi.fn();
    const invalidSettings = runtimeDocumentContent({ mode: "slideshow" });
    const settingsSurface = invalidSettings.content?.[0]?.content?.[0];
    if (!settingsSurface) throw new Error("missing settings fixture surface");
    settingsSurface.attrs = {
      ...settingsSurface.attrs,
      settings: {
        ...settingsSurface.attrs?.["settings"],
        header: { enabled: "invalid" },
      },
    };

    const { rerender } = render(
      <ContentRuntimeHost
        artifactId="artifact-1"
        initialContent={invalidSettings}
        onEditorReady={onEditorReady}
      />,
    );

    expect(
      screen
        .getByTestId("scaffold-runtime-unavailable")
        .getAttribute("data-runtime-unavailable-reason"),
    ).toBe("invalid-course-document");
    expect(screen.queryByTestId("slideshow-player")).toBeNull();

    const invalidStructure = runtimeDocumentContent({ mode: "slideshow" });
    const structureSurface = invalidStructure.content?.[0]?.content?.[0];
    if (!structureSurface) throw new Error("missing structure fixture surface");
    structureSurface.content = [{ type: "paragraph" }];
    rerender(
      <ContentRuntimeHost
        artifactId="artifact-1"
        initialContent={invalidStructure}
        onEditorReady={onEditorReady}
      />,
    );

    expect(
      screen
        .getByTestId("scaffold-runtime-unavailable")
        .getAttribute("data-runtime-unavailable-reason"),
    ).toBe("invalid-course-document");
    expect(screen.queryByTestId("slideshow-player")).toBeNull();
    expect(screen.queryByTestId("course-document-runtime-renderer")).toBeNull();
    expect(onEditorReady).not.toHaveBeenCalled();
  });

  it("renders unavailable when page mode has no surfaces", () => {
    const onEditorReady = vi.fn();

    render(
      <ContentRuntimeHost
        artifactId="artifact-1"
        initialContent={runtimeDocumentContent({ surfaceIds: [] })}
        onEditorReady={onEditorReady}
      />,
    );

    expect(
      screen
        .getByTestId("scaffold-runtime-unavailable")
        .getAttribute("data-runtime-unavailable-reason"),
    ).toBe("invalid-surface-cardinality");
    expect(screen.queryByTestId("course-document-runtime-renderer")).toBeNull();
    expect(onEditorReady).not.toHaveBeenCalled();
  });

  it("renders unavailable when page mode has multiple surfaces", () => {
    const onEditorReady = vi.fn();

    render(
      <ContentRuntimeHost
        artifactId="artifact-1"
        initialContent={runtimeDocumentContent({
          surfaceIds: ["surface-one", "surface-two"],
        })}
        onEditorReady={onEditorReady}
      />,
    );

    expect(
      screen
        .getByTestId("scaffold-runtime-unavailable")
        .getAttribute("data-runtime-unavailable-reason"),
    ).toBe("invalid-surface-cardinality");
    expect(screen.queryByTestId("course-document-runtime-renderer")).toBeNull();
    expect(onEditorReady).not.toHaveBeenCalled();
  });

  it("renders unavailable when page mode has a missing surface id", () => {
    const onEditorReady = vi.fn();

    render(
      <ContentRuntimeHost
        artifactId="artifact-1"
        initialContent={runtimeDocumentContent({ surfaceIds: [null] })}
        onEditorReady={onEditorReady}
      />,
    );

    expect(
      screen
        .getByTestId("scaffold-runtime-unavailable")
        .getAttribute("data-runtime-unavailable-reason"),
    ).toBe("missing-surface-id");
    expect(screen.queryByTestId("course-document-runtime-renderer")).toBeNull();
    expect(onEditorReady).not.toHaveBeenCalled();
  });

  it("renders one-surface slideshow mode through the slideshow player", async () => {
    const onEditorReady = vi.fn();

    render(
      <ContentRuntimeHost
        artifactId="artifact-1"
        initialContent={runtimeDocumentContent({
          mode: "slideshow",
          surfaceIds: ["slide-1"],
        })}
        onEditorReady={onEditorReady}
      />,
    );

    await waitFor(() => expect(onEditorReady).toHaveBeenCalledTimes(1));

    expect(screen.getByTestId("slideshow-player").getAttribute("data-slideshow-sizing")).toBe(
      "contained",
    );
    expect(screen.getByTestId("course-document-runtime-renderer")).toBeInTheDocument();
    expect(screen.getByText("1 of 1")).toBeInTheDocument();
    expect(screen.queryByTestId("scaffold-runtime-unavailable")).toBeNull();
  });

  it("forwards explicit embedded sizing only to slideshow playback", async () => {
    const onEditorReady = vi.fn();

    render(
      <ContentRuntimeHost
        artifactId="artifact-1"
        initialContent={runtimeDocumentContent({
          mode: "slideshow",
          surfaceIds: ["slide-1"],
        })}
        slideshowSizing="embedded"
        onEditorReady={onEditorReady}
      />,
    );

    await waitFor(() => expect(onEditorReady).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("slideshow-player").getAttribute("data-slideshow-sizing")).toBe(
      "embedded",
    );
  });

  it("keeps Page selection isolated from slideshow sizing", async () => {
    const onEditorReady = vi.fn();

    render(
      <ContentRuntimeHost
        artifactId="artifact-1"
        initialContent={runtimeDocumentContent()}
        slideshowSizing="embedded"
        onEditorReady={onEditorReady}
      />,
    );

    await waitFor(() => expect(onEditorReady).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("page-player")).toBeInTheDocument();
    expect(screen.queryByTestId("slideshow-player")).toBeNull();
  });

  it("renders multi-surface slideshow mode with local navigation state", async () => {
    const user = userEvent.setup();
    const onEditorReady = vi.fn();

    render(
      <ContentRuntimeHost
        artifactId="artifact-1"
        initialContent={runtimeDocumentContent({
          mode: "slideshow",
          surfaceIds: ["slide-1", "slide-2"],
        })}
        onEditorReady={onEditorReady}
      />,
    );

    await waitFor(() => expect(onEditorReady).toHaveBeenCalledTimes(1));

    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    expect(surfaceById("slide-1").getAttribute("data-runtime-surface-visible")).toBe("true");
    expect(surfaceById("slide-2").getAttribute("data-runtime-surface-hidden")).toBe("true");

    await user.click(screen.getByRole("button", { name: "Next slide" }));

    await waitFor(() =>
      expect(surfaceById("slide-2").getAttribute("data-runtime-surface-visible")).toBe("true"),
    );
    expect(screen.getByText("2 of 2")).toBeInTheDocument();
  });

  it("renders unavailable when slideshow mode has no surfaces", () => {
    const onEditorReady = vi.fn();

    render(
      <ContentRuntimeHost
        artifactId="artifact-1"
        initialContent={runtimeDocumentContent({
          mode: "slideshow",
          surfaceIds: [],
        })}
        onEditorReady={onEditorReady}
      />,
    );

    expect(
      screen
        .getByTestId("scaffold-runtime-unavailable")
        .getAttribute("data-runtime-unavailable-reason"),
    ).toBe("invalid-surface-cardinality");
    expect(screen.queryByTestId("course-document-runtime-renderer")).toBeNull();
    expect(onEditorReady).not.toHaveBeenCalled();
  });

  it("renders unavailable when slideshow mode has a missing surface id", () => {
    const onEditorReady = vi.fn();

    render(
      <ContentRuntimeHost
        artifactId="artifact-1"
        initialContent={runtimeDocumentContent({
          mode: "slideshow",
          surfaceIds: ["slide-1", null],
        })}
        onEditorReady={onEditorReady}
      />,
    );

    expect(
      screen
        .getByTestId("scaffold-runtime-unavailable")
        .getAttribute("data-runtime-unavailable-reason"),
    ).toBe("missing-surface-id");
    expect(screen.queryByTestId("course-document-runtime-renderer")).toBeNull();
    expect(onEditorReady).not.toHaveBeenCalled();
  });

  it("renders unavailable for branching mode until a branching player exists", () => {
    const onEditorReady = vi.fn();

    render(
      <ContentRuntimeHost
        artifactId="artifact-1"
        initialContent={runtimeDocumentContent({
          mode: "branching",
          surfaceIds: ["screen-1"],
        })}
        onEditorReady={onEditorReady}
      />,
    );

    expect(
      screen
        .getByTestId("scaffold-runtime-unavailable")
        .getAttribute("data-runtime-unavailable-reason"),
    ).toBe("unsupported-mode");
    expect(screen.queryByTestId("course-document-runtime-renderer")).toBeNull();
    expect(onEditorReady).not.toHaveBeenCalled();
  });

  it("gates runtime players while learner activity loads", async () => {
    const onEditorReady = vi.fn();
    const xapi = createXapiPort();
    let resolveLoad!: (value: null) => void;
    const load = vi.fn(
      () =>
        new Promise<null>((resolve) => {
          resolveLoad = resolve;
        }),
    );

    render(
      <ScaffoldServicesProvider
        ports={{
          learnerActivity: {
            load,
            save: vi.fn(),
          },
          xapi,
        }}
      >
        <ContentRuntimeHost
          artifactId="artifact-runtime"
          courseTitle="Runtime Course"
          initialContent={runtimeDocumentContent()}
          onEditorReady={onEditorReady}
        />
      </ScaffoldServicesProvider>,
    );

    expect(screen.getByTestId("learner-activity-runtime-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("page-player")).toBeNull();
    expect(onEditorReady).not.toHaveBeenCalled();
    expect(xapi.send).not.toHaveBeenCalled();

    resolveLoad(null);

    await waitFor(() => expect(onEditorReady).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(statementVerbs(xapi)).toEqual(["initialized", "experienced"]));
    expect(screen.getByTestId("page-player")).toBeInTheDocument();
  });

  it("does not start xAPI when learner activity hydration fails", async () => {
    const xapi = createXapiPort();
    const load = vi.fn(async () => {
      throw new Error("progress unavailable");
    });

    render(
      <ScaffoldServicesProvider
        ports={{
          learnerActivity: {
            load,
            save: vi.fn(),
          },
          xapi,
        }}
      >
        <ContentRuntimeHost
          artifactId="artifact-runtime"
          courseTitle="Runtime Course"
          initialContent={runtimeDocumentContent()}
        />
      </ScaffoldServicesProvider>,
    );

    expect(await screen.findByTestId("learner-activity-runtime-error")).toBeInTheDocument();
    expect(screen.queryByTestId("page-player")).toBeNull();
    expect(xapi.send).not.toHaveBeenCalled();
  });

  it("waits for replacement-artifact hydration before starting its xAPI session", async () => {
    const xapi = createXapiPort();
    const replacementLoad = deferred<null>();
    const learnerActivity = {
      load: vi.fn(({ artifactId }: { artifactId: string }) =>
        artifactId === "artifact-two" ? replacementLoad.promise : Promise.resolve(null),
      ),
      save: vi.fn(),
    };
    const content = runtimeDocumentContent();
    const { rerender } = render(
      <ScaffoldServicesProvider ports={{ learnerActivity, xapi }}>
        <ContentRuntimeHost
          artifactId="artifact-one"
          courseTitle="Runtime Course"
          initialContent={content}
        />
      </ScaffoldServicesProvider>,
    );

    await waitFor(() => expect(statementVerbs(xapi)).toEqual(["initialized", "experienced"]));

    rerender(
      <ScaffoldServicesProvider ports={{ learnerActivity, xapi }}>
        <ContentRuntimeHost
          artifactId="artifact-two"
          courseTitle="Runtime Course"
          initialContent={content}
        />
      </ScaffoldServicesProvider>,
    );

    await waitFor(() =>
      expect(statementVerbs(xapi)).toEqual(["initialized", "experienced", "terminated"]),
    );
    expect(screen.getByTestId("learner-activity-runtime-loading")).toBeInTheDocument();

    replacementLoad.resolve(null);

    await waitFor(() =>
      expect(statementVerbs(xapi)).toEqual([
        "initialized",
        "experienced",
        "terminated",
        "initialized",
        "experienced",
      ]),
    );
    expect(screen.getByTestId("page-player")).toBeInTheDocument();
  });

  it("projects persisted frame attrs for Callout without runtime resize handles", async () => {
    const onEditorReady = vi.fn();
    const widthPercent = 50;

    render(
      <ContentRuntimeHost
        artifactId="artifact-frame"
        initialContent={runtimeDocumentWithBlock(calloutBlock(widthPercent))}
        onEditorReady={onEditorReady}
      />,
    );

    await waitFor(() => expect(onEditorReady).toHaveBeenCalledTimes(1));

    const frameElement = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>(
        '[data-runtime-frame="block"][data-id="block-callout-runtime"]',
      );
      if (!element) {
        throw new Error("Expected runtime frame projection to render");
      }
      return element;
    });

    expect(frameElement.style.width).toBe(`${widthPercent}%`);
    expect(frameElement.getAttribute("data-frame")).toContain(`"widthPercent":${widthPercent}`);
    expect(frameElement.classList.contains("sc-callout-node")).toBe(true);
    expect(document.body.querySelector("[data-authoring-frame-wrapper]")).toBeNull();
    expect(document.body.querySelector("[data-authoring-resize-handle]")).toBeNull();
  });
});
