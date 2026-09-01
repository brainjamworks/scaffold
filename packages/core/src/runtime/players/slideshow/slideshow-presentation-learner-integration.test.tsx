// @vitest-environment happy-dom

import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { Result } from "better-result";
import {
  act,
  cleanup,
  fireEvent,
  render as renderTest,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { projectCourseStructure, type SurfaceId } from "@/document/model/course-structure";
import {
  createLearnerInteractionEventKey,
  type CompiledLearnerInteractionRule,
  type CompiledSurfaceLearnerInteractionProgram,
} from "@/runtime/learner-interaction/compiled-learner-interaction-program";
import type { PresentationWaitId } from "@/runtime/presentation/compiled-presentation-program";
import type { PresentationGateObservationSnapshot } from "@/runtime/presentation/presentation-progression-gate";
import type {
  PresentationHold,
  PresentationPlaybackPhase,
  PresentationPlaybackSession,
  PresentationPlaybackSnapshot,
} from "@/runtime/presentation/presentation-playback-session";
import {
  checkRuntimeDocumentReadiness,
  type PreparedCourseDocumentRuntimeRendererProps,
} from "@/runtime/renderer/CourseDocumentRuntimeRenderer";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";

import { SlideshowPlayer } from "./SlideshowPlayer";
import type {
  CreateSlideshowSurfaceRuntimeCompositionInput,
  SlideshowSurfaceRuntimeComposition,
  SlideshowSurfaceRuntimeProgram,
  SlideshowSurfaceRuntimeProgramSource,
} from "./slideshow-surface-runtime-composition";
import type { SurfaceExitEnvironment } from "./surface-exit-environment";
import { deriveRequiredControlBindingOwnerIds } from "./use-slideshow-surface-runtime";

const slideshowRuntimeTestProbe = vi.hoisted(() => ({
  createComposition: undefined as ((input: unknown) => unknown) | undefined,
  getControlBindings: undefined as ((editor: unknown) => unknown) | undefined,
}));
const surfaceExitTestProbe = vi.hoisted(() => ({
  environment: undefined as unknown,
}));

vi.mock("../../renderer/CourseDocumentRuntimeRenderer", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../renderer/CourseDocumentRuntimeRenderer")>();
  const { createElement } = await import("react");
  const { useSurfaceExitEnvironmentAvailability } =
    await import("./SurfaceExitEnvironmentProvider");

  return {
    ...actual,
    PreparedCourseDocumentRuntimeRenderer(props: PreparedCourseDocumentRuntimeRendererProps) {
      const availability = useSurfaceExitEnvironmentAvailability();
      surfaceExitTestProbe.environment =
        availability.status === "available" ? availability.environment : undefined;
      return createElement(actual.PreparedCourseDocumentRuntimeRenderer, props);
    },
  };
});

vi.mock("./slideshow-surface-runtime-composition", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./slideshow-surface-runtime-composition")>();
  return {
    ...actual,
    createSlideshowSurfaceRuntimeComposition(
      input: CreateSlideshowSurfaceRuntimeCompositionInput,
    ) {
      return slideshowRuntimeTestProbe.createComposition?.(input) ??
        actual.createSlideshowSurfaceRuntimeComposition(input);
    },
  };
});

vi.mock("@/document/control-binding", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/document/control-binding")>();
  return {
    ...actual,
    getControlBindingRegistryForEditor(editor: TiptapEditor) {
      return slideshowRuntimeTestProbe.getControlBindings?.(editor) ??
        actual.getControlBindingRegistryForEditor(editor);
    },
  };
});

const runtimeComposition = createCoreScaffoldRuntimeComposition();
const coreProductAccess = { scaffoldPlusAuthorized: false } as const;
const FIRST_SURFACE_ID = "surfaceCtrl1" as SurfaceId;
const SECOND_SURFACE_ID = "surfaceCtrl2" as SurfaceId;
const TABS_OWNER_ID = "layoutCtrl01" as EmbeddedNodeId;
const NEVER_MOUNTED_OWNER_ID = "missingOwn01" as EmbeddedNodeId;
const OVERVIEW_SECTION_ID = "sectionCtl01" as EmbeddedNodeId;
const PRACTICE_SECTION_ID = "sectionCtl02" as EmbeddedNodeId;

class ResizeObserverStub implements ResizeObserver {
  readonly observe = vi.fn((target: Element) => {
    if (!target.matches(".sc-slideshow-player__viewport, .sc-slideshow-player__stage")) return;
    this.callback(
      [
        {
          target,
          contentRect: { width: 1024, height: 576 },
        } as ResizeObserverEntry,
      ],
      this,
    );
  });
  readonly unobserve = vi.fn();
  readonly disconnect = vi.fn();

  constructor(private readonly callback: ResizeObserverCallback) {}
}

