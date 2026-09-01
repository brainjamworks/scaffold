// @vitest-environment happy-dom

import { Result } from "better-result";
import { Editor, type JSONContent } from "@tiptap/core";
import {
  EmbeddedDataIdSchema,
  EmbeddedNodeIdSchema,
  PresentationContentLayout,
} from "@scaffold/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  createCourseDocumentRuntimeExtensions,
  createPresentationContentLayoutPortForEditor,
} from "@/composition/runtime/create-runtime-composition";
import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { emptyCalloutData } from "@/editor/blocks/presentation/callout/content";
import { slideContentSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-content";
import { createScaffoldDocumentContent } from "@/format/artifact";
import type { PresentationVisualScene } from "@/presentation/model";

import type {
  PresentationLayoutAnimationFactory,
  PresentationLayoutAnimationHandle,
} from "./anime-visual-animation-driver";
import type {
  PresentationContentLayoutPort,
  PresentationContentLayoutResult,
} from "./presentation-content-layout-port";
import { getPresentationContentLayoutPortForEditor } from "./presentation-content-layout-port";
import { createPresentationVisualStateRenderer } from "./presentation-visual-state-renderer";

const SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00001");
const FLOW_ID = EmbeddedNodeIdSchema.parse("flow00000001");
const TARGET_ID = EmbeddedNodeIdSchema.parse("target000001");
const SECOND_TARGET_ID = EmbeddedNodeIdSchema.parse("target000002");
const SEGMENT_ID = EmbeddedDataIdSchema.parse("segment00001");

describe("Presentation content-layout choreography", () => {
  it("projects the previous and next Flow state around one Surface Layout handle", () => {
    const order: string[] = [];
    const port = recordingPort(order);
    const layout = recordingLayoutFactory(order);
    const { renderer, flow } = createRenderer(port, layout.factory);

    const report = renderer.apply(flowScene(0.5));

    expect(report).toEqual({ surfaceId: SURFACE_ID, timeMs: 1_250, unavailableTargets: [] });
    expect(port.apply).toHaveBeenCalledTimes(2);
    expect(port.apply.mock.calls[0]?.[0].containers).toEqual([
      {
        containerId: FLOW_ID,
        contentLayout: PresentationContentLayout.Flow,
        directChildIds: [TARGET_ID, SECOND_TARGET_ID],
        activeChildId: null,
        withheldChildIds: [],
      },
    ]);
    expect(port.apply.mock.calls[1]?.[0].containers[0]?.withheldChildIds).toEqual([TARGET_ID]);
    expect(layout.create).toHaveBeenCalledOnce();
    expect(layout.create.mock.calls[0]?.[0].root).toBe(flow.parentElement);
    expect(layout.create.mock.calls[0]?.[0]).toMatchObject({
      durationMs: 500,
      easing: "linear",
    });
    expect(layout.spies[0]!.apply).toHaveBeenCalledWith(250);
    expect(order).toEqual(["port:previous", "layout:create", "port:current", "layout:apply"]);
  });

  it("seeks the same Layout handle backwards and replaces it on interruption", () => {
    const port = recordingPort();
    const layout = recordingLayoutFactory();
    const { renderer } = createRenderer(port, layout.factory);

    renderer.apply(flowScene(0.75));
    renderer.apply(flowScene(0.25));

    expect(layout.create).toHaveBeenCalledOnce();
    const firstSpies = layout.spies[0]!;
    expect(firstSpies.apply).toHaveBeenNthCalledWith(1, 375);
    expect(firstSpies.apply).toHaveBeenNthCalledWith(2, 125);

    renderer.apply(flowScene(0.5, EmbeddedDataIdSchema.parse("segment00002")));
    expect(firstSpies.cancel).toHaveBeenCalledOnce();
    expect(firstSpies.dispose).toHaveBeenCalledOnce();
    expect(layout.create).toHaveBeenCalledTimes(2);
  });

  it("applies reduced-motion layout immediately and disposes projection ownership", () => {
    const port = recordingPort();
    const layout = recordingLayoutFactory();
    const { renderer } = createRenderer(port, layout.factory);

    renderer.apply(flowScene(null));
    expect(port.apply).toHaveBeenCalledOnce();
    expect(layout.create).not.toHaveBeenCalled();

    renderer.dispose();
    renderer.dispose();
    expect(port.clear).toHaveBeenCalledOnce();
  });

  it("preserves a reason-specific expected projection refusal in the apply report", () => {
    const port = recordingPort();
    const error = Object.freeze({
      reason: "content-layout-changed" as const,
      surfaceId: SURFACE_ID,
      containerId: FLOW_ID,
      expectedContentLayout: PresentationContentLayout.Flow,
      currentContentLayout: PresentationContentLayout.Sequence,
    });
    port.apply.mockReturnValue(Result.err(error));
    const { renderer } = createRenderer(port, recordingLayoutFactory().factory);

    expect(renderer.apply(flowScene(null))).toMatchObject({ contentLayoutError: error });
  });
});

describe("PresentationContentLayoutPort runtime adapter", () => {
  it("publishes the runtime-owned port without exposing the composition root to Slideshow", () => {
    const fixture = runtimePortFixture();

    expect(getPresentationContentLayoutPortForEditor(fixture.editor)).toMatchObject({
      apply: expect.any(Function),
      clear: expect.any(Function),
    });
    fixture.editor.destroy();
  });

  it("applies projection metadata without mutating the portable document", () => {
    const fixture = runtimePortFixture();
    const before = fixture.editor.getJSON();
    const port = createPresentationContentLayoutPortForEditor(fixture.editor);

    const result = port.apply(fixture.request());

    expect(result.isOk()).toBe(true);
    expect(fixture.editor.getJSON()).toEqual(before);
    port.clear();
    expect(fixture.editor.getJSON()).toEqual(before);
    fixture.editor.destroy();
  });

  it.each([
    {
      name: "Surface drift",
      mutate: (fixture: ReturnType<typeof runtimePortFixture>) => ({
        ...fixture.request(),
        surfaceId: EmbeddedNodeIdSchema.parse("missing00001"),
      }),
      expected: (fixture: ReturnType<typeof runtimePortFixture>) => ({
        reason: "surface-not-current",
        surfaceId: "missing00001",
        currentSurfaceIds: [fixture.surfaceId],
      }),
    },
    {
      name: "container drift",
      mutate: (fixture: ReturnType<typeof runtimePortFixture>) => ({
        ...fixture.request(),
        containers: [
          {
            ...fixture.request().containers[0]!,
            containerId: EmbeddedNodeIdSchema.parse("missing00002"),
          },
        ],
      }),
      expected: () => ({
        reason: "container-not-current",
        surfaceId: SURFACE_ID,
        containerId: "missing00002",
        currentSurfaceId: null,
      }),
    },
    {
      name: "content-layout drift",
      mutate: (fixture: ReturnType<typeof runtimePortFixture>) => ({
        ...fixture.request(),
        containers: [
          {
            ...fixture.request().containers[0]!,
            contentLayout: PresentationContentLayout.Sequence,
            activeChildId: fixture.firstId,
          },
        ],
      }),
      expected: (fixture: ReturnType<typeof runtimePortFixture>) => ({
        reason: "content-layout-changed",
        surfaceId: fixture.surfaceId,
        containerId: fixture.containerId,
        expectedContentLayout: PresentationContentLayout.Sequence,
        currentContentLayout: PresentationContentLayout.Flow,
      }),
    },
    {
      name: "direct-child drift",
      mutate: (fixture: ReturnType<typeof runtimePortFixture>) => ({
        ...fixture.request(),
        containers: [
          {
            ...fixture.request().containers[0]!,
            directChildIds: [fixture.secondId, fixture.firstId],
          },
        ],
      }),
      expected: (fixture: ReturnType<typeof runtimePortFixture>) => ({
        reason: "direct-children-changed",
        surfaceId: fixture.surfaceId,
        containerId: fixture.containerId,
        expectedDirectChildIds: [fixture.secondId, fixture.firstId],
        currentDirectChildIds: [fixture.firstId, fixture.secondId],
      }),
    },
    {
      name: "projection refusal",
      mutate: (fixture: ReturnType<typeof runtimePortFixture>) => ({
        ...fixture.request(),
        containers: [
          {
            ...fixture.request().containers[0]!,
            withheldChildIds: [EmbeddedNodeIdSchema.parse("missing00003")],
          },
        ],
      }),
      expected: (fixture: ReturnType<typeof runtimePortFixture>) => ({
        reason: "projection-refused",
        surfaceId: fixture.surfaceId,
        containerId: fixture.containerId,
        issue: {
          kind: "withheld-child-not-direct",
          containerId: fixture.containerId,
          childId: "missing00003",
        },
      }),
    },
  ])("returns immutable typed data for $name", ({ mutate, expected }) => {
    const fixture = runtimePortFixture();
    const result = createPresentationContentLayoutPortForEditor(fixture.editor).apply(
      mutate(fixture),
    );

    expect(result.isErr()).toBe(true);
    if (result.isOk()) throw new Error("Expected content-layout refusal.");
    expect(result.error).toEqual(expected(fixture));
    expect(Object.isFrozen(result.error)).toBe(true);
    fixture.editor.destroy();
  });

  it("keeps a duplicate internal container batch observable as a thrown invariant", () => {
    const fixture = runtimePortFixture();
    const request = fixture.request();
    const duplicate = { ...request, containers: [request.containers[0]!, request.containers[0]!] };

    expect(() =>
      createPresentationContentLayoutPortForEditor(fixture.editor).apply(duplicate),
    ).toThrow(/duplicate-container-input/);
    fixture.editor.destroy();
  });
});

function createRenderer(
  contentLayoutPort: PresentationContentLayoutPort,
  createLayoutAnimation: PresentationLayoutAnimationFactory,
) {
  const surface = document.createElement("section");
  const flow = document.createElement("div");
  const flowContentRoot = document.createElement("div");
  flowContentRoot.setAttribute("data-content-layout-root", "");
  const target = document.createElement("div");
  const secondTarget = document.createElement("div");
  flowContentRoot.append(target, secondTarget);
  flow.append(flowContentRoot);
  surface.append(flow);
  document.body.append(surface);
  const elements = new Map([
    [SURFACE_ID, surface],
    [FLOW_ID, flow],
    [TARGET_ID, target],
    [SECOND_TARGET_ID, secondTarget],
  ]);
  const renderer = createPresentationVisualStateRenderer({
    contentLayoutPort,
    createLayoutAnimation,
    resolver: {
      resolve(targetId) {
        const element = elements.get(targetId);
        return element
          ? { kind: "resolved", targetId, element }
          : { kind: "unavailable", targetId, reason: "target-unmounted" };
      },
      clear: vi.fn(),
    },
    driver: {
      create: vi.fn(() => ({ seek: vi.fn(), cancel: vi.fn() })),
    },
  });
  return { renderer, surface, flow };
}

function flowScene(progress: number | null, segmentId = SEGMENT_ID): PresentationVisualScene {
  return {
    surfaceId: SURFACE_ID,
    timeMs: progress === null ? 1_500 : 1_000 + Math.round(progress * 500),
    targetStates: new Map([
      [
        TARGET_ID,
        {
          targetId: TARGET_ID,
          availability: "withheld",
          layoutParticipation: progress === null ? "none" : "transition-overlay",
          moveContributions: [],
          paint:
            progress === null
              ? { kind: "none" }
              : {
                  kind: "transition",
                  segmentId,
                  progress,
                  visual: {
                    kind: "hide",
                    transition: {
                      kind: "fade",
                      durationMs: 500,
                      easing: { kind: "preset", preset: "linear" },
                    },
                  },
                },
        },
      ],
    ]),
    flowStates: [
      {
        boundaryId: FLOW_ID,
        directChildIds: [TARGET_ID, SECOND_TARGET_ID],
        withheldChildIds: [TARGET_ID],
        ...(progress === null
          ? {}
          : {
              transition: {
                segmentId,
                startMs: 1_000,
                endMs: 1_500,
                progress,
                visual: {
                  kind: "hide",
                  transition: {
                    kind: "fade",
                    durationMs: 500,
                    easing: { kind: "preset", preset: "linear" },
                  },
                },
                previousWithheldChildIds: [],
                nextWithheldChildIds: [TARGET_ID],
              },
            }),
      },
    ],
    sequenceStates: [],
  };
}

function recordingPort(order: string[] = []) {
  const apply = vi.fn(
    (
      request: Parameters<PresentationContentLayoutPort["apply"]>[0],
    ): PresentationContentLayoutResult => {
      order.push(
        (request.containers[0]?.withheldChildIds ?? []).length === 0
          ? "port:previous"
          : "port:current",
      );
      return Result.ok();
    },
  );
  return {
    apply,
    clear: vi.fn(),
  } satisfies PresentationContentLayoutPort & { readonly apply: typeof apply };
}

function recordingLayoutFactory(order: string[] = []) {
  const spies: Array<Record<"apply" | "cancel" | "finish" | "dispose", ReturnType<typeof vi.fn>>> =
    [];
  const create = vi.fn((input: Parameters<PresentationLayoutAnimationFactory>[0]) => {
    order.push("layout:create");
    input.applyLayout();
    const handle = {
      apply: vi.fn(() => order.push("layout:apply")),
      cancel: vi.fn(),
      finish: vi.fn(),
      dispose: vi.fn(),
    } satisfies PresentationLayoutAnimationHandle;
    spies.push(handle);
    return handle;
  });
  return { factory: create as PresentationLayoutAnimationFactory, create, spies };
}

function runtimePortFixture() {
  const surfaceId = SURFACE_ID;
  const firstId = TARGET_ID;
  const secondId = SECOND_TARGET_ID;
  const content = createScaffoldDocumentContent({
    mode: "slideshow",
    surfaceId,
    initialCourseSectionTitle: "Layout port",
  });
  const courseDocument = content.content?.[0];
  if (courseDocument?.type !== "courseDocument") throw new Error("Expected Course Document.");
  const courseSection = courseDocument.content?.find((node) => node.type === "courseSection");
  if (!courseSection) throw new Error("Expected Course Section.");
  const surface = slideContentSurfaceDefinition.createSurface({ surfaceId });
  const region = surface.content?.find((node) => node.type === "region");
  if (!region) throw new Error("Expected Region.");
  region.content = [calloutNode(firstId), calloutNode(secondId)];
  assignMissingIds(surface);
  const containerId = EmbeddedNodeIdSchema.parse(String(region.attrs?.["id"]));
  courseDocument.content = [courseSection, surface];
  const editor = new Editor({
    editable: false,
    extensions: createCourseDocumentRuntimeExtensions({
      composition: createCoreScaffoldRuntimeComposition(),
    }),
    content,
  });
  return {
    editor,
    surfaceId,
    containerId,
    firstId,
    secondId,
    request: () => ({
      surfaceId,
      containers: [
        {
          containerId,
          contentLayout: PresentationContentLayout.Flow,
          directChildIds: [firstId, secondId],
          activeChildId: null,
          withheldChildIds: [firstId],
        },
      ],
    }),
  } as const;
}

function calloutNode(id: ReturnType<typeof EmbeddedNodeIdSchema.parse>): JSONContent {
  return {
    type: "callout",
    attrs: { id, data: emptyCalloutData() },
    content: [
      {
        type: "callout_title",
        content: [{ type: "paragraph", content: [{ type: "text", text: id }] }],
      },
      {
        type: "callout_prompt",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Body" }] }],
      },
    ],
  };
}

function assignMissingIds(rootNode: JSONContent): void {
  const stack = [rootNode];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.type !== "text") {
      node.attrs = { ...node.attrs, id: node.attrs?.["id"] ?? createEmbeddedNodeId() };
    }
    stack.push(...(node.content ?? []));
  }
}
