// @vitest-environment happy-dom

import "@testing-library/jest-dom/vitest";

import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { JSONContent } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  createScaffoldApplication,
  defineScaffoldExtensionPack,
  type SurfaceCapability,
} from "@/composition/application/create-scaffold-application";
import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { createScaffoldDocumentContent } from "@/format/artifact";
import type { SurfaceAuthoringViewProps } from "@/editor/surfaces/authoring/surface-authoring-view-registry";
import type { SurfaceRuntimeViewProps } from "@/editor/surfaces/runtime/surface-runtime-view-registry";
import { SurfaceRuntimeFrame } from "@/editor/surfaces/runtime/views/SurfaceRuntimeFrame";
import type { ScaffoldLearnerBootstrap, ScaffoldLearnerHostServices } from "@/host/contracts";
import type { LearningEventPort } from "@/host/ports/learning-events";
import { SCAFFOLD_DEFAULT_PRESET, type ScaffoldThemeExtension } from "@/theme/model";

import { ScaffoldLearnerApp } from "./ScaffoldLearnerApp";

const runtimeComposition = createCoreScaffoldRuntimeComposition();
const LEARNER_TEXT_SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00011");
const LEARNER_MCQ_SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00012");
const LEARNER_SURFACE_ID_BY_MODE = {
  slideshow: EmbeddedNodeIdSchema.parse("surface00013"),
  branching: EmbeddedNodeIdSchema.parse("surface00014"),
} as const;

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
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function learnerDocumentWithText(text: string): JSONContent {
  const content = createScaffoldDocumentContent({
    mode: "page",
    surfaceId: LEARNER_TEXT_SURFACE_ID,
  });
  const courseDocument = content.content?.[0];
  const surface = courseDocument?.content?.[0];

  if (!surface) {
    throw new Error("learner app test document is missing its first surface");
  }

  surface.content = [
    {
      type: "paragraph",
      content: [{ type: "text", text }],
    },
  ];

  return content;
}

function learnerDocumentWithMcq(): JSONContent {
  const content = createScaffoldDocumentContent({
    mode: "page",
    surfaceId: LEARNER_MCQ_SURFACE_ID,
  });
  const courseDocument = content.content?.[0];
  const surface = courseDocument?.content?.[0];

  if (!surface) {
    throw new Error("learner app test document is missing its first surface");
  }

  surface.content = [
    {
      type: "mcq",
      attrs: {
        id: "mcq-runtime-only",
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
      content: [
        { type: "assessment_title", content: [{ type: "paragraph" }] },
        { type: "assessment_instructions", content: [{ type: "paragraph" }] },
        {
          type: "assessment_prompt",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Which letter comes second?" }],
            },
          ],
        },
        {
          type: "assessment_choices_group",
          content: [selectableChoice("choice-a", "A"), selectableChoice("choice-b", "B")],
        },
        {
          type: "assessment_actions_group",
          content: [{ type: "assessment_hints_group" }, { type: "assessment_summary_feedback" }],
        },
      ],
    },
  ];

  return content;
}

function selectableChoice(id: string, text: string): JSONContent {
  return {
    type: "selectable_choice",
    attrs: { id },
    content: [
      {
        type: "selectable_choice_body",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text }],
          },
        ],
      },
    ],
  };
}

function learnerDocumentForMode(mode: "slideshow" | "branching"): JSONContent {
  return createScaffoldDocumentContent({
    mode,
    surfaceId: LEARNER_SURFACE_ID_BY_MODE[mode],
  });
}

function learnerBootstrap(
  overrides: Partial<ScaffoldLearnerBootstrap> = {},
): ScaffoldLearnerBootstrap {
  return {
    artifactId: "artifact-learner",
    title: "Learner artifact",
    mode: "page",
    learnerContent: learnerDocumentWithText("Projected learner content"),
    ...overrides,
  };
}

function privateLearnerSurfaceCapability(id: string): SurfaceCapability {
  return {
    definition: {
      id,
      modes: ["page"],
      title: "Private learner Surface",
      description: "Private-pack Surface used to verify the public learner mount",
      structurePolicy: {
        fixedChildren: [{ type: "paragraph" }],
        allowRootInsertion: true,
      },
      createSurface: ({ surfaceId }) => ({
        type: "surface",
        attrs: { id: surfaceId, variant: id, settings: {} },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Private learner Surface content" }],
          },
        ],
      }),
    },
    authoringView: { variantId: id, component: PrivateLearnerSurfaceAuthoringView },
    runtimeView: { variantId: id, component: PrivateLearnerSurfaceRuntimeView },
  };
}

