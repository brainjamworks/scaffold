// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { useMemo } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { pageAssessmentExperience } from "@/editor/assessment/shared/model/assessment-capability";
import {
  useAssessmentRuntimeById,
  type AssessmentRuntimeController,
} from "@/editor/assessment/shared/runtime/use-assessment-runtime";
import { useAssessmentProblemFacade } from "@/runtime/assessment/runtime-facade";
import {
  createAssessmentRuntimeTestRoot,
  localAssessmentResponse,
} from "@/runtime/assessment/test-utils";
import type { AssessmentStoreApi } from "@/runtime/assessment/types";
import { TestInteractionDragEnvironment } from "@/editor/interactions/drag/testing/TestInteractionDragEnvironment";

import { DragDropInlineCourseWorkspace } from "@/editor/assessment/drag-drop/drag-drop-course-interaction";
import type { DragDropCourseContent } from "@/editor/assessment/drag-drop/drag-drop-course-content";
import { dragDropResponseCodec, toDragDropContractResponse } from "@/editor/assessment/drag-drop/drag-drop-response-codec";

const assessmentTargetId = "target000001";
const problemId = `artifact:artifact-1/block:${assessmentTargetId}`;
const TEST_IMAGE_SRC =
  "data:image/gif;base64,R0lGODlhAgABAPAAAP///wAAACH5BAAAAAAALAAAAAACAAEAAAICBAoAOw==";

const points = [
  { x: 0, y: 10 },
  { x: 100, y: 10 },
  { x: 0, y: 100 },
  { x: 100, y: 100 },
  { x: 50, y: 50 },
  { x: 50, y: 50 },
  { x: 25, y: 25 },
  { x: 75, y: 25 },
  { x: 25, y: 75 },
  { x: 75, y: 75 },
  { x: 50, y: 10 },
  { x: 50, y: 100 },
] as const;

const content: DragDropCourseContent = {
  image: { mode: "managed", mediaId: "map-image", alt: "Non-square transit map" },
  imageAspectRatio: 2,
  defaultMarkerVisual: { kind: "preset", preset: "dot" },
  markers: points.map((_, index) => ({
    id: `marker${String(index + 1).padStart(6, "0")}` as never,
    label:
      index === points.length - 1
        ? "A very long terminal marker label at the lower image edge"
        : `Marker ${index + 1}`,
    visual: { kind: "preset" as const, preset: "dot" as const },
  })),
  accessibleLegend: "Place every transit marker on the map.",
};

class ResizeObserverStub implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let nextPointerId = 1;

beforeEach(() => {
  nextPointerId = 1;
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Drag and Drop canonical input parity", () => {
  it.each(
    (["mouse", "touch", "keyboard"] as const).flatMap((mode) => [
      { mode, operatedPoint: "edge", missingIndex: 11 },
      { mode, operatedPoint: "overlap", missingIndex: 4 },
    ]),
  )(
    "stores the same authored-order response with $mode at an operated $operatedPoint point",
    async ({ missingIndex, mode }) => {
      const consoleError = vi.spyOn(console, "error");
      const expected = points.map((point, index) => ({
        ...point,
        markerId: `marker${String(index + 1).padStart(6, "0")}`,
      }));
      expect(JSON.stringify(await completeBy(mode, missingIndex))).toBe(JSON.stringify(expected));
      expect(consoleError.mock.calls.flat().join(" ")).not.toContain(
        "useInsertionEffect must not schedule updates",
      );
    },
    30_000,
  );

  it("removes only keyboard cursor interpolation for reduced motion", () => {
    const rule = requiredStyleRule(
      ".sc-course-drag-drop-keyboard-cursor",
      "(prefers-reduced-motion: reduce)",
    );
    expect(rule.style.transition).toBe("none");
    expect(requiredStyleRule(".sc-course-drag-drop-keyboard-cursor").style.position).toBe(
      "absolute",
    );
  });
});

