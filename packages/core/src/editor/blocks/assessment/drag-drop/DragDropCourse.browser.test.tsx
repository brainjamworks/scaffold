// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { AssessmentPort } from "@/host/ports";
import { RuntimeAssessmentControls } from "@/editor/blocks/assessment/shared/chrome/AssessmentControls";
import type { AssessmentRuntimeController } from "@/editor/assessment/shared/runtime/use-assessment-runtime";
import { useAssessmentRuntimeById } from "@/editor/assessment/shared/runtime/use-assessment-runtime";
import { pageAssessmentExperience } from "@/editor/assessment/shared/model/assessment-capability";
import { useAssessmentProblemFacade } from "@/runtime/assessment/runtime-facade";
import { TestInteractionDragEnvironment } from "@/editor/interactions/drag/testing/TestInteractionDragEnvironment";
import {
  assessmentProblemOutcome,
  createAssessmentRuntimeTestRoot,
  hasAssessmentRegistration,
  localAssessmentResponse,
} from "@/runtime/assessment/test-utils";
import type { AssessmentStoreApi } from "@/runtime/assessment/types";

import { dragDropResponseCodec } from "@/editor/assessment/drag-drop/drag-drop-response-codec";
import type { DragDropCourseContent } from "./drag-drop-course-content";
import {
  DragDropCourseInteraction,
  DragDropInlineCourseWorkspace,
} from "./drag-drop-course-interaction";

const assessmentTargetId = "target000001";
const problemId = `artifact:artifact-1/block:${assessmentTargetId}`;
const TEST_IMAGE_SRC =
  "data:image/gif;base64,R0lGODlhAgABAPAAAP///wAAACH5BAAAAAAALAAAAAACAAEAAAICBAoAOw==";

const content: DragDropCourseContent = {
  image: { mode: "managed", mediaId: "map-image", alt: "Map of Europe" },
  imageAspectRatio: 2,
  defaultMarkerVisual: { kind: "preset", preset: "dot" },
  markers: [
    { id: "marker000001" as never, label: "London", visual: { kind: "preset", preset: "pin" } },
    { id: "marker000002" as never, label: "Paris", visual: { kind: "preset", preset: "flag" } },
  ],
  accessibleLegend: "Place each city on the map.",
};
function responseCodecFor(courseContent: DragDropCourseContent) {
  const interaction = {
    kind: "spatial-placement" as const,
    markers: courseContent.markers.map(({ id, label }) => ({ id, label })),
  };
  return {
    interaction,
    codec: {
      ...dragDropResponseCodec,
      toContractResponse: (response: unknown) =>
        dragDropResponseCodec.toContractResponse(response, interaction),
      fromContractResponse: (
        response: Parameters<typeof dragDropResponseCodec.fromContractResponse>[0],
      ) => dragDropResponseCodec.fromContractResponse(response, interaction),
      hasResponse: (response: unknown) => dragDropResponseCodec.hasResponse(response, interaction),
    },
  };
}

class ResizeObserverStub implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const dragTestElements: HTMLElement[] = [];

beforeEach(() => vi.stubGlobal("ResizeObserver", ResizeObserverStub));
afterEach(() => {
  cleanup();
  while (dragTestElements.length > 0) dragTestElements.pop()?.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function DragDropTargetRegistration({
  courseContent,
  feedbackMode,
  maxAttempts,
}: {
  courseContent: DragDropCourseContent;
  feedbackMode: "immediate" | "on_submit";
  maxAttempts: number | null;
}) {
  const registration = useMemo(() => {
    const { codec, interaction } = responseCodecFor(courseContent);
    return {
      authoredBlockId: assessmentTargetId,
      targetId: assessmentTargetId,
      interactionKind: "spatial-placement" as const,
      response: codec,
      config: {
        experience: pageAssessmentExperience,
        settings: {
          feedbackMode,
          isGraded: true,
          showAnswer: true,
          points: 1,
          maxAttempts,
        },
        hintsTotal: 0,
        learningEventDefinition: {
          interaction,
        },
      },
    };
  }, [courseContent, feedbackMode, maxAttempts]);
  useAssessmentProblemFacade(registration);
  return null;
}

function RemountableInteraction({ courseContent }: { courseContent: DragDropCourseContent }) {
  const [mounted, setMounted] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setMounted((value) => !value)}>
        Toggle interaction
      </button>
      {mounted ? (
        <DragDropCourseInteraction
          assessmentTargetId={assessmentTargetId}
          content={courseContent}
          presentation="inline"
        />
      ) : null}
    </>
  );
}