function PrivateLearnerSurfaceAuthoringView(_props: SurfaceAuthoringViewProps) {
  return null;
}

function PrivateLearnerSurfaceRuntimeView(props: SurfaceRuntimeViewProps) {
  return (
    <SurfaceRuntimeFrame
      {...props}
      attributes={{ "data-private-learner-surface": props.definition.id }}
    />
  );
}

describe("ScaffoldLearnerApp", () => {
  it("renders private-pack content through the supplied runtime composition", async () => {
    const capability = privateLearnerSurfaceCapability("private-learner-surface");
    const application = createScaffoldApplication({
      packs: [
        defineScaffoldExtensionPack({
          id: "private-learner-surface-pack",
          surfaces: [capability],
        }),
      ],
    });
    const learnerContent = learnerDocumentWithText("Core content replaced by private Surface");
    learnerContent.content![0]!.content = [
      capability.definition.createSurface({ surfaceId: createEmbeddedNodeId() }),
    ];

    render(
      <ScaffoldLearnerApp
        bootstrap={learnerBootstrap({ learnerContent })}
        composition={application.runtime}
        services={{}}
      />,
    );

    await waitFor(() =>
      expect(
        document.body.querySelector(`[data-private-learner-surface="${capability.definition.id}"]`),
      ).not.toBeNull(),
    );
    expect(screen.queryByTestId("scaffold-runtime-unavailable")).toBeNull();
  });

  it("applies a validated host theme extension to learner content", async () => {
    const themeExtension = hostThemeExtension();
    const hostPreset = themeExtension.presets![0]!;
    const learnerContent = learnerDocumentWithText("Host themed learner content");
    learnerContent.content![0]!.attrs = {
      ...learnerContent.content![0]!.attrs,
      theme: {
        schemaVersion: 1,
        preset: { id: hostPreset.id, revision: hostPreset.revision },
        values: structuredClone(hostPreset.values),
      },
    };

    render(
      <ScaffoldLearnerApp
        composition={runtimeComposition}
        bootstrap={learnerBootstrap({ learnerContent })}
        services={{}}
        themeExtension={themeExtension}
      />,
    );

    await screen.findByText("Host themed learner content");
    expect(screen.getByTestId("course-theme-scope")).toHaveAttribute(
      "data-effective-course-theme",
      hostPreset.id,
    );
  });

  it("falls back and restores a host theme without mutating the saved snapshot", async () => {
    const themeExtension = hostThemeExtension();
    const hostPreset = themeExtension.presets![0]!;
    const learnerContent = learnerDocumentWithText("Recoverable host theme");
    learnerContent.content![0]!.attrs = {
      ...learnerContent.content![0]!.attrs,
      theme: {
        schemaVersion: 1,
        preset: { id: hostPreset.id, revision: hostPreset.revision },
        values: structuredClone(hostPreset.values),
      },
    };
    const savedTheme = structuredClone(learnerContent.content![0]!.attrs!["theme"]);
    const bootstrap = learnerBootstrap({ learnerContent });
    const view = render(
      <ScaffoldLearnerApp
        composition={runtimeComposition}
        bootstrap={bootstrap}
        services={{}}
        themeExtension={themeExtension}
      />,
    );

    await screen.findByText("Recoverable host theme");
    expect(screen.getByTestId("course-theme-scope")).toHaveAttribute(
      "data-effective-course-theme",
      hostPreset.id,
    );

    view.rerender(
      <ScaffoldLearnerApp composition={runtimeComposition} bootstrap={bootstrap} services={{}} />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("course-theme-scope")).toHaveAttribute(
        "data-effective-course-theme",
        SCAFFOLD_DEFAULT_PRESET.id,
      ),
    );
    expect(screen.queryByRole("alert")).toBeNull();

    view.rerender(
      <ScaffoldLearnerApp
        composition={runtimeComposition}
        bootstrap={bootstrap}
        services={{}}
        themeExtension={themeExtension}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("course-theme-scope")).toHaveAttribute(
        "data-effective-course-theme",
        hostPreset.id,
      ),
    );
    expect(learnerContent.content![0]!.attrs!["theme"]).toEqual(savedTheme);
  });

  it("applies an explicit host mode to learner chrome and course presentation", async () => {
    const { rerender } = render(
      <ScaffoldLearnerApp
        composition={runtimeComposition}
        bootstrap={learnerBootstrap()}
        hostColorMode="dark"
        services={{}}
      />,
    );

    await screen.findByText("Projected learner content");
    const runtimeHost = screen.getByTestId("scaffold-runtime-host");
    const courseScope = screen.getByTestId("course-theme-scope");
    expect(runtimeHost).toHaveAttribute("data-scaffold-color-mode", "dark");
    expect(runtimeHost).toHaveClass("sc-course-theme-scope");
    expect(runtimeHost.style.colorScheme).toBe("dark");
    expect(courseScope).toHaveAttribute("data-course-color-mode", "dark");

    rerender(
      <ScaffoldLearnerApp
        composition={runtimeComposition}
        bootstrap={learnerBootstrap()}
        hostColorMode="light"
        services={{}}
      />,
    );

    await waitFor(() => {
      expect(runtimeHost).toHaveAttribute("data-scaffold-color-mode", "light");
      expect(courseScope).toHaveAttribute("data-course-color-mode", "light");
    });
  });

  it("updates learner chrome and course presentation with the browser fallback", async () => {
    const media = installColorModePreference(false);
    render(
      <ScaffoldLearnerApp
        composition={runtimeComposition}
        bootstrap={learnerBootstrap()}
        services={{}}
      />,
    );

    await screen.findByText("Projected learner content");
    const runtimeHost = screen.getByTestId("scaffold-runtime-host");
    const courseScope = screen.getByTestId("course-theme-scope");
    expect(runtimeHost).toHaveAttribute("data-scaffold-color-mode", "light");
    expect(courseScope).toHaveAttribute("data-course-color-mode", "light");

    act(() => media.setDark(true));

    await waitFor(() => {
      expect(runtimeHost).toHaveAttribute("data-scaffold-color-mode", "dark");
      expect(courseScope).toHaveAttribute("data-course-color-mode", "dark");
    });
  });

  it("renders projected learner content from learner bootstrap", async () => {
    render(
      <ScaffoldLearnerApp
        composition={runtimeComposition}
        bootstrap={learnerBootstrap()}
        services={{}}
      />,
    );

    expect(await screen.findByText("Projected learner content")).toBeInTheDocument();
    expect(screen.getByTestId("scaffold-runtime-host")).toBeInTheDocument();
    expect(screen.getByTestId("course-document-runtime-renderer")).toBeInTheDocument();
    expect(screen.queryByTestId("course-document-editor")).toBeNull();

    const editableSurface = document.body.querySelector(".ProseMirror");
    expect(editableSurface?.getAttribute("contenteditable")).toBe("false");
  });

  it("renders slideshow learner content through the slideshow player", async () => {
    render(
      <ScaffoldLearnerApp
        composition={runtimeComposition}
        bootstrap={learnerBootstrap({
          mode: "slideshow",
          learnerContent: learnerDocumentForMode("slideshow"),
        })}
        services={{}}
      />,
    );

    expect(
      (await screen.findByTestId("slideshow-player")).getAttribute("data-slideshow-sizing"),
    ).toBe("embedded");
    expect(screen.getByTestId("course-document-runtime-renderer")).toBeInTheDocument();
    expect(screen.getByText("1 of 1")).toBeInTheDocument();
    expect(screen.queryByTestId("scaffold-runtime-unavailable")).toBeNull();
  });

  it("allows a two-axis host to request contained slideshow fitting", async () => {
    render(
      <ScaffoldLearnerApp
        composition={runtimeComposition}
        bootstrap={learnerBootstrap({
          mode: "slideshow",
          learnerContent: learnerDocumentForMode("slideshow"),
        })}
        services={{}}
        slideshowSizing="contained"
      />,
    );

    expect(
      (await screen.findByTestId("slideshow-player")).getAttribute("data-slideshow-sizing"),
    ).toBe("contained");
  });

  it("renders an MCQ through runtime-only block registration", async () => {
    render(
      <ScaffoldLearnerApp
        composition={runtimeComposition}
        bootstrap={learnerBootstrap({
          learnerContent: learnerDocumentWithMcq(),
        })}
        services={{}}
      />,
    );

    expect(await screen.findByText("Which letter comes second?")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.queryByTestId("course-document-editor")).toBeNull();
  });

  it("passes learner host services through the runtime provider", async () => {
    const load = vi.fn(async () => null);
    const accept = vi.fn<LearningEventPort["accept"]>(async () => undefined);
    const services = {
      learnerActivity: {
        load,
        save: vi.fn(async ({ record }) => ({
          ...record,
          updatedAt: "2026-07-17T08:00:00Z",
        })),
      },
      learningEvents: {
        rootActivityId: "https://learning.example.test/artifacts/artifact-services",
        accept,
      },
    } satisfies ScaffoldLearnerHostServices;

    render(
      <ScaffoldLearnerApp
        composition={runtimeComposition}
        bootstrap={learnerBootstrap({ artifactId: "artifact-services" })}
        services={services}
      />,
    );

    await waitFor(() =>
      expect(load).toHaveBeenCalledWith({
        artifactId: "artifact-services",
      }),
    );
    await waitFor(() => expect(accept).toHaveBeenCalledTimes(2));
    expect(accept.mock.calls[0]?.[0]).toMatchObject({
      verb: { display: { en: "initialized" } },
      object: {
        id: services.learningEvents.rootActivityId,
        definition: { name: { en: "Learner artifact" } },
      },
    });
    expect(accept.mock.calls[1]?.[0]).toMatchObject({
      verb: { display: { en: "experienced" } },
    });
  });

  it("accepts a strict assessment snapshot while keeping activity state separate", async () => {
    render(
      <ScaffoldLearnerApp
        composition={runtimeComposition}
        bootstrap={learnerBootstrap({
          initialLearnerState: {
            assessmentSnapshot: {
              snapshotVersion: 2,
              artifactId: "artifact-learner",
              problems: {
                "target-mcq-1": {
                  response: { kind: "single-select", optionId: "choice-1" },
                  submitted: true,
                  attemptNumber: 1,
                  hintsShown: 0,
                  checkResult: null,
                  submissionResult: {
                    isCorrect: true,
                    score: { scaled: 1 },
                    feedback: null,
                    items: {},
                  },
                },
              },
              quizzes: {},
            },
            learnerActivitySnapshot: {
              snapshotVersion: 1,
              artifactId: "artifact-learner",
              activities: {
                "flashcard-1": {
                  activityKind: "flashcard",
                  data: { currentCard: 2 },
                  completed: false,
                  updatedAt: null,
                },
              },
            },
          },
        })}
        services={{}}
      />,
    );

    await screen.findByText("Projected learner content");
    expect(screen.getByTestId("page-player")).toBeInTheDocument();
  });

  it("passes unknown assessment input through the strict snapshot parser", () => {
    const bootstrap = learnerBootstrap();
    Object.defineProperty(bootstrap, "initialLearnerState", {
      value: {
        assessmentSnapshot: {
          snapshotVersion: 3,
          artifactId: "artifact-learner",
          problems: {},
          quizzes: {},
        },
      },
    });

    expect(() =>
      render(
        <ScaffoldLearnerApp composition={runtimeComposition} bootstrap={bootstrap} services={{}} />,
      ),
    ).toThrow();
  });
});

function hostThemeExtension(): ScaffoldThemeExtension {
  const preset = structuredClone(SCAFFOLD_DEFAULT_PRESET);
  preset.id = "host-course";
  preset.revision = "host-course-v1";
  preset.label = "Host course";
  return { presets: [preset] };
}

function installColorModePreference(initialDark: boolean) {
  let matches = initialDark;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mediaQuery = {
    get matches() {
      return matches;
    },
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_type: "change", listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: "change", listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
  } as MediaQueryList;
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mediaQuery),
  );

  return {
    setDark(next: boolean) {
      matches = next;
      const event = { matches, media: mediaQuery.media } as MediaQueryListEvent;
      for (const listener of listeners) listener(event);
    },
  };
}