async function completeBy(mode: "mouse" | "touch" | "keyboard", missingIndex: number) {
  let store: AssessmentStoreApi | null = null;
  let runtime: AssessmentRuntimeController<"spatial-placement"> | null = null;
  const dragRoot = elementWithRect({ left: 0, top: 0, width: 1400, height: 900 });
  const overlayHost = elementWithRect({ left: 0, top: 0, width: 1400, height: 900 });
  const rendered = render(
    <TestInteractionDragEnvironment
      collisionBoundary={dragRoot}
      coordinateKind="viewport"
      overlayHost={overlayHost}
      root={dragRoot}
    >
      {createAssessmentRuntimeTestRoot({
        media: {
          resolve: async () => TEST_IMAGE_SRC,
          upload: async () => {
            throw new Error("Upload is not used in Course parity tests.");
          },
        },
        onStore: (value) => {
          store = value;
        },
        children: (
          <>
            <TargetRegistration />
            <RuntimeCapture
              onRuntime={(value) => {
                runtime = value;
              }}
            />
            <DragDropInlineCourseWorkspace
              assessmentTargetId={assessmentTargetId}
              content={content}
            />
          </>
        ),
      })}
    </TestInteractionDragEnvironment>,
    { container: dragRoot },
  );

  const inline = requiredPresentation("inline");
  const inlineSurface = await readySurface(inline);
  let inlineRect = rect({ left: 20, top: 20, width: 300, height: 150 });
  inlineSurface.getBoundingClientRect = () => inlineRect;
  await waitFor(() => expect(runtime).not.toBeNull());
  await act(async () => {
    (runtime as AssessmentRuntimeController<"spatial-placement"> | null)?.response.setValue({
      placements: Object.fromEntries(
        content.markers.flatMap((marker, index) =>
          index === missingIndex ? [] : [[marker.id, points[index]!]],
        ),
      ),
    });
  });
  await waitFor(() =>
    expect(
      within(inline).getByRole("button", {
        name: `Select ${content.markers[missingIndex]!.label} for placement`,
      }),
    ).toBeEnabled(),
  );
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  inlineRect = rect({ left: 30, top: 30, width: 240, height: 120 });
  await place(
    mode,
    inline,
    content.markers[missingIndex]!.label,
    points[missingIndex]!,
    inlineRect,
  );

  const expand = within(inline).getByRole("button", { name: "Expand" });
  expand.focus();
  fireEvent.keyDown(expand, { code: "Enter", key: "Enter" });
  fireEvent.click(expand);
  const expanded = await waitFor(() => requiredPresentation("expanded"));
  const expandedSurface = await readySurface(expanded);
  expandedSurface.getBoundingClientRect = () =>
    rect({ left: 500, top: 300, width: 500, height: 250 });
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  const local = localAssessmentResponse(store, problemId);
  const canonical = toDragDropContractResponse(local, interaction()).placements;
  await waitFor(() => {
    const heading = document.querySelector<HTMLElement>(".sc-course-drag-drop-workspace__title");
    expect(heading).not.toBeNull();
    expect(heading).toHaveFocus();
  });
  expect(
    within(expanded).getByRole("button", {
      name: /Placed A very long terminal marker label at the lower image edge, 12 of 12/,
    }).parentElement,
  ).toHaveAttribute("data-edge-y", "bottom");
  const overlapMarker = within(expanded).getByRole("button", {
    name: /Placed Marker 5, 5 of 12\. Drag to reposition/,
  }).parentElement;
  expect(overlapMarker?.style.left).toBe("50%");
  expect(overlapMarker?.style.top).toBe("50%");
  const overlappingMarker = within(expanded).getByRole("button", {
    name: /Placed Marker 6, 6 of 12\. Drag to reposition/,
  }).parentElement;
  expect(overlappingMarker?.style.left).toBe("50%");
  expect(overlappingMarker?.style.top).toBe("50%");
  expect(within(expanded).getByRole("list", { name: "Placed markers" })).toHaveTextContent(
    "Marker 1 placed.",
  );

  rendered.unmount();
  dragRoot.remove();
  overlayHost.remove();
  return canonical;
}

async function place(
  mode: "mouse" | "touch" | "keyboard",
  presentation: HTMLElement,
  label: string,
  point: Readonly<{ x: number; y: number }>,
  surfaceRect: DOMRect,
) {
  const control = within(presentation).getByRole("button", {
    name: `Select ${label} for placement`,
  });
  await waitFor(() => expect(control).toBeEnabled());
  if (mode === "keyboard") {
    control.focus();
    fireEvent.keyDown(control, { code: "Enter", key: "Enter" });
    const cursor = await waitFor(() => {
      const element = presentation.querySelector<HTMLElement>("[data-drag-drop-keyboard-cursor]");
      expect(element).not.toBeNull();
      return element!;
    });
    moveKeyboardCursor(cursor, point);
    fireEvent.keyDown(cursor, { code: "Enter", key: "Enter" });
  } else {
    const pointerId = await startPointerDrag(control, mode);
    const clientPoint = {
      x: surfaceRect.left + (surfaceRect.width * point.x) / 100,
      y: surfaceRect.top + (surfaceRect.height * point.y) / 100,
    };
    await movePointer(clientPoint, mode, pointerId);
    fireEvent.pointerUp(document, {
      buttons: 0,
      clientX: clientPoint.x,
      clientY: clientPoint.y,
      isPrimary: true,
      pointerId,
      pointerType: mode,
    });
    await waitFor(() =>
      expect(document.querySelector("[data-interaction-drag-overlay]")).toBeNull(),
    );
  }
  await waitFor(() =>
    expect(
      within(presentation).getByRole("button", {
        name: new RegExp(`^Placed ${label},`),
      }),
    ).toBeVisible(),
  );
}