describe("DragDropCourseInteraction", () => {
  it("places with pointer and writes only on release", async () => {
    const consoleError = vi.spyOn(console, "error");
    let assessmentStore: AssessmentStoreApi | null = null;
    const rendered = renderCourse({
      onStore: (store) => {
        assessmentStore = store;
      },
    });
    const surface = await readySurface();
    surface.getBoundingClientRect = imageRect;
    const london = screen.getByRole("button", { name: "Select London for placement" });
    const sourceRect = london
      .closest<HTMLElement>(".sc-course-drag-drop-source")
      ?.getBoundingClientRect();
    expect(sourceRect?.width).toBeGreaterThan(0);
    expect(sourceRect?.height).toBeGreaterThan(0);

    await startPointerDrag(london, "mouse");
    await movePointer({ x: 100, y: 150 }, "mouse");
    expect(localAssessmentResponse(assessmentStore, problemId)).toBeNull();
    finishPointerDrag({ x: 100, y: 150 }, "mouse");
    await waitFor(() =>
      expect(localAssessmentResponse(assessmentStore, problemId)).toEqual({
        placements: { marker000001: { x: 25, y: 75 } },
      }),
    );
    rendered.unmount();
    expect(consoleError.mock.calls.flat().join(" ")).not.toContain(
      "useInsertionEffect must not schedule updates",
    );
  });

  it("places a marker at the scaled image edge with touch", async () => {
    let assessmentStore: AssessmentStoreApi | null = null;
    renderCourse({
      onStore: (store) => {
        assessmentStore = store;
      },
    });
    const surface = await readySurface();
    surface.getBoundingClientRect = imageRect;
    const london = screen.getByRole("button", { name: "Select London for placement" });

    await startPointerDrag(london, "touch");
    await movePointer({ x: 400, y: 0 }, "touch");
    expect(localAssessmentResponse(assessmentStore, problemId)).toBeNull();
    finishPointerDrag({ x: 400, y: 0 }, "touch");

    await waitFor(() =>
      expect(localAssessmentResponse(assessmentStore, problemId)).toEqual({
        placements: { marker000001: { x: 100, y: 0 } },
      }),
    );
  });

  it.each([
    { terminal: "outside" as const, pointerId: 3 },
    { terminal: "escape" as const, pointerId: 4 },
    { terminal: "pointer cancellation" as const, pointerId: 5 },
  ])(
    "retains the prior point when repositioning ends with $terminal",
    async ({ pointerId, terminal }) => {
      let assessmentStore: AssessmentStoreApi | null = null;
      let runtime: AssessmentRuntimeController<"spatial-placement"> | null = null;
      renderCourse({
        onRuntime: (value) => {
          runtime = value;
        },
        onStore: (store) => {
          assessmentStore = store;
        },
      });
      const surface = await readySurface();
      surface.getBoundingClientRect = imageRect;
      await waitFor(() => expect(runtime).not.toBeNull());
      const currentRuntime = () =>
        runtime as AssessmentRuntimeController<"spatial-placement"> | null;
      await act(async () => {
        expect(
          currentRuntime()?.interaction.setPlacement("marker000001", { x: 25, y: 75 }),
        ).toEqual({
          status: "updated",
        });
      });
      const placedLondon = await screen.findByRole("button", {
        name: /Placed London, 1 of 1\. Drag to reposition/,
      });

      await startPointerDrag(placedLondon, "mouse", pointerId);
      if (terminal === "outside") {
        await movePointer({ x: 700, y: 500 }, "mouse", pointerId);
        finishPointerDrag({ x: 700, y: 500 }, "mouse", pointerId);
      } else if (terminal === "escape") {
        fireEvent.keyDown(document, { code: "Escape", key: "Escape" });
      } else {
        fireEvent.pointerCancel(document, {
          clientX: 50,
          clientY: 50,
          isPrimary: true,
          pointerId,
          pointerType: "mouse",
        });
      }

      await waitFor(() =>
        expect(document.querySelector("[data-interaction-drag-overlay]")).toBeNull(),
      );
      expect(localAssessmentResponse(assessmentStore, problemId)).toEqual({
        placements: { marker000001: { x: 25, y: 75 } },
      });
      expect(placedLondon).toHaveFocus();
    },
  );

  it("cancels an active reposition when submission locks the attempt", async () => {
    let assessmentStore: AssessmentStoreApi | null = null;
    let runtime: AssessmentRuntimeController<"spatial-placement"> | null = null;
    const assessment: AssessmentPort = {
      type: "runtime",
      submit: async (request) =>
        assessmentProblemOutcome(
          { isCorrect: false, score: { scaled: 0 }, feedback: null, items: {} },
          { response: request.response },
        ),
    };
    renderCourse({
      assessment,
      onRuntime: (value) => {
        runtime = value;
      },
      onStore: (store) => {
        assessmentStore = store;
      },
    });
    const surface = await readySurface();
    surface.getBoundingClientRect = imageRect;
    await waitFor(() => expect(runtime).not.toBeNull());
    const currentRuntime = () => runtime as AssessmentRuntimeController<"spatial-placement"> | null;
    await act(async () => {
      currentRuntime()?.response.setValue({
        placements: {
          marker000001: { x: 25, y: 75 },
          marker000002: { x: 75, y: 25 },
        },
      });
    });
    const placedLondon = await screen.findByRole("button", {
      name: /Placed London, 1 of 2\. Drag to reposition/,
    });
    await startPointerDrag(placedLondon, "mouse");

    await act(async () => {
      await currentRuntime()?.actions.submit();
    });

    await waitFor(() => expect(currentRuntime()?.problem?.interactionLocked).toBe(true));
    await waitFor(() =>
      expect(document.querySelector("[data-interaction-drag-overlay]")).toBeNull(),
    );
    expect(localAssessmentResponse(assessmentStore, problemId)).toEqual({
      placements: {
        marker000001: { x: 25, y: 75 },
        marker000002: { x: 75, y: 25 },
      },
    });
    expect(placedLondon).toBeEnabled();
  });

  it("cancels keyboard repositioning once when submission locks the attempt", async () => {
    let assessmentStore: AssessmentStoreApi | null = null;
    let runtime: AssessmentRuntimeController<"spatial-placement"> | null = null;
    const assessment: AssessmentPort = {
      type: "runtime",
      submit: async (request) =>
        assessmentProblemOutcome(
          { isCorrect: false, score: { scaled: 0 }, feedback: null, items: {} },
          { response: request.response },
        ),
    };
    renderCourse({
      assessment,
      onRuntime: (value) => {
        runtime = value;
      },
      onStore: (store) => {
        assessmentStore = store;
      },
    });
    await readySurface();
    await waitFor(() => expect(runtime).not.toBeNull());
    const currentRuntime = () => runtime as AssessmentRuntimeController<"spatial-placement"> | null;
    await act(async () => {
      currentRuntime()?.response.setValue({
        placements: {
          marker000001: { x: 25, y: 75 },
          marker000002: { x: 75, y: 25 },
        },
      });
    });
    const placedLondon = await screen.findByRole("button", {
      name: /Placed London, 1 of 2\. Drag to reposition/,
    });
    placedLondon.focus();
    fireEvent.keyDown(placedLondon, { code: "Enter", key: "Enter" });
    const cursor = await waitFor(() => {
      const element = document.querySelector<HTMLElement>("[data-drag-drop-keyboard-cursor]");
      expect(element).not.toBeNull();
      return element!;
    });
    fireEvent.keyDown(cursor, { code: "ArrowRight", key: "ArrowRight" });
    const before = localAssessmentResponse(assessmentStore, problemId);

    await act(async () => {
      await currentRuntime()?.actions.submit();
    });

    await waitFor(() => expect(currentRuntime()?.problem?.interactionLocked).toBe(true));
    await waitFor(() =>
      expect(document.querySelector("[data-drag-drop-keyboard-cursor]")).toBeNull(),
    );
    expect(localAssessmentResponse(assessmentStore, problemId)).toEqual(before);
    const inspectLondon = screen.getByRole("button", {
      name: "Placed London, 1 of 2. Review position",
    });
    expect(inspectLondon).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(inspectLondon).toHaveFocus());
  });

  it("keeps twelve dense, duplicate-labelled and overlapping markers reachable in authored order", async () => {
    const denseContent: DragDropCourseContent = {
      ...content,
      markers: Array.from({ length: 12 }, (_, index) => ({
        id: `marker${String(index + 1).padStart(6, "0")}` as never,
        label:
          index < 2
            ? "Station"
            : index === 11
              ? "A very long marker label that must remain inside the image edge"
              : `Marker ${index + 1}`,
        visual: { kind: "preset" as const, preset: "dot" as const },
      })),
    };
    let assessmentStore: AssessmentStoreApi | null = null;
    let runtime: AssessmentRuntimeController<"spatial-placement"> | null = null;
    const user = userEvent.setup();
    renderCourse({
      courseContent: denseContent,
      onRuntime: (value) => {
        runtime = value;
      },
      onStore: (store) => {
        assessmentStore = store;
      },
    });
    const surface = await readySurface();
    surface.getBoundingClientRect = imageRect;
    await waitFor(() => expect(runtime).not.toBeNull());
    const currentRuntime = () => runtime as AssessmentRuntimeController<"spatial-placement"> | null;
    await act(async () => {
      currentRuntime()?.response.setValue({
        placements: Object.fromEntries(
          denseContent.markers.map((marker, index) => [
            marker.id,
            index < 3
              ? { x: 50, y: 50 }
              : index === 11
                ? { x: 100, y: 100 }
                : { x: index * 8, y: 0 },
          ]),
        ),
      });
    });
    await waitFor(() => expect(currentRuntime()?.response.hasValue).toBe(true));

    const tray = screen.getByLabelText("Markers");
    expect(getComputedStyle(tray).overflow).toBe("auto");
    expect(screen.getByText("Scroll for more markers.")).toBeVisible();
    const firstStation = screen.getByRole("button", {
      name: "Select placed Station, marker 1 of 12 for repositioning",
    });
    expect(firstStation).toBeVisible();
    expect(firstStation).toHaveTextContent("Station");
    expect(firstStation).not.toHaveTextContent("Select placed");
    expect(
      screen.getByRole("button", {
        name: "Select placed Station, marker 2 of 12 for repositioning",
      }),
    ).toBeVisible();

    const overlap = screen.getByRole("button", {
      name: /Placed Station, 1 of 12\. Drag to reposition/,
    });
    await user.click(overlap);
    await user.click(overlap);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Station selected, 2 of 3 overlapping markers",
    );

    await user.click(screen.getByRole("button", { name: "Next placed marker" }));
    expect(
      screen.getByRole("button", {
        name: "Select placed Marker 3 for repositioning",
      }),
    ).toHaveAttribute("aria-pressed", "true");

    const edgeMarker = screen.getByRole("button", {
      name: /Placed A very long marker label.*12 of 12\. Drag to reposition/,
    }).parentElement;
    expect(edgeMarker).toHaveAttribute("data-edge-x", "right");
    expect(edgeMarker).toHaveAttribute("data-edge-y", "bottom");
    expect(edgeMarker?.getAttribute("style")).toContain("left: 100%");
    expect(edgeMarker?.getAttribute("style")).toContain("top: 100%");
    surface.getBoundingClientRect = () => rect({ left: 10, top: 20, width: 200, height: 100 });
    expect(edgeMarker?.getAttribute("style")).toContain("left: 100%");
    expect(edgeMarker?.getAttribute("style")).toContain("top: 100%");

    await user.click(
      screen.getByRole("button", {
        name: "Remove current marker, Marker 3",
      }),
    );
    await waitFor(() =>
      expect(localAssessmentResponse(assessmentStore, problemId)?.placements).not.toHaveProperty(
        "marker000003",
      ),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "Select Marker 3 for placement",
        }),
      ).toHaveFocus(),
    );
  });

  it("keeps tray actions reachable while a dense tray scrolls in inline and expanded layouts", async () => {
    const denseContent: DragDropCourseContent = {
      ...content,
      markers: Array.from({ length: 12 }, (_, index) => ({
        id: `marker${String(index + 1).padStart(6, "0")}` as never,
        label: `Marker ${index + 1}`,
        visual: { kind: "preset" as const, preset: "dot" as const },
      })),
    };
    const user = userEvent.setup();
    renderCourse({ courseContent: denseContent });
    await readySurface();

    const trays = screen.getAllByLabelText("Markers");
    expect(trays).toHaveLength(1);
    const tray = trays[0]!;
    expect(getComputedStyle(tray).overflow).toBe("auto");
    // Actions stay in normal flow as the last tray row so the sticky scroll
    // hint above them is never covered while the tray scrolls.
    const actions = tray.querySelector<HTMLElement>(".sc-course-drag-drop-tray__actions");
    expect(actions).not.toBeNull();
    expect(getComputedStyle(actions!).position).not.toBe("sticky");
    expect(tray.lastElementChild).toBe(actions);

    const inlineLayout = document.querySelector<HTMLElement>(
      '[data-drag-drop-presentation="inline"] .sc-course-drag-drop-interaction__layout',
    );
    expect(inlineLayout).not.toBeNull();
    expect(getComputedStyle(inlineLayout!).display).toBe("grid");

    await user.click(screen.getByRole("button", { name: "Expand Drag and Drop" }));
    const expandedTray = await waitFor(() => {
      const element = document.querySelector<HTMLElement>(
        '[data-drag-drop-presentation="expanded"] .sc-course-drag-drop-tray',
      );
      expect(element).not.toBeNull();
      return element!;
    });
    expect(getComputedStyle(expandedTray).overflow).toBe("auto");
    // Real browsers resolve min(70vh, 48rem) against the viewport.
    expect(Number.parseFloat(getComputedStyle(expandedTray).maxHeight)).toBeCloseTo(
      Math.min(window.innerHeight * 0.7, 768),
      0,
    );
    const expandedActions = expandedTray.querySelector<HTMLElement>(
      ".sc-course-drag-drop-tray__actions",
    );
    expect(expandedActions).not.toBeNull();
    expect(expandedTray.lastElementChild).toBe(expandedActions);
  });

  it("uses shared submission, retry retention, feedback, exhausted and mutually exclusive answer views", async () => {
    const user = userEvent.setup();
    let runtime: AssessmentRuntimeController<"spatial-placement"> | null = null;
    const assessment: AssessmentPort = {
      type: "runtime",
      submit: async (request) =>
        assessmentProblemOutcome(
          {
            isCorrect: false,
            score: { scaled: 0.5, raw: 1, min: 0, max: 2 },
            feedback: null,
            items: {
              marker000001: { correct: true, expected: true, given: true },
              marker000002: { correct: false, expected: true, given: true },
            },
          },
          { attemptNumber: request.expectedAttemptNumber + 1, response: request.response },
        ),
      revealAnswer: async () => ({
        answerKey: {
          kind: "spatial-placement",
          gradingMode: "partial-credit",
          imageAspectRatio: 2,
          correctPlacements: [
            {
              markerId: "marker000001",
              geometry: { kind: "circle", centerX: 10, centerY: 20, radius: 8 },
            },
            {
              markerId: "marker000002",
              geometry: { kind: "circle", centerX: 90, centerY: 80, radius: 8 },
            },
          ],
          feedbackByMarkerId: {},
        },
      }),
    };
    renderCourse({
      assessment,
      maxAttempts: 2,
      onRuntime: (value) => {
        runtime = value;
      },
    });
    await readySurface();
    await waitFor(() => expect(runtime).not.toBeNull());
    const currentRuntime = () => runtime as AssessmentRuntimeController<"spatial-placement"> | null;
    expect(currentRuntime()?.response.hasValue).toBe(false);
    await act(async () => {
      currentRuntime()?.response.setValue({
        placements: {
          marker000001: { x: 25, y: 30 },
          marker000002: { x: 75, y: 70 },
        },
      });
    });
    await waitFor(() => expect(currentRuntime()?.response.hasValue).toBe(true));

    await act(async () => {
      await currentRuntime()?.actions.submit();
    });
    await waitFor(() => expect(currentRuntime()?.problem?.state.submitted).toBe(true));
    expect(currentRuntime()?.problem?.state.attemptNumber).toBe(1);
    expect(currentRuntime()?.problem?.canRetry).toBe(true);
    expect(document.querySelectorAll('[data-course-state="correct"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-course-state="incorrect"]')).toHaveLength(1);
    const inspectLondon = screen.getByRole("button", { name: "Inspect placed London position" });
    expect(inspectLondon).toBeEnabled();
    const submittedResponse = currentRuntime()?.interaction.placements;
    inspectLondon.focus();
    fireEvent.keyDown(inspectLondon, { code: "Enter", key: "Enter" });
    expect(document.querySelector("[data-drag-drop-keyboard-cursor]")).toBeNull();
    expect(currentRuntime()?.interaction.placements).toEqual(submittedResponse);
    await user.click(screen.getByRole("button", { name: "Next placed marker" }));
    expect(screen.getByRole("button", { name: /Placed Paris, 2 of 2\./ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(currentRuntime()?.interaction.placements).toEqual(submittedResponse);

    await act(async () => {
      currentRuntime()?.problem?.reset();
    });
    await waitFor(() => expect(currentRuntime()?.problem?.state.submitted).toBe(false));
    expect(currentRuntime()?.interaction.placements).toEqual({
      marker000001: { x: 25, y: 30 },
      marker000002: { x: 75, y: 70 },
    });

    await act(async () => {
      await currentRuntime()?.actions.submit();
    });
    await waitFor(() => expect(currentRuntime()?.problem?.exhausted).toBe(true));
    expect(currentRuntime()?.problem?.canRetry).toBe(false);
    await act(async () => {
      await currentRuntime()?.problem?.toggleAnswerView();
    });
    await waitFor(() =>
      expect(document.querySelector("[data-assessment-answer-view='correct']")).not.toBeNull(),
    );
    const correctLondon = screen.getByRole("button", {
      name: /Placed London, 1 of 2\. Review position/,
    }).parentElement;
    fireEvent.keyDown(screen.getByRole("button", { name: "Inspect placed London position" }), {
      code: "Space",
      key: " ",
    });
    expect(document.querySelector("[data-drag-drop-keyboard-cursor]")).toBeNull();
    expect(correctLondon?.getAttribute("style")).toContain("left: 10%");
    expect(correctLondon?.getAttribute("style")).toContain("top: 20%");
    expect(document.querySelectorAll(".sc-course-drag-drop-marker")).toHaveLength(2);

    await act(async () => {
      await currentRuntime()?.problem?.toggleAnswerView();
    });
    await waitFor(() =>
      expect(document.querySelector("[data-assessment-answer-view='submitted']")).not.toBeNull(),
    );
    const learnerLondon = screen.getByRole("button", {
      name: /Placed London, 1 of 2\. Review position/,
    }).parentElement;
    expect(learnerLondon?.getAttribute("style")).toContain("left: 25%");
    expect(learnerLondon?.getAttribute("style")).toContain("top: 30%");
    expect(document.querySelectorAll(".sc-course-drag-drop-marker")).toHaveLength(2);
  });

  it("checks immediate feedback once the whole marker response is complete", async () => {
    let runtime: AssessmentRuntimeController<"spatial-placement"> | null = null;
    const result = {
      isCorrect: false,
      score: { scaled: 0.5, raw: 1, min: 0, max: 2 },
      feedback: null,
      items: {
        marker000001: { correct: true, expected: true, given: true },
        marker000002: { correct: false, expected: true, given: true },
      },
    } as const;
    const check = vi.fn<NonNullable<AssessmentPort["check"]>>(async (request) =>
      assessmentProblemOutcome(result, {
        attemptNumber: request.expectedAttemptNumber + 1,
        checkResult: result,
        response: request.response,
        submitted: false,
        submissionResult: null,
      }),
    );
    renderCourse({
      assessment: {
        type: "runtime",
        check,
        submit: async (request) => assessmentProblemOutcome(result, { response: request.response }),
      },
      feedbackMode: "immediate",
      onRuntime: (value) => {
        runtime = value;
      },
    });
    await readySurface();
    await waitFor(() => expect(runtime).not.toBeNull());
    const currentRuntime = () => runtime as AssessmentRuntimeController<"spatial-placement"> | null;

    expect(currentRuntime()?.interaction.setPlacement("marker000001", { x: 25, y: 30 })).toEqual({
      status: "updated",
    });
    await waitFor(() =>
      expect(currentRuntime()?.interaction.placements).toEqual({
        marker000001: { x: 25, y: 30 },
      }),
    );
    expect(check).not.toHaveBeenCalled();
    expect(currentRuntime()?.interaction.setPlacement("marker000002", { x: 75, y: 70 })).toEqual({
      status: "updated",
    });

    await waitFor(() => expect(check).toHaveBeenCalledOnce());
    await waitFor(() => expect(currentRuntime()?.problem?.feedbackResult).toEqual(result));
    expect(document.querySelectorAll('[data-course-state="correct"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-course-state="incorrect"]')).toHaveLength(1);
    expect(currentRuntime()?.problem?.state.submitted).toBe(false);
  });

  it("selects, places, replaces and resets markers through one runtime response", async () => {
    const user = userEvent.setup();
    let assessmentStore: AssessmentStoreApi | null = null;
    renderCourse({
      onStore: (store) => {
        assessmentStore = store;
      },
    });

    await waitFor(() => expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true));
    const surface = await readySurface();
    surface.getBoundingClientRect = imageRect;

    const london = screen.getByRole("button", { name: "Select London for placement" });
    await user.click(london);
    expect(london).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveTextContent("London selected");
    const paris = screen.getByRole("button", { name: "Select Paris for placement" });
    await user.click(paris);
    expect(london).toHaveAttribute("aria-pressed", "false");
    expect(paris).toHaveAttribute("aria-pressed", "true");
    await user.click(london);
    fireEvent.click(surface, { clientX: 100, clientY: 150 });
    await waitFor(() => {
      expect(localAssessmentResponse(assessmentStore, problemId)).toEqual({
        placements: { marker000001: { x: 25, y: 75 } },
      });
    });

    await user.click(
      screen.getByRole("button", { name: "Select placed London for repositioning" }),
    );
    fireEvent.click(surface, { clientX: 200, clientY: 100 });
    await waitFor(() => {
      expect(localAssessmentResponse(assessmentStore, problemId)).toEqual({
        placements: { marker000001: { x: 50, y: 50 } },
      });
    });

    await user.click(screen.getByRole("button", { name: "Select Paris for placement" }));
    fireEvent.click(surface, { clientX: 300, clientY: 50 });
    await waitFor(() => {
      const response = localAssessmentResponse(assessmentStore, problemId);
      expect(response).toEqual({
        placements: {
          marker000001: { x: 50, y: 50 },
          marker000002: { x: 75, y: 25 },
        },
      });
      expect(Object.keys(response?.["placements"] as object)).toEqual([
        "marker000001",
        "marker000002",
      ]);
    });
    expect(screen.getByRole("status")).toHaveTextContent("2 of 2 markers placed");
    expect(document.querySelector("[data-drag-drop-response-ready='true']")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Reset marker placements" }));
    await waitFor(() => {
      expect(localAssessmentResponse(assessmentStore, problemId)).toEqual({ placements: {} });
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Select London for placement" })).toHaveFocus(),
    );
  });

  it("places, repositions and cancels by keyboard without writing during positioning", async () => {
    const user = userEvent.setup();
    let assessmentStore: AssessmentStoreApi | null = null;
    renderCourse({
      onStore: (store) => {
        assessmentStore = store;
      },
    });
    await readySurface();

    const london = screen.getByRole("button", { name: "Select London for placement" });
    london.focus();
    fireEvent.keyDown(london, { code: "Enter", key: "Enter" });
    const cursor = await waitFor(() => {
      const element = document.querySelector<HTMLElement>("[data-drag-drop-keyboard-cursor]");
      expect(element).not.toBeNull();
      return element!;
    });
    expect(cursor).toHaveFocus();
    expect(cursor.style.getPropertyValue("--sc-drag-drop-keyboard-cursor-x")).toBe("50%");
    expect(cursor.style.getPropertyValue("--sc-drag-drop-keyboard-cursor-y")).toBe("50%");
    expect(localAssessmentResponse(assessmentStore, problemId)).toBeNull();

    fireEvent.keyDown(cursor, { code: "ArrowRight", key: "ArrowRight" });
    fireEvent.keyDown(cursor, { code: "ArrowDown", key: "ArrowDown", shiftKey: true });
    fireEvent.keyDown(cursor, { altKey: true, code: "ArrowLeft", key: "ArrowLeft" });
    expect(screen.getByRole("status")).toHaveTextContent("keyboard positioning started");
    fireEvent.keyUp(cursor, { altKey: true, code: "ArrowLeft", key: "ArrowLeft" });
    expect(cursor.style.getPropertyValue("--sc-drag-drop-keyboard-cursor-x")).toBe("54%");
    expect(cursor.style.getPropertyValue("--sc-drag-drop-keyboard-cursor-y")).toBe("60%");
    expect(screen.getByRole("status")).toHaveTextContent(
      "London cursor at approximately 54% horizontal, 60% vertical",
    );
    expect(localAssessmentResponse(assessmentStore, problemId)).toBeNull();

    fireEvent.keyDown(cursor, { code: "Space", key: " " });
    await waitFor(() =>
      expect(localAssessmentResponse(assessmentStore, problemId)).toEqual({
        placements: { marker000001: { x: 54, y: 60 } },
      }),
    );
    const placedLondon = await screen.findByRole("button", {
      name: /Placed London, 1 of 1\. Drag to reposition/,
    });
    await waitFor(() => expect(placedLondon).toHaveFocus());

    fireEvent.keyDown(placedLondon, { code: "Enter", key: "Enter" });
    const repositionCursor = await waitFor(() => {
      const element = document.querySelector<HTMLElement>("[data-drag-drop-keyboard-cursor]");
      expect(element).not.toBeNull();
      return element!;
    });
    expect(repositionCursor.style.getPropertyValue("--sc-drag-drop-keyboard-cursor-x")).toBe("54%");
    fireEvent.keyDown(repositionCursor, { code: "ArrowUp", key: "ArrowUp", shiftKey: true });
    expect(localAssessmentResponse(assessmentStore, problemId)).toEqual({
      placements: { marker000001: { x: 54, y: 60 } },
    });
    fireEvent.keyDown(repositionCursor, { code: "Escape", key: "Escape" });

    await waitFor(() =>
      expect(document.querySelector("[data-drag-drop-keyboard-cursor]")).toBeNull(),
    );
    expect(localAssessmentResponse(assessmentStore, problemId)).toEqual({
      placements: { marker000001: { x: 54, y: 60 } },
    });
    expect(screen.getByRole("status")).toHaveTextContent("London positioning cancelled");
    await waitFor(() => expect(placedLondon).toHaveFocus());

    const remove = screen.getByRole("button", { name: "Remove London" });
    remove.focus();
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(localAssessmentResponse(assessmentStore, problemId)).toEqual({ placements: {} }),
    );
    const returnedLondon = screen.getByRole("button", { name: "Select London for placement" });
    await waitFor(() => expect(returnedLondon).toHaveFocus());
    fireEvent.keyDown(returnedLondon, { code: "Space", key: " " });
    const replacementCursor = await waitFor(() => {
      const element = document.querySelector<HTMLElement>("[data-drag-drop-keyboard-cursor]");
      expect(element).not.toBeNull();
      return element!;
    });
    fireEvent.keyDown(replacementCursor, { code: "Enter", key: "Enter" });
    const reset = await screen.findByRole("button", { name: "Reset marker placements" });
    reset.focus();
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(localAssessmentResponse(assessmentStore, problemId)).toEqual({ placements: {} }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Select London for placement" })).toHaveFocus(),
    );
  });

  it("keeps the keyboard cursor and its focus ring inside the image at a corner", async () => {
    renderCourse({});
    const surface = await readySurface();
    surface.style.width = "400px";
    surface.style.height = "200px";
    const london = screen.getByRole("button", { name: "Select London for placement" });
    london.focus();
    fireEvent.keyDown(london, { code: "Enter", key: "Enter" });
    const cursor = await waitFor(() => {
      const element = document.querySelector<HTMLElement>("[data-drag-drop-keyboard-cursor]");
      expect(element).not.toBeNull();
      return element!;
    });
    cursor.style.transition = "none";
    for (let index = 0; index < 5; index += 1) {
      fireEvent.keyDown(cursor, { code: "ArrowLeft", key: "ArrowLeft", shiftKey: true });
      fireEvent.keyDown(cursor, { code: "ArrowUp", key: "ArrowUp", shiftKey: true });
    }
    await waitFor(() =>
      expect(cursor).toHaveAccessibleName(
        "Position London at approximately 0% horizontal, 0% vertical",
      ),
    );
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const surfaceRect = surface.getBoundingClientRect();
    const cursorRect = cursor.getBoundingClientRect();
    expect(surfaceRect.width).toBeGreaterThanOrEqual(400);
    expect(cursorRect.width).toBeGreaterThanOrEqual(48);
    expect(cursorRect.left - surfaceRect.left).toBeGreaterThanOrEqual(6);
    expect(cursorRect.top - surfaceRect.top).toBeGreaterThanOrEqual(6);
    expect(surfaceRect.right - cursorRect.right).toBeGreaterThanOrEqual(0);
    expect(surfaceRect.bottom - cursorRect.bottom).toBeGreaterThanOrEqual(0);
  });

  it("completes and submits through the shared assessment control using only the keyboard", async () => {
    const user = userEvent.setup();
    let runtime: AssessmentRuntimeController<"spatial-placement"> | null = null;
    const assessment: AssessmentPort = {
      type: "runtime",
      submit: vi.fn(async (request) =>
        assessmentProblemOutcome(
          { isCorrect: false, score: { scaled: 0 }, feedback: null, items: {} },
          { response: request.response },
        ),
      ),
    };
    renderCourse({
      assessment,
      courseContent: { ...content, markers: [content.markers[0]!] },
      onRuntime: (value) => {
        runtime = value;
      },
      submissionControls: true,
    });
    await readySurface();
    await waitFor(() => expect(runtime).not.toBeNull());

    const london = screen.getByRole("button", { name: "Select London for placement" });
    london.focus();
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(document.querySelector("[data-drag-drop-keyboard-cursor]")).not.toBeNull(),
    );
    await user.keyboard("{Enter}");
    const submit = await screen.findByRole("button", { name: "Submit" });
    await waitFor(() => expect(submit).toBeEnabled());
    submit.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(runtime?.problem?.state.submitted).toBe(true));
    expect(assessment.submit).toHaveBeenCalledTimes(1);
    expect(document.querySelector("[data-drag-drop-keyboard-cursor]")).toBeNull();
  });

  it("cancels an armed select-then-place operation with Escape", async () => {
    const user = userEvent.setup();
    let assessmentStore: AssessmentStoreApi | null = null;
    renderCourse({
      onStore: (store) => {
        assessmentStore = store;
      },
    });
    await readySurface();

    const london = screen.getByRole("button", { name: "Select London for placement" });
    await user.click(london);
    expect(london).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(london, { key: "Escape", code: "Escape" });

    expect(london).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("status")).toHaveTextContent("London selection cancelled");
    expect(localAssessmentResponse(assessmentStore, problemId)).toBeNull();
  });

  it("hydrates after presenter remount, retains locks and exposes no private answer data", async () => {
    const user = userEvent.setup();
    let assessmentStore: AssessmentStoreApi | null = null;
    let runtime: AssessmentRuntimeController<"spatial-placement"> | null = null;
    const assessment: AssessmentPort = {
      type: "runtime",
      submit: async (request) =>
        assessmentProblemOutcome(
          { isCorrect: false, score: { scaled: 0 }, feedback: null, items: {} },
          { response: request.response },
        ),
    };
    renderCourse({
      assessment,
      onRuntime: (value) => {
        runtime = value;
      },
      onStore: (store) => {
        assessmentStore = store;
      },
      remountable: true,
    });
    const currentRuntime = () => runtime as AssessmentRuntimeController<"spatial-placement"> | null;
    await waitFor(() => expect(currentRuntime()).not.toBeNull());
    const surface = await readySurface();
    surface.getBoundingClientRect = imageRect;
    await user.click(screen.getByRole("button", { name: "Select London for placement" }));
    fireEvent.click(surface, { clientX: 100, clientY: 100 });
    await waitFor(() => {
      expect(localAssessmentResponse(assessmentStore, problemId)).toEqual({
        placements: { marker000001: { x: 25, y: 50 } },
      });
    });

    await user.click(screen.getByRole("button", { name: "Toggle interaction" }));
    expect(screen.queryByLabelText("Drag and Drop response")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Toggle interaction" }));
    await readySurface();
    expect(
      screen.getByRole("button", { name: "Select placed London for repositioning" }),
    ).toBeTruthy();
    expect(currentRuntime()?.interaction.setPlacement("marker000002", { x: 75, y: 25 })).toEqual({
      status: "updated",
    });
    await waitFor(() => expect(currentRuntime()?.response.hasValue).toBe(true));

    await currentRuntime()?.actions.submit();
    await waitFor(() => expect(currentRuntime()?.problem?.interactionLocked).toBe(true));
    const before = localAssessmentResponse(assessmentStore, problemId);
    expect(currentRuntime()?.interaction.setPlacement("marker000001", { x: 80, y: 80 })).toEqual({
      status: "attempt-locked",
    });
    expect(localAssessmentResponse(assessmentStore, problemId)).toEqual(before);
    expect(document.body.innerHTML).not.toContain("correctPlacements");
    expect(document.body.innerHTML).not.toContain("centerX");
    expect(document.body.innerHTML).not.toContain("feedbackByMarkerId");
  });

  it("keeps placement controls unavailable when a resolved image cannot load", async () => {
    const user = userEvent.setup();
    const resolveMedia = vi
      .fn<(mediaId: string) => Promise<string>>()
      .mockResolvedValueOnce("data:image/png;base64,broken")
      .mockResolvedValue(TEST_IMAGE_SRC);
    renderCourse({
      resolveMedia,
    });

    await waitFor(() => {
      expect(document.querySelector("[data-spatial-image-surface]")).toHaveAttribute(
        "data-spatial-image-surface-state",
        "unavailable",
      );
    });
    expect(screen.getByRole("alert")).toHaveTextContent("background image is unavailable");
    expect(screen.getByRole("button", { name: "Select London for placement" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Retry image" }));
    await readySurface();
    expect(screen.getByRole("button", { name: "Select London for placement" })).toBeEnabled();
    expect(resolveMedia).toHaveBeenCalledTimes(2);
  });

  it("falls back per custom icon without blocking its labelled marker", async () => {
    const customContent: DragDropCourseContent = {
      ...content,
      markers: [
        {
          ...content.markers[0]!,
          visual: {
            kind: "custom",
            source: { mode: "managed", mediaId: "missing-icon" },
          },
        },
        content.markers[1]!,
      ],
    };
    renderCourse({
      courseContent: customContent,
      resolveMedia: async (mediaId) => {
        if (mediaId === "map-image") return TEST_IMAGE_SRC;
        throw new Error("icon unavailable");
      },
    });

    await readySurface();
    expect(screen.getByRole("button", { name: "Select London for placement" })).toBeEnabled();
    expect(document.querySelector("[data-custom-icon-fallback]")).not.toBeNull();
  });

  it("uses one response across inline and expanded presentations and restores trigger focus", async () => {
    const user = userEvent.setup();
    let assessmentStore: AssessmentStoreApi | null = null;
    renderCourse({
      onStore: (store) => {
        assessmentStore = store;
      },
    });
    const inline = document.querySelector<HTMLElement>("[data-drag-drop-presentation='inline']");
    if (!inline) throw new Error("Expected inline Drag and Drop presentation.");
    const inlineSurface = await readySurface();
    inlineSurface.getBoundingClientRect = imageRect;
    await user.click(within(inline).getByRole("button", { name: "Select London for placement" }));
    fireEvent.click(inlineSurface, { clientX: 100, clientY: 100 });
    await waitFor(() =>
      expect(localAssessmentResponse(assessmentStore, problemId)).toEqual({
        placements: { marker000001: { x: 25, y: 50 } },
      }),
    );

    const inlineParis = within(inline).getByRole("button", { name: "Select Paris for placement" });
    inlineParis.focus();
    fireEvent.keyDown(inlineParis, { code: "Enter", key: "Enter" });
    expect(inline.querySelector("[data-drag-drop-keyboard-cursor]")).not.toBeNull();

    const expand = within(inline).getByRole("button", { name: "Expand Drag and Drop" });
    await user.click(expand);
    const expanded = await waitFor(() => {
      const element = document.querySelector<HTMLElement>(
        "[data-drag-drop-presentation='expanded']",
      );
      expect(element).not.toBeNull();
      return element!;
    });
    expect(
      within(expanded).getByRole("button", { name: "Select placed London for repositioning" }),
    ).toBeTruthy();
    expect(
      within(expanded).getByRole("button", { name: "Select Paris for placement" }),
    ).toHaveAttribute("aria-pressed", "true");
    const expandedSurface = expanded.querySelector<HTMLElement>("[data-spatial-image-surface]");
    if (!expandedSurface) throw new Error("Expected expanded spatial image surface.");
    await waitFor(() =>
      expect(expandedSurface).toHaveAttribute("data-spatial-image-surface-state", "ready"),
    );
    expandedSurface.getBoundingClientRect = imageRect;
    const expandedCursor = await waitFor(() => {
      const element = expanded.querySelector<HTMLElement>("[data-drag-drop-keyboard-cursor]");
      expect(element).not.toBeNull();
      return element!;
    });
    await waitFor(() => expect(expandedCursor).toHaveFocus());
    for (let index = 0; index < 5; index += 1) {
      fireEvent.keyDown(expandedCursor, { code: "ArrowRight", key: "ArrowRight" });
      fireEvent.keyDown(expandedCursor, { code: "ArrowUp", key: "ArrowUp" });
    }
    fireEvent.keyDown(expandedCursor, { code: "Enter", key: "Enter" });
    await waitFor(() =>
      expect(localAssessmentResponse(assessmentStore, problemId)).toEqual({
        placements: {
          marker000001: { x: 25, y: 50 },
          marker000002: { x: 75, y: 25 },
        },
      }),
    );
    await waitFor(() =>
      expect(
        within(expanded).getByRole("button", { name: /Placed Paris, 2 of 2\. Drag to reposition/ }),
      ).toHaveFocus(),
    );

    await user.click(
      screen.getByRole("button", { name: "Close expanded Drag and Drop workspace" }),
    );
    await waitFor(() => expect(expand).toHaveFocus());
    expect(
      within(inline).getByRole("button", { name: "Select placed Paris for repositioning" }),
    ).toBeTruthy();

    fireEvent.click(expand);
    const reopened = document.querySelector<HTMLElement>(
      "[data-drag-drop-presentation='expanded']",
    );
    if (!reopened) throw new Error("Expected reopened expanded Drag and Drop presentation.");
    expect(
      within(reopened).getByRole("button", { name: "Select placed London for repositioning" }),
    ).toBeDisabled();
    const reopenedImage = reopened.querySelector("img");
    if (!reopenedImage) throw new Error("Expected reopened expanded image.");
    fireEvent.load(reopenedImage);
    await waitFor(() =>
      expect(
        within(reopened).getByRole("button", { name: "Select placed London for repositioning" }),
      ).toBeEnabled(),
    );
    const beforeCollapse = localAssessmentResponse(assessmentStore, problemId);
    const reopenedLondon = within(reopened).getByRole("button", {
      name: /Placed London, 1 of 2\. Drag to reposition/,
    });
    reopenedLondon.focus();
    fireEvent.keyDown(reopenedLondon, { code: "Enter", key: "Enter" });
    await waitFor(() =>
      expect(reopened.querySelector("[data-drag-drop-keyboard-cursor]")).not.toBeNull(),
    );
    await user.click(
      screen.getByRole("button", { name: "Close expanded Drag and Drop workspace" }),
    );
    await waitFor(() => expect(expand).toHaveFocus());
    expect(document.querySelector("[data-drag-drop-keyboard-cursor]")).toBeNull();
    expect(localAssessmentResponse(assessmentStore, problemId)).toEqual(beforeCollapse);
  });
});

function RuntimeCapture({
  onRuntime,
}: {
  onRuntime?: (runtime: AssessmentRuntimeController<"spatial-placement"> | null) => void;
}) {
  const runtime = useAssessmentRuntimeById(assessmentTargetId, "spatial-placement");
  onRuntime?.(runtime);
  return null;
}

function SubmissionControls() {
  const runtime = useAssessmentRuntimeById(assessmentTargetId, "spatial-placement");
  return (
    <RuntimeAssessmentControls
      problem={runtime?.problem ?? null}
      maxAttempts={runtime?.problem?.state.maxAttempts ?? null}
    />
  );
}

function renderCourse({
  assessment = null,
  courseContent = content,
  feedbackMode = "on_submit",
  maxAttempts = null,
  onRuntime,
  onStore,
  remountable = false,
  resolveMedia = async () => TEST_IMAGE_SRC,
  submissionControls = false,
}: {
  assessment?: AssessmentPort | null;
  courseContent?: DragDropCourseContent;
  feedbackMode?: "immediate" | "on_submit";
  maxAttempts?: number | null;
  onRuntime?: (runtime: AssessmentRuntimeController<"spatial-placement"> | null) => void;
  onStore?: (store: AssessmentStoreApi | null) => void;
  remountable?: boolean;
  resolveMedia?: (mediaId: string) => Promise<string>;
  submissionControls?: boolean;
}) {
  const dragRoot = elementWithRect({ left: 0, top: 0, width: 800, height: 600 });
  const overlayHost = elementWithRect({ left: 0, top: 0, width: 800, height: 600 });
  return render(
    <TestInteractionDragEnvironment
      collisionBoundary={dragRoot}
      coordinateKind="viewport"
      overlayHost={overlayHost}
      root={dragRoot}
    >
      {createAssessmentRuntimeTestRoot({
        assessment,
        media: {
          resolve: resolveMedia,
          upload: async () => {
            throw new Error("Upload is not used in Course.");
          },
        },
        ...(onStore ? { onStore } : {}),
        children: (
          <>
            <DragDropTargetRegistration
              courseContent={courseContent}
              feedbackMode={feedbackMode}
              maxAttempts={maxAttempts}
            />
            <RuntimeCapture {...(onRuntime ? { onRuntime } : {})} />
            {submissionControls ? <SubmissionControls /> : null}
            {remountable ? (
              <RemountableInteraction courseContent={courseContent} />
            ) : (
              <DragDropInlineCourseWorkspace
                assessmentTargetId={assessmentTargetId}
                content={courseContent}
              />
            )}
          </>
        ),
      })}
    </TestInteractionDragEnvironment>,
    { container: dragRoot },
  );
}

async function startPointerDrag(
  source: HTMLElement,
  pointerType: "mouse" | "touch",
  pointerId = 1,
) {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  source.focus();
  fireEvent.pointerDown(source, {
    button: 0,
    buttons: 1,
    clientX: 40,
    clientY: 40,
    isPrimary: true,
    pointerId,
    pointerType,
  });
  await movePointer({ x: 50, y: 50 }, pointerType, pointerId);
  await waitFor(() =>
    expect(document.querySelector("[data-interaction-drag-overlay]")).not.toBeNull(),
  );
}

async function movePointer(
  point: Readonly<{ x: number; y: number }>,
  pointerType: "mouse" | "touch",
  pointerId = 1,
) {
  fireEvent.pointerMove(document, {
    button: 0,
    buttons: 1,
    clientX: point.x,
    clientY: point.y,
    isPrimary: true,
    pointerId,
    pointerType,
  });
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function finishPointerDrag(
  point: Readonly<{ x: number; y: number }>,
  pointerType: "mouse" | "touch",
  pointerId = 1,
) {
  fireEvent.pointerUp(document, {
    buttons: 0,
    clientX: point.x,
    clientY: point.y,
    isPrimary: true,
    pointerId,
    pointerType,
  });
}

function elementWithRect(input: { left: number; top: number; width: number; height: number }) {
  const element = document.createElement("div");
  element.getBoundingClientRect = () => rect(input);
  document.body.append(element);
  dragTestElements.push(element);
  return element;
}

function rect(input: { left: number; top: number; width: number; height: number }): DOMRect {
  return {
    bottom: input.top + input.height,
    height: input.height,
    left: input.left,
    right: input.left + input.width,
    top: input.top,
    width: input.width,
    x: input.left,
    y: input.top,
    toJSON: () => ({}),
  } as DOMRect;
}

async function readySurface() {
  await waitFor(() => {
    expect(document.querySelector("[data-spatial-image-surface]")).toHaveAttribute(
      "data-spatial-image-surface-state",
      "ready",
    );
  });
  const surface = document.querySelector<HTMLElement>("[data-spatial-image-surface]");
  if (!surface) throw new Error("Expected a ready spatial image surface.");
  return surface;
}

function imageRect(): DOMRect {
  return {
    x: 0,
    y: 0,
    width: 400,
    height: 200,
    top: 0,
    right: 400,
    bottom: 200,
    left: 0,
    toJSON: () => ({}),
  };
}