beforeEach(() => {
  slideshowRuntimeTestProbe.createComposition = undefined;
  slideshowRuntimeTestProbe.getControlBindings = undefined;
  surfaceExitTestProbe.environment = undefined;
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Slideshow Presentation learner integration", () => {
  it("deduplicates every explicit Control Binding owner without treating reveal targets as owners", () => {
    const whenOwner = "whenOwner001" as EmbeddedNodeId;
    const conditionOwner = "condition001" as EmbeddedNodeId;
    const commandOwner = "commandOwn01" as EmbeddedNodeId;
    const waitOwner = "waitOwner001" as EmbeddedNodeId;
    const cueOwner = "cueOwner0001" as EmbeddedNodeId;
    const revealTarget = "revealTgt001" as EmbeddedNodeId;
    const when = {
      ownerId: whenOwner,
      targetId: "whenTarget01" as EmbeddedNodeId,
      type: "selected",
    } as const;
    const program: SlideshowSurfaceRuntimeProgram = {
      learnerInteractions: {
        surfaceId: FIRST_SURFACE_ID,
        rulesByEvent: new Map([
          [
            createLearnerInteractionEventKey(when),
            [
              {
                id: "owner-derivation-rule",
                when,
                conditions: [
                  {
                    ownerId: conditionOwner,
                    targetId: "conditionT01" as EmbeddedNodeId,
                    key: "selected",
                    operator: "equals",
                    value: true,
                  },
                ],
                commands: [
                  {
                    kind: "target-command",
                    ownerId: commandOwner,
                    targetId: "commandTgt01" as EmbeddedNodeId,
                    type: "select",
                  },
                  { kind: "reveal-target", targetId: revealTarget },
                ],
              },
            ],
          ],
        ]),
      },
      presentation: {
        autoAdvance: false,
        timeline: {
          surfaceId: FIRST_SURFACE_ID,
          durationMs: 100,
          waits: [
            {
              kind: "learner-wait",
              id: "owner-wait" as PresentationWaitId,
              atMs: 0,
              requirement: {
                kind: "state",
                ownerId: waitOwner,
                targetId: "waitTarget01" as EmbeddedNodeId,
                key: "selected",
                equals: true,
              },
            },
            {
              kind: "learner-wait",
              id: "duplicate-wait" as PresentationWaitId,
              atMs: 20,
              requirement: { kind: "event", ...when },
            },
          ],
          cues: [
            {
              id: "owner-cue",
              atMs: 10,
              command: {
                kind: "target-command",
                ownerId: cueOwner,
                targetId: "cueTarget001" as EmbeddedNodeId,
                type: "select",
              },
            },
            {
              id: "duplicate-cue",
              atMs: 30,
              command: {
                kind: "target-command",
                ownerId: commandOwner,
                targetId: "commandTgt01" as EmbeddedNodeId,
                type: "select",
              },
            },
          ],
        },
      },
    };

    expect(deriveRequiredControlBindingOwnerIds(program)).toEqual([
      whenOwner,
      conditionOwner,
      commandOwner,
      waitOwner,
      cueOwner,
    ]);
    expect(deriveRequiredControlBindingOwnerIds(program)).not.toContain(revealTarget);
  });

  it("rejects a mismatched Surface program before waiting for its owners", () => {
    const prepared = prepareSlideshowDocument(tabsSlideshowDocument());
    const mismatchedProgram: SlideshowSurfaceRuntimeProgram = {
      presentation: {
        autoAdvance: false,
        timeline: {
          surfaceId: SECOND_SURFACE_ID,
          durationMs: 100,
          cues: [
            {
              id: "mismatched-owner-cue",
              atMs: 0,
              command: {
                kind: "target-command",
                ownerId: NEVER_MOUNTED_OWNER_ID,
                targetId: OVERVIEW_SECTION_ID,
                type: "select",
              },
            },
          ],
          waits: [],
        },
      },
    };

    expect(() =>
      renderTest(
        <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
          <SlideshowPlayer
            preparedDocument={prepared.preparedDocument}
            structure={prepared.structure}
            surfaceRuntimeProgramSource={(surfaceId) =>
              surfaceId === FIRST_SURFACE_ID ? mismatchedProgram : undefined
            }
          />
        </CourseThemeProvider>,
      ),
    ).toThrow(
      'Slideshow Presentation Timeline Surface "surfaceCtrl2" does not match active Surface "surfaceCtrl1".',
    );
  });

  it("disposes a new composition when its Presentation guard rejects Session identity", async () => {
    const presentation = createControllablePresentationSession(
      Object.freeze({ ...presentationSnapshot("completed"), surfaceId: SECOND_SURFACE_ID }),
    );
    slideshowRuntimeTestProbe.createComposition = (input) =>
      testComposition(
        input as CreateSlideshowSurfaceRuntimeCompositionInput,
        presentation.session,
      );
    const prepared = prepareSlideshowDocument(tabsSlideshowDocument());

    renderTest(
      <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
        <SlideshowPlayer
          preparedDocument={prepared.preparedDocument}
          structure={prepared.structure}
          surfaceRuntimeProgramSource={(surfaceId) =>
            surfaceId === FIRST_SURFACE_ID
              ? configuredPresentationProgram(FIRST_SURFACE_ID)
              : undefined
          }
        />
      </CourseThemeProvider>,
    );

    await waitFor(() => expect(presentation.dispose).toHaveBeenCalledOnce());
    expect(presentation.listenerCount).toBe(0);
  });

  it.each([
    {
      name: "awaiting start",
      snapshot: presentationSnapshot("awaiting-start"),
      expectedAction: "play",
      expectedContentInteraction: "inert",
    },
    {
      name: "playing",
      snapshot: presentationSnapshot("playing"),
      expectedAction: "disabled",
      expectedContentInteraction: "inert",
    },
    {
      name: "paused",
      snapshot: presentationSnapshot("paused"),
      expectedAction: "disabled",
      expectedContentInteraction: "inert",
    },
    {
      name: "manual hold",
      snapshot: presentationSnapshot("held", {
        kind: "manual",
        waitId: "manual-hold" as PresentationWaitId,
      }),
      expectedAction: "advance",
      expectedContentInteraction: "inert",
    },
    {
      name: "learner waiting",
      snapshot: presentationSnapshot("held", {
        kind: "learner",
        waitId: "learner-waiting" as PresentationWaitId,
        status: "waiting",
      }),
      expectedAction: "disabled",
      gateObservation: "awaiting-satisfaction",
      expectedContentInteraction: "enabled",
    },
    {
      name: "learner waiting before gate registration",
      snapshot: presentationSnapshot("held", {
        kind: "learner",
        waitId: "learner-before-gate" as PresentationWaitId,
        status: "waiting",
      }),
      expectedAction: "disabled",
      expectedContentInteraction: "inert",
    },
    {
      name: "learner satisfaction observed while its turn settles",
      snapshot: presentationSnapshot("held", {
        kind: "learner",
        waitId: "learner-observed" as PresentationWaitId,
        status: "waiting",
      }),
      expectedAction: "disabled",
      gateObservation: "satisfaction-observed",
      expectedContentInteraction: "inert",
    },
    {
      name: "learner ready",
      snapshot: presentationSnapshot("held", {
        kind: "learner",
        waitId: "learner-ready" as PresentationWaitId,
        status: "ready",
      }),
      expectedAction: "advance",
      expectedContentInteraction: "inert",
    },
    {
      name: "completed",
      snapshot: presentationSnapshot("completed"),
      expectedAction: "navigate",
      expectedContentInteraction: "inert",
    },
    {
      name: "stopped",
      snapshot: presentationSnapshot("stopped"),
      expectedAction: "disabled",
      expectedContentInteraction: "inert",
    },
  ] as const)("routes Next from $name without bypassing the derived mode", async (testCase) => {
    const presentation = createControllablePresentationSession(testCase.snapshot);
    const learner = createControllableLearnerRuntime(
      "gateObservation" in testCase ? testCase.gateObservation : "inactive",
    );
    slideshowRuntimeTestProbe.createComposition = (input) =>
      testComposition(
        input as CreateSlideshowSurfaceRuntimeCompositionInput,
        presentation.session,
        learner.runtime,
      );
    const prepared = prepareSlideshowDocument(tabsSlideshowDocument());
    const surfaceRuntimeProgramSource: SlideshowSurfaceRuntimeProgramSource = (surfaceId) =>
      surfaceId === FIRST_SURFACE_ID ? configuredPresentationProgram(surfaceId) : undefined;

    renderTest(
      <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
        <SlideshowPlayer
          preparedDocument={prepared.preparedDocument}
          structure={prepared.structure}
          surfaceRuntimeProgramSource={surfaceRuntimeProgramSource}
        />
      </CourseThemeProvider>,
    );

    const next = await screen.findByRole("button", { name: "Next slide" });
    const canvas = document.querySelector(".sc-slideshow-player__canvas");
    await waitFor(() =>
      expect(canvas).toHaveAttribute(
        "data-content-interaction",
        testCase.expectedContentInteraction,
      ),
    );
    if (testCase.expectedContentInteraction === "inert") {
      expect(canvas).toHaveAttribute("inert");
    } else {
      expect(canvas).not.toHaveAttribute("inert");
    }
    if (testCase.expectedAction === "disabled") {
      await waitFor(() => expect(next).toBeDisabled());
    } else {
      await waitFor(() => expect(next).not.toBeDisabled());
    }
    expect(presentation.play).not.toHaveBeenCalled();
    expect(presentation.advance).not.toHaveBeenCalled();

    fireEvent.click(next);

    switch (testCase.expectedAction) {
      case "play":
        expect(presentation.play).toHaveBeenCalledOnce();
        expect(presentation.advance).not.toHaveBeenCalled();
        expect(screen.getByRole("status")).toHaveTextContent("1 of 2");
        break;
      case "advance":
        expect(presentation.advance).toHaveBeenCalledOnce();
        expect(presentation.play).not.toHaveBeenCalled();
        expect(screen.getByRole("status")).toHaveTextContent("1 of 2");
        break;
      case "navigate":
        expect(presentation.play).not.toHaveBeenCalled();
        expect(presentation.advance).not.toHaveBeenCalled();
        await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("2 of 2"));
        break;
      case "disabled":
        expect(presentation.play).not.toHaveBeenCalled();
        expect(presentation.advance).not.toHaveBeenCalled();
        expect(screen.getByRole("status")).toHaveTextContent("1 of 2");
        break;
    }
  });

  it("closes mounted content when the active learner gate observes satisfaction", async () => {
    const presentation = createControllablePresentationSession(
      presentationSnapshot("held", {
        kind: "learner",
        waitId: "observed-wait" as PresentationWaitId,
        status: "waiting",
      }),
    );
    const learner = createControllableLearnerRuntime("awaiting-satisfaction");
    slideshowRuntimeTestProbe.createComposition = (input) =>
      testComposition(
        input as CreateSlideshowSurfaceRuntimeCompositionInput,
        presentation.session,
        learner.runtime,
      );
    const prepared = prepareSlideshowDocument(tabsSlideshowDocument());

    renderTest(
      <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
        <SlideshowPlayer
          preparedDocument={prepared.preparedDocument}
          structure={prepared.structure}
          surfaceRuntimeProgramSource={(surfaceId) =>
            surfaceId === FIRST_SURFACE_ID
              ? configuredPresentationProgram(FIRST_SURFACE_ID)
              : undefined
          }
        />
      </CourseThemeProvider>,
    );

    const canvas = await waitFor(() => {
      const candidate = document.querySelector(".sc-slideshow-player__canvas");
      expect(candidate).toHaveAttribute("data-content-interaction", "enabled");
      return candidate;
    });
    const contentOwner = document.querySelector<HTMLElement>(
      '[data-slideshow-overlay-owner="content"]',
    );
    const chromeOwner = document.querySelector<HTMLElement>(
      '[data-slideshow-overlay-owner="chrome"]',
    );
    expect(canvas).not.toHaveAttribute("inert");
    expect(contentOwner).not.toHaveAttribute("inert");
    expect(chromeOwner).not.toHaveAttribute("inert");

    act(() => learner.setSnapshot("satisfaction-observed"));

    await waitFor(() => expect(canvas).toHaveAttribute("inert"));
    expect(canvas).toHaveAttribute("data-content-interaction", "inert");
    expect(contentOwner).toHaveAttribute("inert");
    expect(chromeOwner).not.toHaveAttribute("inert");
  });

  it("opens only for a fresh gate registration after backward Presentation passage", async () => {
    const waitId = "reentered-wait" as PresentationWaitId;
    const presentation = createControllablePresentationSession(
      presentationSnapshot("held", { kind: "learner", waitId, status: "waiting" }),
    );
    const learner = createControllableLearnerRuntime("awaiting-satisfaction");
    slideshowRuntimeTestProbe.createComposition = (input) =>
      testComposition(
        input as CreateSlideshowSurfaceRuntimeCompositionInput,
        presentation.session,
        learner.runtime,
      );
    const prepared = prepareSlideshowDocument(tabsSlideshowDocument());
    const { unmount } = renderTest(
      <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
        <SlideshowPlayer
          preparedDocument={prepared.preparedDocument}
          structure={prepared.structure}
          surfaceRuntimeProgramSource={(surfaceId) =>
            surfaceId === FIRST_SURFACE_ID
              ? configuredPresentationProgram(FIRST_SURFACE_ID)
              : undefined
          }
        />
      </CourseThemeProvider>,
    );
    const canvas = document.querySelector(".sc-slideshow-player__canvas");

    await waitFor(() => expect(canvas).not.toHaveAttribute("inert"));
    expect(learner.listenerCount).toBe(1);

    act(() => learner.setSnapshot("satisfaction-observed"));
    await waitFor(() => expect(canvas).toHaveAttribute("inert"));

    act(() => {
      learner.setSnapshot("inactive");
      presentation.setSnapshot(presentationSnapshot("paused"));
    });
    expect(canvas).toHaveAttribute("inert");

    act(() =>
      presentation.setSnapshot(
        presentationSnapshot("held", { kind: "learner", waitId, status: "waiting" }),
      ),
    );
    expect(canvas).toHaveAttribute("inert");

    act(() => learner.setSnapshot("awaiting-satisfaction"));
    await waitFor(() => expect(canvas).not.toHaveAttribute("inert"));

    act(() => {
      learner.setSnapshot("inactive");
      presentation.setSnapshot(presentationSnapshot("completed"));
    });
    await waitFor(() => expect(canvas).toHaveAttribute("inert"));

    act(() => presentation.setSnapshot(presentationSnapshot("stopped")));
    expect(canvas).toHaveAttribute("inert");

    unmount();
    expect(learner.listenerCount).toBe(0);
  });

  it("keeps configured Next pending until the exact owner readiness request completes", async () => {
    const cancelReadiness = vi.fn();
    const notifyWhenOwnersMounted = vi.fn(
      (_ownerIds: readonly EmbeddedNodeId[], _listener: () => void) => cancelReadiness,
    );
    const createComposition = vi.fn();
    slideshowRuntimeTestProbe.getControlBindings = () => ({
      get: vi.fn(),
      register: vi.fn(),
      notifyWhenOwnersMounted,
    });
    slideshowRuntimeTestProbe.createComposition = createComposition;
    const prepared = prepareSlideshowDocument(tabsSlideshowDocument());
    const configuredProgram: SlideshowSurfaceRuntimeProgram = {
      presentation: {
        autoAdvance: false,
        timeline: {
          surfaceId: FIRST_SURFACE_ID,
          durationMs: 100,
          waits: [],
          cues: [
            {
              id: "pending-owner-cue",
              atMs: 0,
              command: {
                kind: "target-command",
                ownerId: TABS_OWNER_ID,
                targetId: OVERVIEW_SECTION_ID,
                type: "select",
              },
            },
          ],
        },
      },
    };
    const { unmount } = renderTest(
      <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
        <SlideshowPlayer
          preparedDocument={prepared.preparedDocument}
          structure={prepared.structure}
          surfaceRuntimeProgramSource={(surfaceId) =>
            surfaceId === FIRST_SURFACE_ID ? configuredProgram : undefined
          }
        />
      </CourseThemeProvider>,
    );

    const next = await screen.findByRole("button", { name: "Next slide" });
    await waitFor(() => expect(notifyWhenOwnersMounted).toHaveBeenCalledOnce());
    expect(notifyWhenOwnersMounted.mock.calls[0]?.[0]).toEqual([TABS_OWNER_ID]);
    expect(next).toBeDisabled();
    expect(document.querySelector(".sc-slideshow-player__canvas")).toHaveAttribute("inert");

    fireEvent.click(next);

    expect(screen.getByRole("status")).toHaveTextContent("1 of 2");
    expect(createComposition).not.toHaveBeenCalled();
    unmount();
    expect(cancelReadiness).toHaveBeenCalledOnce();
  });

  it("keeps an expected advance refusal at the current checkpoint", async () => {
    const presentation = createControllablePresentationSession(
      presentationSnapshot("held", {
        kind: "manual",
        waitId: "refused-advance" as PresentationWaitId,
      }),
    );
    presentation.advance.mockImplementation(() =>
      Result.err({ reason: "not-at-checkpoint", phase: "held" }),
    );
    slideshowRuntimeTestProbe.createComposition = (input) =>
      testComposition(
        input as CreateSlideshowSurfaceRuntimeCompositionInput,
        presentation.session,
      );
    const prepared = prepareSlideshowDocument(tabsSlideshowDocument());

    renderTest(
      <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
        <SlideshowPlayer
          preparedDocument={prepared.preparedDocument}
          structure={prepared.structure}
          surfaceRuntimeProgramSource={(surfaceId) =>
            surfaceId === FIRST_SURFACE_ID
              ? configuredPresentationProgram(surfaceId)
              : undefined
          }
        />
      </CourseThemeProvider>,
    );

    const next = await screen.findByRole("button", { name: "Next slide" });
    await waitFor(() => expect(next).not.toBeDisabled());

    await userEvent.click(next);

    expect(presentation.advance).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent("1 of 2");
    expect(next).not.toBeDisabled();
  });

  it("runs learner-only Tabs rules while Next remains ordinary navigation", async () => {
    const user = userEvent.setup();
    const learnerInteractions = createTabsLearnerWaitProgram().learnerInteractions;
    if (!learnerInteractions) throw new Error("Expected the Tabs learner program.");
    const learnerOnlyProgram: SlideshowSurfaceRuntimeProgram = { learnerInteractions };
    const prepared = prepareSlideshowDocument(tabsSlideshowDocument());

    renderTest(
      <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
        <SlideshowPlayer
          preparedDocument={prepared.preparedDocument}
          structure={prepared.structure}
          surfaceRuntimeProgramSource={(surfaceId) =>
            surfaceId === FIRST_SURFACE_ID ? learnerOnlyProgram : undefined
          }
        />
      </CourseThemeProvider>,
    );

    const next = await screen.findByRole("button", { name: "Next slide" });
    await waitFor(() => expect(next).not.toBeDisabled());
    expect(document.querySelector(".sc-slideshow-player__canvas")).not.toHaveAttribute("inert");
    await user.click(screen.getByRole("tab", { name: "Practice" }));
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    expect(next).not.toBeDisabled();

    await user.click(next);

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("2 of 2"));
  });

  it("navigates a configured Surface with no Presentation", async () => {
    slideshowRuntimeTestProbe.createComposition = (input) =>
      testComposition(input as CreateSlideshowSurfaceRuntimeCompositionInput);
    const prepared = prepareSlideshowDocument(tabsSlideshowDocument());

    renderTest(
      <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
        <SlideshowPlayer
          preparedDocument={prepared.preparedDocument}
          structure={prepared.structure}
          surfaceRuntimeProgramSource={(surfaceId) =>
            surfaceId === FIRST_SURFACE_ID ? Object.freeze({}) : undefined
          }
        />
      </CourseThemeProvider>,
    );

    const next = await screen.findByRole("button", { name: "Next slide" });
    await waitFor(() => expect(next).not.toBeDisabled());
    expect(document.querySelector(".sc-slideshow-player__canvas")).not.toHaveAttribute("inert");
    await userEvent.click(next);

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("2 of 2"));
  });

  it.each(["no source", "no matching record"] as const)(
    "preserves ordinary navigation with $0",
    async (configuration) => {
      const createComposition = vi.fn();
      slideshowRuntimeTestProbe.createComposition = createComposition;
      const prepared = prepareSlideshowDocument(tabsSlideshowDocument());

      renderTest(
        <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
          <SlideshowPlayer
            preparedDocument={prepared.preparedDocument}
            structure={prepared.structure}
            {...(configuration === "no matching record"
              ? { surfaceRuntimeProgramSource: () => undefined }
              : {})}
          />
        </CourseThemeProvider>,
      );

      const next = await screen.findByRole("button", { name: "Next slide" });
      expect(next).not.toBeDisabled();
      await userEvent.click(next);

      await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("2 of 2"));
      expect(createComposition).not.toHaveBeenCalled();
    },
  );

  it("disposes the outgoing Surface owner before installing its replacement", async () => {
    const user = userEvent.setup();
    const lifecycle = createCompositionLifecycleProbe();
    slideshowRuntimeTestProbe.createComposition = lifecycle.createComposition;
    const prepared = prepareSlideshowDocument(tabsSlideshowDocument());
    const programs = new Map<SurfaceId, SlideshowSurfaceRuntimeProgram>([
      [FIRST_SURFACE_ID, Object.freeze({})],
      [SECOND_SURFACE_ID, Object.freeze({})],
    ]);
    const { unmount } = renderTest(
      <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
        <SlideshowPlayer
          preparedDocument={prepared.preparedDocument}
          structure={prepared.structure}
          surfaceRuntimeProgramSource={(surfaceId) => programs.get(surfaceId)}
        />
      </CourseThemeProvider>,
    );

    await waitFor(() => expect(lifecycle.events).toEqual([`create:${FIRST_SURFACE_ID}`]));
    expect(lifecycle.learners[0]?.listenerCount).toBe(1);
    await user.click(screen.getByRole("button", { name: "Next slide" }));

    await waitFor(() =>
      expect(lifecycle.events).toEqual([
        `create:${FIRST_SURFACE_ID}`,
        `dispose:${FIRST_SURFACE_ID}`,
        `create:${SECOND_SURFACE_ID}`,
      ]),
    );
    expect(lifecycle.maximumActiveOwners).toBe(1);
    expect(lifecycle.activeOwners).toBe(1);
    expect(lifecycle.learners[0]?.listenerCount).toBe(0);
    expect(lifecycle.learners[1]?.listenerCount).toBe(1);

    unmount();

    expect(lifecycle.events).toEqual([
      `create:${FIRST_SURFACE_ID}`,
      `dispose:${FIRST_SURFACE_ID}`,
      `create:${SECOND_SURFACE_ID}`,
      `dispose:${SECOND_SURFACE_ID}`,
    ]);
    expect(lifecycle.activeOwners).toBe(0);
    expect(lifecycle.learners[1]?.listenerCount).toBe(0);
  });

  it("detaches outgoing Presentation snapshots before the incoming Surface is authoritative", async () => {
    const outgoingPresentation = createControllablePresentationSession(
      presentationSnapshot("completed"),
    );
    const outgoingLearner = createControllableLearnerRuntime("inactive");
    slideshowRuntimeTestProbe.createComposition = (rawInput) => {
      const input = rawInput as CreateSlideshowSurfaceRuntimeCompositionInput;
      return testComposition(
        input,
        input.surfaceId === FIRST_SURFACE_ID ? outgoingPresentation.session : undefined,
        input.surfaceId === FIRST_SURFACE_ID
          ? outgoingLearner.runtime
          : inactiveLearnerRuntime(),
      );
    };
    const prepared = prepareSlideshowDocument(tabsSlideshowDocument());
    const programs = new Map<SurfaceId, SlideshowSurfaceRuntimeProgram>([
      [FIRST_SURFACE_ID, configuredPresentationProgram(FIRST_SURFACE_ID)],
      [SECOND_SURFACE_ID, Object.freeze({})],
    ]);
    renderTest(
      <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
        <SlideshowPlayer
          preparedDocument={prepared.preparedDocument}
          structure={prepared.structure}
          surfaceRuntimeProgramSource={(surfaceId) => programs.get(surfaceId)}
        />
      </CourseThemeProvider>,
    );

    const next = await screen.findByRole("button", { name: "Next slide" });
    await waitFor(() => expect(outgoingPresentation.listenerCount).toBe(2));
    await waitFor(() => expect(outgoingLearner.listenerCount).toBe(1));
    const staleGuardListener = outgoingPresentation.capturedListeners[0];
    const stalePresentationListener = outgoingPresentation.capturedListeners[1];
    const staleGateListener = outgoingLearner.capturedListeners[0];
    if (!staleGuardListener) throw new Error("Expected the outgoing guard subscription.");
    if (!stalePresentationListener || !staleGateListener) {
      throw new Error("Expected outgoing Presentation and gate projection subscriptions.");
    }
    await userEvent.click(next);

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("2 of 2"));
    await waitFor(() => expect(outgoingPresentation.listenerCount).toBe(0));
    expect(outgoingLearner.listenerCount).toBe(0);
    expect(outgoingPresentation.dispose).toHaveBeenCalledOnce();

    act(() => outgoingPresentation.setSnapshot(presentationSnapshot("awaiting-start")));

    expect(screen.getByRole("status")).toHaveTextContent("2 of 2");

    outgoingPresentation.replaceSnapshot(
      presentationWaitingSnapshot(FIRST_SURFACE_ID, "stale-wait01" as PresentationWaitId),
    );
    act(() => staleGuardListener());
    act(() => {
      outgoingLearner.replaceSnapshot("satisfaction-observed");
      stalePresentationListener();
      staleGateListener();
    });

    expect(surfaceExitEnvironment().getSnapshot()).toEqual({
      status: "allowed",
      surfaceId: SECOND_SURFACE_ID,
      blockers: [],
    });
    expect(document.querySelector(".sc-slideshow-player__canvas")).not.toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "Previous slide" })).not.toBeDisabled();
  });

  it("replaces the Surface owner when the renderer creates a new Editor", async () => {
    const presentations: ReturnType<typeof createControllablePresentationSession>[] = [];
    const lifecycle = createCompositionLifecycleProbe(() => {
      const presentation = createControllablePresentationSession(
        presentationSnapshot("completed"),
      );
      presentations.push(presentation);
      return presentation.session;
    });
    slideshowRuntimeTestProbe.createComposition = lifecycle.createComposition;
    const firstPrepared = prepareSlideshowDocument(tabsSlideshowDocument());
    const secondPrepared = prepareSlideshowDocument(tabsSlideshowDocument());
    const program = configuredPresentationProgram(FIRST_SURFACE_ID);
    const onRendererReady = vi.fn();
    const source: SlideshowSurfaceRuntimeProgramSource = (surfaceId) =>
      surfaceId === FIRST_SURFACE_ID ? program : undefined;
    const { rerender, unmount } = renderTest(
      <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
        <SlideshowPlayer
          preparedDocument={firstPrepared.preparedDocument}
          structure={firstPrepared.structure}
          surfaceRuntimeProgramSource={source}
          onRendererReady={onRendererReady}
        />
      </CourseThemeProvider>,
    );
    await waitFor(() => expect(onRendererReady).toHaveBeenCalledOnce());
    await waitFor(() => expect(lifecycle.events).toEqual([`create:${FIRST_SURFACE_ID}`]));
    await waitFor(() => expect(presentations[0]?.listenerCount).toBe(2));
    expect(lifecycle.learners[0]?.listenerCount).toBe(1);

    rerender(
      <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
        <SlideshowPlayer
          preparedDocument={secondPrepared.preparedDocument}
          structure={secondPrepared.structure}
          surfaceRuntimeProgramSource={source}
          onRendererReady={onRendererReady}
        />
      </CourseThemeProvider>,
    );

    await waitFor(() => expect(onRendererReady).toHaveBeenCalledTimes(2));
    expect(onRendererReady.mock.calls[0]?.[0]).not.toBe(onRendererReady.mock.calls[1]?.[0]);
    await waitFor(() =>
      expect(lifecycle.events).toEqual([
        `create:${FIRST_SURFACE_ID}`,
        `dispose:${FIRST_SURFACE_ID}`,
        `create:${FIRST_SURFACE_ID}`,
      ]),
    );
    expect(lifecycle.maximumActiveOwners).toBe(1);
    expect(presentations[0]?.listenerCount).toBe(0);
    expect(presentations[0]?.dispose).toHaveBeenCalledOnce();
    expect(presentations.at(-1)?.listenerCount).toBe(2);
    expect(lifecycle.learners[0]?.listenerCount).toBe(0);
    expect(lifecycle.learners.at(-1)?.listenerCount).toBe(1);

    unmount();
    expect(lifecycle.activeOwners).toBe(0);
    expect(presentations.at(-1)?.listenerCount).toBe(0);
    expect(presentations.at(-1)?.dispose).toHaveBeenCalledOnce();
    expect(lifecycle.learners.at(-1)?.listenerCount).toBe(0);
  });

  it("ignores cancelled readiness from a replaced Editor", async () => {
    const readinessRequests: Array<{
      readonly listener: () => void;
      readonly cancel: ReturnType<typeof vi.fn>;
    }> = [];
    slideshowRuntimeTestProbe.getControlBindings = () => ({
      get: vi.fn(),
      register: vi.fn(),
      notifyWhenOwnersMounted: vi.fn((_ownerIds: readonly EmbeddedNodeId[], listener: () => void) => {
        const cancel = vi.fn();
        readinessRequests.push({ listener, cancel });
        return cancel;
      }),
    });
    const createComposition = vi.fn((input: unknown) =>
      testComposition(input as CreateSlideshowSurfaceRuntimeCompositionInput),
    );
    slideshowRuntimeTestProbe.createComposition = createComposition;
    const firstPrepared = prepareSlideshowDocument(tabsSlideshowDocument());
    const secondPrepared = prepareSlideshowDocument(tabsSlideshowDocument());
    const pendingProgram = presentationProgramWithOwner(FIRST_SURFACE_ID, TABS_OWNER_ID);
    const source: SlideshowSurfaceRuntimeProgramSource = (surfaceId) =>
      surfaceId === FIRST_SURFACE_ID ? pendingProgram : undefined;
    const { rerender, unmount } = renderTest(
      <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
        <SlideshowPlayer
          preparedDocument={firstPrepared.preparedDocument}
          structure={firstPrepared.structure}
          surfaceRuntimeProgramSource={source}
        />
      </CourseThemeProvider>,
    );
    await waitFor(() => expect(readinessRequests).toHaveLength(1));

    rerender(
      <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
        <SlideshowPlayer
          preparedDocument={secondPrepared.preparedDocument}
          structure={secondPrepared.structure}
          surfaceRuntimeProgramSource={source}
        />
      </CourseThemeProvider>,
    );

    await waitFor(() => expect(readinessRequests).toHaveLength(2));
    expect(readinessRequests[0]?.cancel).toHaveBeenCalledOnce();
    act(() => readinessRequests[0]?.listener());
    expect(createComposition).not.toHaveBeenCalled();

    act(() => readinessRequests[1]?.listener());
    await waitFor(() => expect(createComposition).toHaveBeenCalledOnce());

    unmount();
    expect(readinessRequests[1]?.cancel).toHaveBeenCalledOnce();
  });

  it("retains one active Surface owner across a Strict Mode-style effect reconnect", async () => {
    const presentations: ReturnType<typeof createControllablePresentationSession>[] = [];
    const lifecycle = createCompositionLifecycleProbe(() => {
      const presentation = createControllablePresentationSession(
        presentationSnapshot("completed"),
      );
      presentations.push(presentation);
      return presentation.session;
    });
    slideshowRuntimeTestProbe.createComposition = lifecycle.createComposition;
    const prepared = prepareSlideshowDocument(tabsSlideshowDocument());
    const program = configuredPresentationProgram(FIRST_SURFACE_ID);
    const source: SlideshowSurfaceRuntimeProgramSource = (surfaceId) =>
      surfaceId === FIRST_SURFACE_ID ? program : undefined;
    const { rerender, unmount } = renderTest(
      <StrictMode>
        <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
          <SlideshowPlayer
            preparedDocument={prepared.preparedDocument}
            structure={prepared.structure}
            surfaceRuntimeProgramSource={source}
          />
        </CourseThemeProvider>
      </StrictMode>,
    );
    await waitFor(() => expect(lifecycle.events).toEqual([`create:${FIRST_SURFACE_ID}`]));
    await waitFor(() => expect(presentations[0]?.listenerCount).toBe(2));
    expect(lifecycle.learners[0]?.listenerCount).toBe(1);
    const reprojectedStructure = projectCourseStructure(prepared.preparedDocument.content);
    if (!reprojectedStructure || reprojectedStructure.mode !== "slideshow") {
      throw new Error("Expected a reprojected Slideshow structure.");
    }

    rerender(
      <StrictMode>
        <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
          <SlideshowPlayer
            preparedDocument={prepared.preparedDocument}
            structure={reprojectedStructure}
            surfaceRuntimeProgramSource={source}
          />
        </CourseThemeProvider>
      </StrictMode>,
    );

    await waitFor(() => expect(lifecycle.events.length).toBeGreaterThanOrEqual(3));
    expect(lifecycle.events.slice(0, 3)).toEqual([
      `create:${FIRST_SURFACE_ID}`,
      `dispose:${FIRST_SURFACE_ID}`,
      `create:${FIRST_SURFACE_ID}`,
    ]);
    expect(lifecycle.maximumActiveOwners).toBe(1);
    expect(lifecycle.activeOwners).toBe(1);
    expect(presentations[0]?.listenerCount).toBe(0);
    expect(presentations[0]?.dispose).toHaveBeenCalledOnce();
    expect(presentations.at(-1)?.listenerCount).toBe(2);
    expect(lifecycle.learners[0]?.listenerCount).toBe(0);
    expect(lifecycle.learners.at(-1)?.listenerCount).toBe(1);

    unmount();

    expect(lifecycle.activeOwners).toBe(0);
    expect(lifecycle.disposals).toBe(lifecycle.creations);
    expect(presentations.at(-1)?.listenerCount).toBe(0);
    expect(presentations.at(-1)?.dispose).toHaveBeenCalledOnce();
    expect(lifecycle.learners.at(-1)?.listenerCount).toBe(0);
  });

  it("blocks Previous and Course Section navigation until the active learner Wait passes", async () => {
    const user = userEvent.setup();
    const prepared = prepareSlideshowDocument(sectionedTabsSlideshowDocument());
    const programs = new Map<SurfaceId, SlideshowSurfaceRuntimeProgram>([
      [FIRST_SURFACE_ID, createTabsLearnerWaitProgram()],
    ]);
    renderTest(
      <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
        <SlideshowPlayer
          preparedDocument={prepared.preparedDocument}
          structure={prepared.structure}
          surfaceRuntimeProgramSource={(surfaceId) => programs.get(surfaceId)}
        />
      </CourseThemeProvider>,
    );

    const next = await screen.findByRole("button", { name: "Next slide" });
    await waitFor(() => expect(next).not.toBeDisabled());
    await user.click(next);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("2 of 2"));
    await waitFor(() => expect(next).not.toBeDisabled());
    await user.click(next);
    await waitFor(() => expect(next).toBeDisabled());
    expect(screen.getByRole("status")).toHaveTextContent("2 of 2");

    const courseSectionButton = screen.getByRole("button", {
      name: "Practice, Course Section 2 of 2",
    });
    const previous = screen.getByRole("button", { name: "Previous slide" });
    expect(courseSectionButton).toBeDisabled();
    expect(previous).toBeDisabled();
    expect(
      screen.getByText("Complete the required interaction before moving to another slide."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Practice" }));

    await waitFor(() => expect(courseSectionButton).not.toBeDisabled());
    expect(previous).not.toBeDisabled();
    expect(
      screen.queryByText("Complete the required interaction before moving to another slide."),
    ).toBeNull();

    await user.click(previous);

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("1 of 2"));
  });

  it("lets the satisfying authored Tabs branch replace the outgoing Presentation", async () => {
    const user = userEvent.setup();
    const onActiveSurfaceChange = vi.fn();
    const prepared = prepareSlideshowDocument(tabsSlideshowDocument());
    renderTest(
      <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
        <SlideshowPlayer
          preparedDocument={prepared.preparedDocument}
          structure={prepared.structure}
          surfaceRuntimeProgramSource={(surfaceId) =>
            surfaceId === FIRST_SURFACE_ID
              ? createTabsLearnerNavigationProgram("selected")
              : undefined
          }
          onActiveSurfaceChange={onActiveSurfaceChange}
        />
      </CourseThemeProvider>,
    );

    const next = await screen.findByRole("button", { name: "Next slide" });
    await waitFor(() => expect(next).not.toBeDisabled());
    await user.click(next);
    await waitFor(() =>
      expect(
        screen.getByText("Complete the required interaction before moving to another slide."),
      ).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("tab", { name: "Practice" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("2 of 2"));
    expect(onActiveSurfaceChange).toHaveBeenLastCalledWith(SECOND_SURFACE_ID);
    expect(surfaceExitEnvironment().getSnapshot()).toEqual({
      status: "allowed",
      surfaceId: SECOND_SURFACE_ID,
      blockers: [],
    });
    expect(
      screen.queryByText("Complete the required interaction before moving to another slide."),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Previous slide" })).not.toBeDisabled();
  });

  it("keeps unrelated authored navigation blocked by the active learner Wait", async () => {
    const user = userEvent.setup();
    const prepared = prepareSlideshowDocument(tabsSlideshowDocument());
    renderTest(
      <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
        <SlideshowPlayer
          preparedDocument={prepared.preparedDocument}
          structure={prepared.structure}
          surfaceRuntimeProgramSource={(surfaceId) =>
            surfaceId === FIRST_SURFACE_ID
              ? createTabsLearnerNavigationProgram("expanded")
              : undefined
          }
        />
      </CourseThemeProvider>,
    );

    const next = await screen.findByRole("button", { name: "Next slide" });
    await waitFor(() => expect(next).not.toBeDisabled());
    await user.click(next);
    await waitFor(() => expect(next).toBeDisabled());

    await user.click(screen.getByRole("tab", { name: "Practice" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("1 of 2"));
    expect(next).toBeDisabled();
    expect(
      screen.getByText("Complete the required interaction before moving to another slide."),
    ).toBeInTheDocument();
  });

  it("keeps an independent blocker authoritative after a satisfying authored branch", async () => {
    const user = userEvent.setup();
    const prepared = prepareSlideshowDocument(tabsSlideshowDocument());
    renderTest(
      <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
        <SlideshowPlayer
          preparedDocument={prepared.preparedDocument}
          structure={prepared.structure}
          surfaceRuntimeProgramSource={(surfaceId) =>
            surfaceId === FIRST_SURFACE_ID
              ? createTabsLearnerNavigationProgram("selected")
              : undefined
          }
        />
      </CourseThemeProvider>,
    );
    await waitFor(() => expect(surfaceExitTestProbe.environment).toBeDefined());
    const unregisterIndependentBlocker = surfaceExitEnvironment().registerGuard({
      ownerId: "quiz-test",
      surfaceId: FIRST_SURFACE_ID,
      getSnapshot: () => ({
        status: "blocked",
        blocker: {
          reason: "quiz-not-complete",
          ownerId: "quiz-test",
          surfaceId: FIRST_SURFACE_ID,
          attemptStatus: "in_progress",
        },
      }),
      subscribe: () => () => undefined,
    });

    const next = await screen.findByRole("button", { name: "Next slide" });
    await waitFor(() => expect(next).not.toBeDisabled());
    await user.click(next);
    await waitFor(() =>
      expect(
        screen.getByText("Complete the required interactions before moving to another slide."),
      ).toBeInTheDocument(),
    );
    expect(next).toBeDisabled();

    await user.click(screen.getByRole("tab", { name: "Practice" }));

    await waitFor(() => expect(next).not.toBeDisabled());
    expect(screen.getByRole("status")).toHaveTextContent("1 of 2");
    expect(screen.getByText("Complete this quiz before moving to another slide.")).toBeInTheDocument();
    expect(surfaceExitEnvironment().getSnapshot()).toMatchObject({
      status: "blocked",
      surfaceId: FIRST_SURFACE_ID,
      blockers: [{ reason: "quiz-not-complete", ownerId: "quiz-test" }],
    });

    unregisterIndependentBlocker();
  });

  it("holds a time-zero Presentation for one committed Tabs learner turn before navigation", async () => {
    const user = userEvent.setup();
    const readyEditors: TiptapEditor[] = [];
    const program = createTabsLearnerWaitProgram();
    const surfaceRuntimeProgramSource: SlideshowSurfaceRuntimeProgramSource = vi.fn((surfaceId) =>
      surfaceId === FIRST_SURFACE_ID ? program : undefined,
    );
    const prepared = prepareSlideshowDocument(tabsSlideshowDocument());

    renderTest(
      <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
        <SlideshowPlayer
          artifactId="artifact-tabs-learner-wait"
          preparedDocument={prepared.preparedDocument}
          structure={prepared.structure}
          surfaceRuntimeProgramSource={surfaceRuntimeProgramSource}
          onRendererReady={(editor) => readyEditors.push(editor)}
        />
      </CourseThemeProvider>,
    );

    await waitFor(() => expect(readyEditors).toHaveLength(1));
    const next = screen.getByRole("button", { name: "Next slide" });
    await waitFor(() => expect(next).not.toBeDisabled());
    const canvas = document.querySelector(".sc-slideshow-player__canvas");
    expect(canvas).toHaveAttribute("inert");
    expect(screen.getByRole("status")).toHaveTextContent("1 of 2");

    await user.click(next);

    await waitFor(() => expect(next).toBeDisabled());
    expect(canvas).not.toHaveAttribute("inert");
    expect(screen.getByRole("status")).toHaveTextContent("1 of 2");
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    const overview = screen.getByRole("tab", { name: "Overview" });
    const practice = screen.getByRole("tab", { name: "Practice" });
    const selectionsWhenNextBecameReady: Array<{
      readonly overview: string | null;
      readonly practice: string | null;
    }> = [];
    const removeNextAttribute = next.removeAttribute.bind(next);
    next.removeAttribute = (name) => {
      if (name === "disabled") {
        selectionsWhenNextBecameReady.push({
          overview: overview.getAttribute("aria-selected"),
          practice: practice.getAttribute("aria-selected"),
        });
      }
      removeNextAttribute(name);
    };

    await user.click(practice);

    await waitFor(() => {
      expect(overview).toHaveAttribute("aria-selected", "true");
      expect(next).not.toBeDisabled();
      expect(canvas).toHaveAttribute("inert");
      expect(document.activeElement).toBe(screen.getByTestId("slideshow-controls"));
    });
    Reflect.deleteProperty(next, "removeAttribute");
    expect(selectionsWhenNextBecameReady).toContainEqual({
      overview: "true",
      practice: "false",
    });

    await user.tab();

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Introduction, Course Section 1 of 1" }),
    );
    expect(canvas?.contains(document.activeElement)).toBe(false);

    await user.click(next);

    expect(screen.getByRole("status")).toHaveTextContent("1 of 2");
    await waitFor(() => expect(next).not.toBeDisabled());

    await user.click(next);

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("2 of 2"));
    expect(readyEditors).toHaveLength(1);
    expect(surfaceRuntimeProgramSource).toHaveBeenCalledWith(FIRST_SURFACE_ID);
    expect(surfaceRuntimeProgramSource).toHaveBeenCalledWith(SECOND_SURFACE_ID);
  });
});

function createTabsLearnerWaitProgram(): SlideshowSurfaceRuntimeProgram {
  const practiceSelected = {
    ownerId: TABS_OWNER_ID,
    targetId: PRACTICE_SECTION_ID,
    type: "selected",
  } as const;
  const overviewSelected = {
    ownerId: TABS_OWNER_ID,
    targetId: OVERVIEW_SECTION_ID,
    type: "selected",
  } as const;
  const practiceRule: CompiledLearnerInteractionRule = Object.freeze({
    id: "practice-selected-rule",
    when: practiceSelected,
    conditions: Object.freeze([
      {
        ownerId: TABS_OWNER_ID,
        targetId: PRACTICE_SECTION_ID,
        key: "selected",
        operator: "equals",
        value: true,
      },
    ] as const),
    commands: Object.freeze([
      {
        kind: "target-command",
        ownerId: TABS_OWNER_ID,
        targetId: OVERVIEW_SECTION_ID,
        type: "select",
      },
    ] as const),
  });
  const programmaticEventLeakRule: CompiledLearnerInteractionRule = Object.freeze({
    id: "programmatic-event-leak-detector",
    when: overviewSelected,
    conditions: Object.freeze([]),
    commands: Object.freeze([
      {
        kind: "reveal-target",
        targetId: PRACTICE_SECTION_ID,
      },
    ] as const),
  });
  const learnerInteractions: CompiledSurfaceLearnerInteractionProgram = Object.freeze({
    surfaceId: FIRST_SURFACE_ID,
    rulesByEvent: new Map([
      [createLearnerInteractionEventKey(practiceSelected), Object.freeze([practiceRule])],
      [
        createLearnerInteractionEventKey(overviewSelected),
        Object.freeze([programmaticEventLeakRule]),
      ],
    ]),
  });

  return Object.freeze({
    learnerInteractions,
    presentation: Object.freeze({
      autoAdvance: false,
      timeline: Object.freeze({
        surfaceId: FIRST_SURFACE_ID,
        durationMs: 0,
        cues: Object.freeze([
          {
            id: "select-overview-at-start",
            atMs: 0,
            command: {
              kind: "target-command",
              ownerId: TABS_OWNER_ID,
              targetId: OVERVIEW_SECTION_ID,
              type: "select",
            },
          },
        ] as const),
        waits: Object.freeze([
          {
            kind: "learner-wait",
            id: "practicWait1" as PresentationWaitId,
            atMs: 0,
            requirement: { kind: "event", ...practiceSelected },
          },
        ] as const),
      }),
    }),
  });
}

function createTabsLearnerNavigationProgram(
  learnerWaitEventType: string,
): SlideshowSurfaceRuntimeProgram {
  const practiceSelected = {
    ownerId: TABS_OWNER_ID,
    targetId: PRACTICE_SECTION_ID,
    type: "selected",
  } as const;
  const learnerInteractions: CompiledSurfaceLearnerInteractionProgram = Object.freeze({
    surfaceId: FIRST_SURFACE_ID,
    rulesByEvent: new Map([
      [
        createLearnerInteractionEventKey(practiceSelected),
        Object.freeze([
          Object.freeze({
            id: "practice-navigation-rule",
            when: practiceSelected,
            conditions: Object.freeze([]),
            commands: Object.freeze([
              { kind: "navigate-surface" as const, surfaceId: SECOND_SURFACE_ID },
            ] as const),
          }),
        ]),
      ],
    ]),
  });

  return Object.freeze({
    learnerInteractions,
    presentation: Object.freeze({
      autoAdvance: false,
      timeline: Object.freeze({
        surfaceId: FIRST_SURFACE_ID,
        durationMs: 0,
        cues: Object.freeze([
          Object.freeze({
            id: "select-overview-at-start",
            atMs: 0,
            command: Object.freeze({
              kind: "target-command" as const,
              ownerId: TABS_OWNER_ID,
              targetId: OVERVIEW_SECTION_ID,
              type: "select",
            }),
          }),
        ]),
        waits: Object.freeze([
          Object.freeze({
            kind: "learner-wait" as const,
            id: "branchWait01" as PresentationWaitId,
            atMs: 0,
            requirement: Object.freeze({
              kind: "event" as const,
              ownerId: TABS_OWNER_ID,
              targetId: PRACTICE_SECTION_ID,
              type: learnerWaitEventType,
            }),
          }),
        ]),
      }),
    }),
  });
}

function prepareSlideshowDocument(content: JSONContent) {
  const readiness = checkRuntimeDocumentReadiness(
    content,
    runtimeComposition,
    coreProductAccess,
  );
  if (readiness.status !== "supported") {
    throw new Error(`Expected a prepared Slideshow fixture, received ${readiness.status}.`);
  }
  const structure = projectCourseStructure(readiness.preparedDocument.content);
  if (!structure || structure.mode !== "slideshow") {
    throw new Error("Expected a projected Slideshow fixture.");
  }
  return { preparedDocument: readiness.preparedDocument, structure };
}

function tabsSlideshowDocument(): JSONContent {
  const content = createScaffoldDocumentContent({
    mode: "slideshow",
    initialCourseSectionTitle: "Introduction",
    surfaceId: FIRST_SURFACE_ID,
  });
  const courseDocument = content.content?.[0];
  if (!courseDocument) throw new Error("Slideshow fixture is missing its courseDocument.");

  courseDocument.content = [
    { type: "courseSection", attrs: { id: "courseSect01", title: "Introduction" } },
    slideWithTabs(),
    {
      type: "surface",
      attrs: {
        id: SECOND_SURFACE_ID,
        variant: "slide-content",
        settings: slideContentSettings(),
      },
      content: [
        {
          type: "slide_title",
          attrs: { id: "titleCtrl002" },
          content: [{ type: "text", text: "Next slide" }],
        },
        {
          type: "region",
          attrs: { id: "regionCtrl02", role: "main" },
          content: [paragraph("paraCtrl0003", "Second Surface")],
        },
      ],
    },
  ];
  return content;
}

function sectionedTabsSlideshowDocument(): JSONContent {
  const content = tabsSlideshowDocument();
  const courseDocument = content.content?.[0];
  const secondSurface = courseDocument?.content?.pop();
  const tabsSurface = courseDocument?.content?.pop();
  if (!courseDocument || !secondSurface || !tabsSurface) {
    throw new Error("Sectioned Slideshow fixture is missing its Surfaces.");
  }
  courseDocument.content?.push(
    secondSurface,
    { type: "courseSection", attrs: { id: "courseSect02", title: "Practice" } },
    tabsSurface,
  );
  return content;
}

function slideWithTabs(): JSONContent {
  return {
    type: "surface",
    attrs: {
      id: FIRST_SURFACE_ID,
      variant: "slide-content",
      settings: slideContentSettings(),
    },
    content: [
      {
        type: "slide_title",
        attrs: { id: "titleCtrl001" },
        content: [{ type: "text", text: "Tabs learner Wait" }],
      },
      {
        type: "region",
        attrs: { id: "regionCtrl01", role: "main" },
        content: [
          {
            type: "layout",
            attrs: {
              id: TABS_OWNER_ID,
              variant: "tabs",
              options: { variant: "default", label: "Lesson sections" },
            },
            content: [
              tabSection(OVERVIEW_SECTION_ID, "Overview", "paraCtrl0001"),
              tabSection(PRACTICE_SECTION_ID, "Practice", "paraCtrl0002"),
            ],
          },
        ],
      },
    ],
  };
}

function tabSection(id: EmbeddedNodeId, label: string, paragraphId: string): JSONContent {
  return {
    type: "section",
    attrs: { id, options: { label } },
    content: [paragraph(paragraphId, label)],
  };
}

function paragraph(id: string, text: string): JSONContent {
  return {
    type: "paragraph",
    attrs: { id },
    content: [{ type: "text", text }],
  };
}

function slideContentSettings() {
  return {
    header: { enabled: false },
    footer: { enabled: false },
    slideTitle: { enabled: true },
  } as const;
}

function configuredPresentationProgram(surfaceId: SurfaceId): SlideshowSurfaceRuntimeProgram {
  return Object.freeze({
    presentation: Object.freeze({
      autoAdvance: false,
      timeline: Object.freeze({
        surfaceId,
        durationMs: 100,
        cues: Object.freeze([]),
        waits: Object.freeze([]),
      }),
    }),
  });
}

function presentationProgramWithOwner(
  surfaceId: SurfaceId,
  ownerId: EmbeddedNodeId,
): SlideshowSurfaceRuntimeProgram {
  return Object.freeze({
    presentation: Object.freeze({
      autoAdvance: false,
      timeline: Object.freeze({
        surfaceId,
        durationMs: 100,
        waits: Object.freeze([]),
        cues: Object.freeze([
          Object.freeze({
            id: "owner-readiness-cue",
            atMs: 0,
            command: Object.freeze({
              kind: "target-command" as const,
              ownerId,
              targetId: OVERVIEW_SECTION_ID,
              type: "select",
            }),
          }),
        ]),
      }),
    }),
  });
}

function presentationSnapshot(
  phase: PresentationPlaybackPhase,
  hold?: PresentationHold,
): PresentationPlaybackSnapshot {
  const base = {
    runNumber: 1,
    surfaceId: FIRST_SURFACE_ID,
    currentTimeMs: phase === "completed" ? 100 : 0,
    durationMs: 100,
    outstandingLearnerWait: null,
  } as const;
  if (phase === "held") {
    if (!hold) throw new Error("A held Presentation test snapshot requires hold detail.");
    return Object.freeze({ ...base, phase, hold: Object.freeze(hold) });
  }
  if (hold) throw new Error(`A ${phase} Presentation test snapshot cannot contain hold detail.`);
  return Object.freeze({ ...base, phase });
}

function presentationWaitingSnapshot(
  surfaceId: SurfaceId,
  waitId: PresentationWaitId,
): PresentationPlaybackSnapshot {
  return Object.freeze({
    phase: "held",
    runNumber: 1,
    surfaceId,
    currentTimeMs: 0,
    durationMs: 100,
    hold: Object.freeze({ kind: "learner", waitId, status: "waiting" }),
    outstandingLearnerWait: Object.freeze({ waitId }),
  });
}

function createControllablePresentationSession(initialSnapshot: PresentationPlaybackSnapshot) {
  let snapshot = initialSnapshot;
  const listeners = new Set<() => void>();
  const capturedListeners: Array<() => void> = [];
  const play = vi.fn();
  const advance = vi.fn<PresentationPlaybackSession["advance"]>(() => Result.ok());
  const dispose = vi.fn();
  const session: PresentationPlaybackSession = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      capturedListeners.push(listener);
      return () => listeners.delete(listener);
    },
    subscribeCueReports: () => () => undefined,
    play,
    pause: vi.fn(),
    seek: vi.fn(() => Result.ok()),
    advance,
    restart: vi.fn(),
    stop: vi.fn(),
    dispose,
  };
  return {
    session,
    play,
    advance,
    dispose,
    capturedListeners,
    replaceSnapshot(nextSnapshot: PresentationPlaybackSnapshot) {
      snapshot = nextSnapshot;
    },
    setSnapshot(nextSnapshot: PresentationPlaybackSnapshot) {
      snapshot = nextSnapshot;
      for (const listener of [...listeners]) listener();
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

function surfaceExitEnvironment(): SurfaceExitEnvironment {
  const environment = surfaceExitTestProbe.environment as SurfaceExitEnvironment | undefined;
  if (!environment) {
    throw new Error("Slideshow renderer did not receive the Surface Exit Environment.");
  }
  return environment;
}

function testComposition(
  input: CreateSlideshowSurfaceRuntimeCompositionInput,
  presentationSession?: PresentationPlaybackSession,
  learnerRuntime: SlideshowSurfaceRuntimeComposition["learnerRuntime"] = inactiveLearnerRuntime(),
): SlideshowSurfaceRuntimeComposition {
  return Object.freeze({
    surfaceId: input.surfaceId,
    learnerRuntime,
    ...(presentationSession ? { presentationSession } : {}),
    dispose() {
      presentationSession?.dispose();
    },
  });
}

function createCompositionLifecycleProbe(
  createPresentationSession: (
    surfaceId: SurfaceId,
  ) => PresentationPlaybackSession | undefined = () => undefined,
) {
  const events: string[] = [];
  let activeOwners = 0;
  let maximumActiveOwners = 0;
  let creations = 0;
  let disposals = 0;
  const learners: ReturnType<typeof createControllableLearnerRuntime>[] = [];
  const createComposition = (input: unknown): SlideshowSurfaceRuntimeComposition => {
    const { surfaceId } = input as CreateSlideshowSurfaceRuntimeCompositionInput;
    creations += 1;
    activeOwners += 1;
    maximumActiveOwners = Math.max(maximumActiveOwners, activeOwners);
    events.push(`create:${surfaceId}`);
    const presentationSession = createPresentationSession(surfaceId);
    const learner = createControllableLearnerRuntime("inactive");
    learners.push(learner);
    let disposed = false;
    return Object.freeze({
      surfaceId,
      learnerRuntime: learner.runtime,
      ...(presentationSession ? { presentationSession } : {}),
      dispose() {
        if (disposed) return;
        disposed = true;
        presentationSession?.dispose();
        disposals += 1;
        activeOwners -= 1;
        events.push(`dispose:${surfaceId}`);
      },
    });
  };
  return {
    events,
    learners,
    createComposition,
    get activeOwners() {
      return activeOwners;
    },
    get maximumActiveOwners() {
      return maximumActiveOwners;
    },
    get creations() {
      return creations;
    },
    get disposals() {
      return disposals;
    },
  };
}

function inactiveLearnerRuntime(): SlideshowSurfaceRuntimeComposition["learnerRuntime"] {
  return createControllableLearnerRuntime("inactive").runtime;
}

function createControllableLearnerRuntime(
  initialStatus: PresentationGateObservationSnapshot["status"],
) {
  let snapshot = Object.freeze({ status: initialStatus }) as PresentationGateObservationSnapshot;
  const listeners = new Set<() => void>();
  const capturedListeners: Array<() => void> = [];
  const runtime = Object.freeze({
    getGateObservationSnapshot: () => snapshot,
    subscribeGateObservation(listener: () => void) {
      listeners.add(listener);
      capturedListeners.push(listener);
      return () => listeners.delete(listener);
    },
  }) as unknown as SlideshowSurfaceRuntimeComposition["learnerRuntime"];

  return {
    runtime,
    capturedListeners,
    replaceSnapshot(status: PresentationGateObservationSnapshot["status"]) {
      snapshot = Object.freeze({ status }) as PresentationGateObservationSnapshot;
    },
    setSnapshot(status: PresentationGateObservationSnapshot["status"]) {
      snapshot = Object.freeze({ status }) as PresentationGateObservationSnapshot;
      for (const listener of [...listeners]) listener();
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}
