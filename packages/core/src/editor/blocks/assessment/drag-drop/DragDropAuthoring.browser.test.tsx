// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type {
  DragDropCanvasData,
  DragDropPrivateAssessment,
  MarkerVisual,
} from "@scaffold/contracts";

import { AppThemeProvider } from "@/theme/app/AppThemeProvider";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";

import { DragDropAuthoringCanvas } from "./drag-drop-canvas-authoring";
import {
  decodeImage,
  dragDropConfiguration,
  expectedAuthoringIssue,
  managedCustomIconIds,
  resolveDragDropCustomIconSources,
} from "./drag-drop-authoring-extension";

const TEST_IMAGE_SRC =
  "data:image/gif;base64,R0lGODlhAgABAPAAAP///wAAACH5BAAAAAAALAAAAAACAAEAAAICBAoAOw==";

class ResizeObserverStub implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => vi.stubGlobal("ResizeObserver", ResizeObserverStub));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Drag and Drop authoring", () => {
  it("treats a settled click on empty canvas as a deselect, not a creation", async () => {
    const onCreateMarker = vi.fn(() => "marker000009" as never);
    const { container } = renderCanvas({ onCreateMarker });
    await prepareImage(container);

    const surface = spatialSurface(container);
    // Hotspot idiom: a press that never grows past the minimum draw radius
    // creates nothing.
    fireEvent.pointerDown(surface, { button: 0, clientX: 300, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 300, clientY: 150, pointerId: 1 });

    expect(onCreateMarker).not.toHaveBeenCalled();
  });

  it("draws the acceptance zone by dragging on empty canvas", async () => {
    const onCreateMarker = vi.fn(() => "marker000010" as never);
    const { container } = renderCanvas({ onCreateMarker });
    await prepareImage(container);

    const surface = spatialSurface(container);
    // Press at image centre (300,150 -> 50%,50%), drag 80px right (-> 20% of width).
    fireEvent.pointerDown(surface, { button: 0, clientX: 300, clientY: 150, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 380, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 380, clientY: 150, pointerId: 1 });

    expect(onCreateMarker).toHaveBeenCalledWith(
      { label: "Marker 1", visualOverride: null },
      { kind: "circle", centerX: 50, centerY: 50, radius: 20 },
    );
  });

  it("renders acceptance zones in the image coordinate system, separate from marker controls", async () => {
    const marker = { id: "marker000001" as never, label: "London", visualOverride: null };
    const { container } = renderCanvas({ markers: [marker] });
    await prepareImage(container);

    const overlay = container.querySelector<SVGSVGElement>(".sc-app-drag-drop-placement-overlay");
    const casing = overlay?.querySelector<SVGCircleElement>(
      ".sc-app-drag-drop-placement-zone__contrast",
    );
    const zone = overlay?.querySelector<SVGCircleElement>("[data-authoring-placement-zone]");
    expect(overlay).not.toBeNull();
    expect(overlay).toHaveAttribute("viewBox", "0 0 2 1");
    expect(casing).not.toBeNull();
    expect(casing).toHaveAttribute("cx", "0");
    expect(casing).toHaveAttribute("cy", "0.5");
    expect(casing).toHaveAttribute("r", "0.08");
    expect(zone).toHaveAttribute("cx", "0");
    expect(zone).toHaveAttribute("cy", "0.5");
    expect(zone).toHaveAttribute("r", "0.08");
    expect(container.querySelector(".sc-app-drag-drop-correct-placement")).toBeNull();
    const markerButton = container.querySelector<HTMLElement>("[data-authoring-marker-id]");
    const markerPaint = container.querySelector<HTMLElement>("[data-authoring-marker-paint-id]");
    expect(markerButton).not.toBeNull();
    expect(markerPaint).not.toBeNull();
    expect(markerButton?.style.getPropertyValue("--sc-drag-drop-marker-x")).toBe("0%");
    expect(markerButton?.style.getPropertyValue("--sc-drag-drop-marker-y")).toBe("50%");
    expect(getComputedStyle(markerButton!).left).toBe("22px");
    expect(getComputedStyle(markerButton!).width).toBe("44px");
    expect(markerPaint?.style.getPropertyValue("--sc-drag-drop-marker-x")).toBe("0%");
    expect(markerPaint?.style.getPropertyValue("--sc-drag-drop-marker-y")).toBe("50%");
    expect(getComputedStyle(markerPaint!).left).toBe("0px");
    expect(markerPaint?.querySelector('[data-marker-preset="dot"] svg')).not.toBeNull();
  });

  it("moves a marker by dragging it past the threshold and commits on release", async () => {
    const marker = { id: "marker000001" as never, label: "London", visualOverride: null };
    const onSetCorrectPlacement = vi.fn();
    const { container } = renderCanvas({ markers: [marker], onSetCorrectPlacement });
    await prepareImage(container);

    const surface = spatialSurface(container);
    const markerButton = container.querySelector<HTMLElement>("[data-authoring-marker-id]");
    expect(markerButton).not.toBeNull();
    // Real pointer streams bubble from the marker to the surface handler.
    fireEvent.pointerDown(markerButton!, { button: 0, clientX: 100, clientY: 150, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 300, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 300, clientY: 150, pointerId: 1 });

    expect(onSetCorrectPlacement).toHaveBeenCalledWith(marker.id, {
      kind: "circle",
      centerX: 50,
      centerY: 50,
      radius: 4,
    });
  });

  it("selects a marker with a settled click and resizes via the ring handle", async () => {
    const marker = { id: "marker000001" as never, label: "London", visualOverride: null };
    const onSetCorrectPlacement = vi.fn();
    const { container } = renderCanvas({ markers: [marker], onSetCorrectPlacement });
    await prepareImage(container);

    const surface = spatialSurface(container);
    const markerButton = container.querySelector<HTMLElement>("[data-authoring-marker-id]")!;
    fireEvent.pointerDown(markerButton, { button: 0, clientX: 100, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 100, clientY: 150, pointerId: 1 });

    const handle = await waitFor(() => {
      const found = container.querySelector<HTMLElement>("[data-authoring-resize-handle]");
      expect(found).not.toBeNull();
      return found!;
    });

    const markerPaint = container.querySelector<HTMLElement>("[data-authoring-marker-paint-id]")!;
    const markerVisual = markerPaint.querySelector<HTMLElement>(".sc-app-drag-drop-marker__visual");
    const markerNumber = markerPaint.querySelector<HTMLElement>(".sc-app-drag-drop-marker__number");
    expect(getComputedStyle(markerVisual!).filter).not.toBe("none");
    expect(getComputedStyle(markerNumber!).boxShadow).not.toBe("none");
    expect(Number.parseFloat(getComputedStyle(handle, "::before").width)).toBeGreaterThanOrEqual(9);
    expect(Number.parseFloat(getComputedStyle(handle, "::before").borderTopWidth)).toBeGreaterThan(
      0,
    );

    fireEvent.pointerDown(handle, { button: 0, clientX: 116, clientY: 150, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 180, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 180, clientY: 150, pointerId: 1 });

    expect(onSetCorrectPlacement).toHaveBeenCalledWith(marker.id, {
      kind: "circle",
      centerX: 0,
      centerY: 50,
      radius: 20,
    });
  });

  it("discards an interrupted resize instead of committing a stale draft", async () => {
    const marker = { id: "marker000001" as never, label: "London", visualOverride: null };
    const onSetCorrectPlacement = vi.fn();
    const { container } = renderCanvas({ markers: [marker], onSetCorrectPlacement });
    await prepareImage(container);

    const surface = spatialSurface(container);
    const markerButton = container.querySelector<HTMLElement>("[data-authoring-marker-id]")!;
    fireEvent.pointerDown(markerButton, { button: 0, clientX: 100, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 100, clientY: 150, pointerId: 1 });
    const handle = await waitFor(() =>
      container.querySelector<HTMLElement>("[data-authoring-resize-handle]"),
    );
    if (!handle) throw new Error("Expected a Drag and Drop resize handle.");

    fireEvent.pointerDown(handle, { button: 0, clientX: 116, clientY: 150, pointerId: 2 });
    fireEvent.pointerMove(surface, { clientX: 180, clientY: 150, pointerId: 2 });
    fireEvent.pointerCancel(surface, { clientX: 180, clientY: 150, pointerId: 2 });
    fireEvent.pointerMove(surface, { clientX: 220, clientY: 150, pointerId: 2 });
    fireEvent.pointerUp(surface, { clientX: 220, clientY: 150, pointerId: 2 });

    expect(onSetCorrectPlacement).not.toHaveBeenCalled();
  });

  it("edits default and marker appearance from the workspace inspector", async () => {
    const user = userEvent.setup();
    const marker = {
      id: "marker000001" as never,
      label: "London",
      visualOverride: { kind: "preset", preset: "pin" } as const,
    };
    const onSetDefaultMarkerVisual = vi.fn();
    const onUpdateMarker = vi.fn();
    const customVisual = {
      kind: "custom",
      source: { mode: "managed", mediaId: "custom-icon" },
    } as const satisfies MarkerVisual;
    const onRequestCustomIcon = vi.fn((apply: (visual: typeof customVisual) => void) =>
      apply(customVisual),
    );
    renderCanvas({
      markers: [marker],
      presentation: "expanded",
      onRequestCustomIcon,
      onSetDefaultMarkerVisual,
      onUpdateMarker,
    });

    await user.click(screen.getByRole("combobox", { name: "Default marker appearance" }));
    await user.click(await screen.findByRole("option", { name: "Check" }));
    expect(onSetDefaultMarkerVisual).toHaveBeenCalledWith({ kind: "preset", preset: "check" });

    // The first marker row is auto-selected in the expanded inspector.
    const appearance = screen.getByRole("combobox", { name: "Appearance" });
    await user.click(appearance);
    await user.click(await screen.findByRole("option", { name: "Use default" }));
    expect(onUpdateMarker).toHaveBeenCalledWith(marker.id, { visualOverride: null });
    await user.click(appearance);
    await user.click(await screen.findByRole("option", { name: "Flag" }));
    expect(onUpdateMarker).toHaveBeenCalledWith(marker.id, {
      visualOverride: { kind: "preset", preset: "flag" },
    });
    await user.click(appearance);
    await user.click(await screen.findByRole("option", { name: "Custom icon" }));
    expect(onUpdateMarker).toHaveBeenLastCalledWith(marker.id, { visualOverride: customVisual });
  });

  it("keeps inspector label and tolerance edits transient until a valid commit", () => {
    const marker = { id: "marker000001" as never, label: "London", visualOverride: null };
    const onUpdateMarker = vi.fn();
    const onSetCorrectPlacement = vi.fn();
    renderCanvas({
      markers: [marker],
      presentation: "expanded",
      onSetCorrectPlacement,
      onUpdateMarker,
    });

    const label = screen.getByRole("textbox", { name: "Label" });
    fireEvent.change(label, { target: { value: "" } });
    expect(onUpdateMarker).not.toHaveBeenCalled();
    fireEvent.blur(label);
    expect(label).toHaveValue("London");
    fireEvent.change(label, { target: { value: "Greater London" } });
    fireEvent.keyDown(label, { key: "Enter" });
    expect(onUpdateMarker).toHaveBeenCalledWith(marker.id, { label: "Greater London" });

    const radius = screen.getByRole("spinbutton", { name: "Tolerance (% of image width)" });
    fireEvent.change(radius, { target: { value: "" } });
    expect(onSetCorrectPlacement).not.toHaveBeenCalled();
    fireEvent.blur(radius);
    expect(radius).toHaveValue(4);
    fireEvent.change(radius, { target: { value: "6.5" } });
    fireEvent.keyDown(radius, { key: "Enter" });
    expect(onSetCorrectPlacement).toHaveBeenCalledWith(marker.id, {
      kind: "circle",
      centerX: 0,
      centerY: 50,
      radius: 6.5,
    });
  });

  it("reorders and deletes markers from the inspector row actions", async () => {
    const user = userEvent.setup();
    const markers = Array.from({ length: 12 }, (_, index) => ({
      id: `marker${String(index + 1).padStart(6, "0")}` as never,
      label: `Marker ${index + 1}`,
      visualOverride:
        index === 0
          ? ({ kind: "custom", source: { mode: "managed", mediaId: "missing-icon" } } as const)
          : null,
    }));
    const onReorderMarkers = vi.fn();
    const onDeleteMarker = vi.fn();
    renderCanvas({ markers, presentation: "expanded", onReorderMarkers, onDeleteMarker });

    expect(screen.getAllByRole("listitem")).toHaveLength(12);
    expect(screen.getAllByTestId("custom-marker-fallback").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Select marker 2: Marker 2" }));
    await user.click(screen.getByRole("button", { name: "Move marker 2 earlier" }));
    expect(onReorderMarkers).toHaveBeenCalledWith([
      markers[1]!.id,
      markers[0]!.id,
      ...markers.slice(2).map(({ id }) => id),
    ]);
    await user.click(screen.getByRole("button", { name: "Delete marker 2" }));
    expect(onDeleteMarker).toHaveBeenCalledWith(markers[1]!.id);
  });

  it("shows the empty state with a single add-image action before a background is ready", async () => {
    const user = userEvent.setup();
    const onRequestBackground = vi.fn();
    render(
      <DragDropAuthoringCanvas
        data={{ ...canvasData([]), image: null, imageAspectRatio: null }}
        assessment={assessment([])}
        imageSrc={null}
        onRequestBackground={onRequestBackground}
        onCreateMarker={vi.fn(() => null)}
        onUpdateMarker={vi.fn()}
        onReorderMarkers={vi.fn()}
        onSetCorrectPlacement={vi.fn()}
        onSetDefaultMarkerVisual={vi.fn()}
        onDeleteMarker={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add background image" }));
    expect(onRequestBackground).toHaveBeenCalledOnce();
  });

  it("renders a bounded preview with only the workspace affordance", async () => {
    const onCreateMarker = vi.fn(() => null);
    const { container } = renderCanvas({ presentation: "bounded", onCreateMarker });
    await prepareImage(container);

    const surface = spatialSurface(container);
    fireEvent.pointerDown(surface, { button: 0, clientX: 300, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 300, clientY: 150, pointerId: 1 });
    expect(onCreateMarker).not.toHaveBeenCalled();

    expect(screen.queryByRole("button", { name: "Add marker" })).toBeNull();
    expect(screen.getByRole("button", { name: "Edit markers in expanded workspace" })).toBeTruthy();
  });

  it("rehydrates each persisted managed custom icon after a fresh mount", async () => {
    const markers = [
      {
        id: "marker000001" as never,
        label: "London",
        visualOverride: {
          kind: "custom" as const,
          source: { mode: "managed" as const, mediaId: "marker-icon" },
        },
      },
      {
        id: "marker000002" as never,
        label: "Paris",
        visualOverride: {
          kind: "custom" as const,
          source: { mode: "managed" as const, mediaId: "missing-icon" },
        },
      },
    ];
    const data: DragDropCanvasData = {
      ...canvasData(markers),
      defaultMarkerVisual: {
        kind: "custom",
        source: { mode: "managed", mediaId: "marker-icon" },
      },
    };
    const resolve = vi.fn(async (mediaId: string) => {
      if (mediaId === "missing-icon") throw new Error("not found");
      return "data:image/png;base64,custom-icon";
    });
    const media = {
      resolve,
      upload: async () => {
        throw new Error("Upload is not used while resolving persisted icons.");
      },
    };

    const mediaIds = managedCustomIconIds(data);
    const firstMount = await resolveDragDropCustomIconSources(mediaIds, media);
    const remount = await resolveDragDropCustomIconSources(mediaIds, media);

    expect(mediaIds).toEqual(["marker-icon", "missing-icon"]);
    expect(firstMount).toEqual({ "marker-icon": "data:image/png;base64,custom-icon" });
    expect(remount).toEqual(firstMount);
    expect(resolve).toHaveBeenCalledTimes(4);
  });

  it("reports an unreadable selected raster as an expected decode failure", async () => {
    await expect(decodeImage("data:image/png;base64,broken")).rejects.toThrow(
      /could not be decoded/i,
    );
  });

  it("preserves reason-specific checked outcomes and rejects foreign invariant defects", () => {
    const issue = {
      code: "missing_authoring_target",
      message: "The authoring target no longer exists.",
    };
    expect(expectedAuthoringIssue(issue)).toBe(issue);
    expect(() =>
      expectedAuthoringIssue({ code: "foreign_owner_issue", message: "Wrong mutation owner." }),
    ).toThrow(/unexpected Drag and Drop authoring issue/i);
  });

  it("contains the stage and keeps the floating toolbar above it", async () => {
    const markers = Array.from({ length: 12 }, (_, index) => ({
      id: `marker${String(index + 1).padStart(6, "0")}` as never,
      label: `Marker ${index + 1}`,
      visualOverride: null,
    }));
    const { container } = renderCanvas({ markers });
    await prepareImage(container);

    const shell = container.querySelector<HTMLElement>(".sc-course-drag-drop-authoring-shell");
    const stage = container.querySelector<HTMLElement>(".sc-course-drag-drop-authoring-fit-stage");
    const toolbar = container.querySelector<HTMLElement>(".sc-app-drag-drop-canvas-toolbar");
    expect(shell).not.toBeNull();
    expect(getComputedStyle(stage!).overflow).toBe("hidden");
    expect(toolbar).not.toBeNull();
    expect(getComputedStyle(toolbar!).position).toBe("absolute");
    expect(container.querySelectorAll("[data-authoring-marker-id]")).toHaveLength(12);
  });

  it("projects the authoring image through Course-owned shell, fit-stage, and canvas hooks", async () => {
    const { container } = renderCanvas();
    await prepareImage(container);

    const shell = container.querySelector<HTMLElement>(".sc-course-drag-drop-authoring-shell");
    const stage = container.querySelector<HTMLElement>(".sc-course-drag-drop-authoring-fit-stage");
    const canvas = container.querySelector<HTMLElement>(".sc-course-drag-drop-authoring-canvas");

    expect(shell).not.toHaveClass("sc-app-drag-drop-shell");
    expect(stage).not.toHaveClass("sc-app-drag-drop-stage");
    expect(stage).toHaveAttribute("data-drag-drop-authoring-presentation", "compact");
    expect(canvas).toHaveAttribute("data-spatial-image-surface");
  });

  it("anchors the bounded Block workspace action to the fit-stage rather than the image", async () => {
    const { container } = renderCanvas({ presentation: "bounded" });
    await prepareImage(container);

    const stage = container.querySelector<HTMLElement>(".sc-course-drag-drop-authoring-fit-stage");
    const canvas = spatialSurface(container);
    const toolbar = container.querySelector<HTMLElement>(".sc-app-drag-drop-canvas-toolbar");

    expect(stage).toHaveAttribute("data-drag-drop-authoring-presentation", "bounded");
    expect(toolbar?.parentElement).toBe(stage);
    expect(canvas.contains(toolbar)).toBe(false);
    expect(screen.queryByRole("button", { name: "Add marker" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit markers in expanded workspace" }),
    ).toBeInTheDocument();
  });

  it("defines the standard assessment settings and sheet-owned attempt control", () => {
    expect(dragDropConfiguration.controls.map((control) => control.name)).toEqual(
      expect.arrayContaining([
        "feedbackMode",
        "isGraded",
        "showAnswer",
        "gradingMode",
        "points",
        "maxAttempts",
        "legend",
      ]),
    );
    expect(
      dragDropConfiguration.controls.find((control) => control.name === "maxAttempts")?.placement,
    ).toEqual({ sheet: { section: "attempts" } });
  });
});

function renderCanvas({
  markers = [],
  onCreateMarker = vi.fn(() => null),
  onReorderMarkers = vi.fn(),
  onDeleteMarker = vi.fn(),
  onRequestCustomIcon,
  onSetCorrectPlacement = vi.fn(),
  onSetDefaultMarkerVisual = vi.fn(),
  onUpdateMarker = vi.fn(),
  presentation,
}: {
  markers?: DragDropCanvasData["markers"];
  onCreateMarker?: DragDropAuthoringCanvasProps["onCreateMarker"];
  onReorderMarkers?: DragDropAuthoringCanvasProps["onReorderMarkers"];
  onDeleteMarker?: DragDropAuthoringCanvasProps["onDeleteMarker"];
  onRequestCustomIcon?: DragDropAuthoringCanvasProps["onRequestCustomIcon"];
  onSetCorrectPlacement?: DragDropAuthoringCanvasProps["onSetCorrectPlacement"];
  onSetDefaultMarkerVisual?: DragDropAuthoringCanvasProps["onSetDefaultMarkerVisual"];
  onUpdateMarker?: DragDropAuthoringCanvasProps["onUpdateMarker"];
  presentation?: DragDropAuthoringCanvasProps["presentation"];
} = {}) {
  return render(
    <AppThemeProvider appearance="light">
      <div>
        <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
          <DragDropAuthoringCanvas
            data={canvasData(markers)}
            assessment={assessment(markers)}
            imageSrc={TEST_IMAGE_SRC}
            onRequestBackground={vi.fn()}
            onCreateMarker={onCreateMarker}
            onUpdateMarker={onUpdateMarker}
            onReorderMarkers={onReorderMarkers}
            onSetCorrectPlacement={onSetCorrectPlacement}
            onDeleteMarker={onDeleteMarker}
            onSetDefaultMarkerVisual={onSetDefaultMarkerVisual}
            {...(onRequestCustomIcon ? { onRequestCustomIcon } : {})}
            {...(presentation ? { presentation } : {})}
          />
        </CourseThemeProvider>
      </div>
    </AppThemeProvider>,
  );
}

function canvasData(markers: DragDropCanvasData["markers"]): DragDropCanvasData {
  return {
    image: { mode: "managed", mediaId: "background", alt: "Map" },
    imageAspectRatio: 2,
    defaultMarkerVisual: { kind: "preset", preset: "dot" },
    markers,
  };
}

function assessment(markers: DragDropCanvasData["markers"]): DragDropPrivateAssessment {
  return {
    correctPlacements: markers.map(({ id }, index) => ({
      markerId: id,
      geometry: { kind: "circle", centerX: index * 5, centerY: 50, radius: 4 },
    })),
    feedbackByMarkerId: {},
    summaryFeedback: null,
  };
}

async function prepareImage(container: HTMLElement) {
  await waitFor(() => {
    expect(spatialSurface(container).dataset.spatialImageSurfaceState).toBe("ready");
  });
  spatialSurface(container).getBoundingClientRect = imageRect;
}

function imageRect() {
  return {
    bottom: 250,
    height: 200,
    left: 100,
    right: 500,
    top: 50,
    width: 400,
    x: 100,
    y: 50,
    toJSON: () => ({}),
  } as DOMRect;
}

function spatialSurface(container: HTMLElement) {
  const surface = container.querySelector<HTMLElement>("[data-spatial-image-surface]");
  if (!surface) throw new Error("Expected spatial image surface");
  return surface;
}
type DragDropAuthoringCanvasProps = ComponentProps<typeof DragDropAuthoringCanvas>;