function moveKeyboardCursor(cursor: HTMLElement, point: Readonly<{ x: number; y: number }>) {
  const horizontal = point.x < 50 ? "ArrowLeft" : "ArrowRight";
  const vertical = point.y < 50 ? "ArrowUp" : "ArrowDown";
  for (let index = 0; index < Math.floor(Math.abs(point.x - 50) / 10); index += 1) {
    fireEvent.keyDown(cursor, { code: horizontal, key: horizontal, shiftKey: true });
  }
  for (let index = 0; index < Math.floor(Math.abs(point.y - 50) / 10); index += 1) {
    fireEvent.keyDown(cursor, { code: vertical, key: vertical, shiftKey: true });
  }
  if (Math.abs(point.x - 50) % 10 === 5) {
    fireEvent.keyDown(cursor, { code: horizontal, key: horizontal });
  }
  if (Math.abs(point.y - 50) % 10 === 5) {
    fireEvent.keyDown(cursor, { code: vertical, key: vertical });
  }
}

async function startPointerDrag(source: HTMLElement, pointerType: "mouse" | "touch") {
  const pointerId = nextPointerId;
  nextPointerId += 1;
  const sourceLabel = source.textContent?.trim();
  if (!sourceLabel) throw new Error("Expected a labelled Drag and Drop source.");
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
  await waitFor(() => {
    const overlay = document.querySelector("[data-interaction-drag-overlay]");
    expect(overlay).not.toBeNull();
    expect(overlay).toHaveTextContent(sourceLabel);
  });
  return pointerId;
}

async function movePointer(
  point: Readonly<{ x: number; y: number }>,
  pointerType: "mouse" | "touch",
  pointerId: number,
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

function TargetRegistration() {
  const registration = useMemo(() => {
    const assessmentInteraction = interaction();
    return {
      authoredBlockId: assessmentTargetId,
      targetId: assessmentTargetId,
      interactionKind: "spatial-placement" as const,
      response: {
        ...dragDropResponseCodec,
        toContractResponse: (response: unknown) =>
          dragDropResponseCodec.toContractResponse(response, assessmentInteraction),
        fromContractResponse: (
          response: Parameters<typeof dragDropResponseCodec.fromContractResponse>[0],
        ) => dragDropResponseCodec.fromContractResponse(response, assessmentInteraction),
        hasResponse: (response: unknown) =>
          dragDropResponseCodec.hasResponse(response, assessmentInteraction),
      },
      config: {
        experience: pageAssessmentExperience,
        settings: {
          feedbackMode: "on_submit" as const,
          isGraded: true,
          showAnswer: true,
          points: 1,
          maxAttempts: null,
        },
        hintsTotal: 0,
        learningEventDefinition: { interaction: assessmentInteraction },
      },
    };
  }, []);
  useAssessmentProblemFacade(registration);
  return null;
}

function RuntimeCapture({
  onRuntime,
}: {
  readonly onRuntime: (runtime: AssessmentRuntimeController<"spatial-placement"> | null) => void;
}) {
  onRuntime(useAssessmentRuntimeById(assessmentTargetId, "spatial-placement"));
  return null;
}

function interaction() {
  return {
    kind: "spatial-placement" as const,
    markers: content.markers.map(({ id, label }) => ({ id, label })),
  };
}

function requiredPresentation(presentation: "inline" | "expanded") {
  const element = document.querySelector<HTMLElement>(
    `[data-drag-drop-presentation="${presentation}"]`,
  );
  if (!element) throw new Error(`Expected ${presentation} Drag and Drop presentation.`);
  return element;
}

async function readySurface(presentation: HTMLElement) {
  await waitFor(() =>
    expect(presentation.querySelector("[data-spatial-image-surface]")).toHaveAttribute(
      "data-spatial-image-surface-state",
      "ready",
    ),
  );
  const surface = presentation.querySelector<HTMLElement>("[data-spatial-image-surface]");
  if (!surface) throw new Error("Expected a ready spatial image surface.");
  return surface;
}

function elementWithRect(input: { left: number; top: number; width: number; height: number }) {
  const element = document.createElement("div");
  element.getBoundingClientRect = () => rect(input);
  document.body.append(element);
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

function requiredStyleRule(selector: string, mediaCondition?: string): CSSStyleRule {
  for (const sheet of Array.from(document.styleSheets)) {
    const rule = findStyleRule(sheet.cssRules, selector, mediaCondition);
    if (rule) return rule;
  }
  throw new Error(
    `Expected a CSS rule for ${selector}${mediaCondition ? ` in ${mediaCondition}` : ""}.`,
  );
}

function findStyleRule(
  rules: CSSRuleList,
  selector: string,
  mediaCondition?: string,
): CSSStyleRule | undefined {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) {
      if (mediaCondition === undefined && rule.selectorText === selector) return rule;
      continue;
    }
    if (rule instanceof CSSMediaRule && rule.conditionText === mediaCondition) {
      const nested = findStyleRule(rule.cssRules, selector);
      if (nested) return nested;
    }
    if ("cssRules" in rule) {
      const nested = findStyleRule((rule as CSSGroupingRule).cssRules, selector, mediaCondition);
      if (nested) return nested;
    }
  }
  return undefined;
}
