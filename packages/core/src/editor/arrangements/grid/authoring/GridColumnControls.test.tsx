// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { GridColumnControls } from "./GridColumnControls";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("GridColumnControls", () => {
  it("renders one resize handle between each adjacent column", () => {
    render(<GridColumnControls columnWidths={[1, 2, 1]} editable onCommitResize={() => true} />);

    const handles = screen.getAllByRole("separator");
    expect(handles).toHaveLength(2);
    expect(handles[0]?.getAttribute("contenteditable")).toBe("false");
    expect(handles[0]?.getAttribute("data-grid-column-resize-handle")).toBe("");
    expect(handles[0]?.getAttribute("aria-orientation")).toBe("horizontal");
    expect(handles[0]?.getAttribute("aria-valuemin")).toBe("7");
    expect(handles[0]?.getAttribute("aria-valuemax")).toBe("93");
    expect(handles[0]?.getAttribute("aria-valuenow")).toBe("33");
    expect(handles[0]?.getAttribute("style")).toContain("25%");
    expect(handles[1]?.getAttribute("aria-valuenow")).toBe("67");
    expect(handles[1]?.getAttribute("style")).toContain("75%");
  });

  it("centres separators in the shared gaps between equal columns", () => {
    render(<GridColumnControls columnWidths={[1, 1, 1]} editable onCommitResize={() => true} />);

    const handles = screen.getAllByRole("separator");
    expect(handles[0]?.style.getPropertyValue("--sc-grid-column-position")).toBe(
      "calc(33.33333333333333% - 0.16666666666666663 * var(--sc-grid-gap))",
    );
    expect(handles[1]?.style.getPropertyValue("--sc-grid-column-position")).toBe(
      "calc(66.66666666666666% + 0.16666666666666674 * var(--sc-grid-gap))",
    );
  });

  it("is absent in readonly runtime and single-column grids", () => {
    const { rerender } = render(
      <GridColumnControls columnWidths={[1, 1]} editable={false} onCommitResize={() => true} />,
    );

    expect(screen.queryByRole("separator")).toBeNull();

    rerender(<GridColumnControls columnWidths={[1]} editable onCommitResize={() => true} />);
    expect(screen.queryByRole("separator")).toBeNull();
  });

  it("commits keyboard resize deltas from horizontal arrow keys", () => {
    const onCommitResize = createCommitResizeMock();
    render(<GridColumnControls columnWidths={[1, 1]} editable onCommitResize={onCommitResize} />);

    const handle = screen.getByRole("separator", {
      name: "Resize columns 1 and 2",
    });

    fireEvent.keyDown(handle, { key: "ArrowRight" });
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    fireEvent.keyDown(handle, { key: "Enter" });

    expect(onCommitResize).toHaveBeenCalledTimes(2);
    expect(onCommitResize.mock.calls[0]?.[0]).toBe(0);
    expect(onCommitResize.mock.calls[0]?.[1]).toBeCloseTo(0.1);
    expect(onCommitResize.mock.calls[1]?.[0]).toBe(0);
    expect(onCommitResize.mock.calls[1]?.[1]).toBeCloseTo(-0.1);
  });

  it("previews column widths during pointer drag and commits once on release", async () => {
    const { gridElement, handle, onCommitResize } = renderResizableGrid();
    const releasePointerCapture = mockPointerCaptureRelease(handle);

    fireEvent.pointerDown(handle, { clientX: 10, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 20, pointerId: 1 });

    expect(onCommitResize).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(gridElement.style.gridTemplateColumns).toBe("minmax(0, 1.2fr) minmax(0, 0.8fr)");
      expect(handle.getAttribute("style")).toContain("60%");
    });

    fireEvent.pointerUp(window, { clientX: 20, pointerId: 1 });

    expect(onCommitResize).toHaveBeenCalledTimes(1);
    expect(onCommitResize.mock.calls[0]?.[0]).toBe(0);
    expect(onCommitResize.mock.calls[0]?.[1]).toBeCloseTo(0.2);
    expect(releasePointerCapture).toHaveBeenCalledWith(1);
  });

  it("converts pointer movement against track width excluding the shared gap", async () => {
    const { gridElement, handle, onCommitResize } = renderResizableGrid(undefined, 8);

    fireEvent.pointerDown(handle, { clientX: 10, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 20, pointerId: 1 });

    await waitFor(() => {
      expect(gridElement.style.gridTemplateColumns).toBe(
        "minmax(0, 1.217391fr) minmax(0, 0.782609fr)",
      );
      expect(handle.style.getPropertyValue("--sc-grid-column-position")).toContain(
        "var(--sc-grid-gap)",
      );
    });

    fireEvent.pointerUp(window, { clientX: 20, pointerId: 1 });

    expect(onCommitResize).toHaveBeenCalledTimes(1);
    expect(onCommitResize.mock.calls[0]?.[1]).toBeCloseTo(5 / 23);
  });

  it("restores the preview without committing when pointer resize is cancelled", async () => {
    const { gridElement, handle, onCommitResize } = renderResizableGrid();
    const releasePointerCapture = mockPointerCaptureRelease(handle);

    fireEvent.pointerDown(handle, { clientX: 10, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 20, pointerId: 1 });

    await expectPreview(gridElement, handle);

    fireEvent.pointerCancel(window, { pointerId: 1 });

    expect(onCommitResize).not.toHaveBeenCalled();
    expectGridRestored(gridElement, handle);
    expect(releasePointerCapture).toHaveBeenCalledWith(1);
  });

  it("restores the preview when the resize commit is rejected", async () => {
    const onCommitResize = createCommitResizeMock(false);
    const { gridElement, handle } = renderResizableGrid(onCommitResize);

    fireEvent.pointerDown(handle, { clientX: 10, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 20, pointerId: 1 });

    await expectPreview(gridElement, handle);

    fireEvent.pointerUp(window, { clientX: 20, pointerId: 1 });

    expect(onCommitResize).toHaveBeenCalledTimes(1);
    expect(onCommitResize.mock.calls[0]?.[0]).toBe(0);
    expect(onCommitResize.mock.calls[0]?.[1]).toBeCloseTo(0.2);
    expectGridRestored(gridElement, handle);
  });

  it("cleans up and restores the preview when pointer capture is lost", async () => {
    const { gridElement, handle, onCommitResize } = renderResizableGrid();

    fireEvent.pointerDown(handle, { clientX: 10, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 20, pointerId: 1 });

    await expectPreview(gridElement, handle);

    fireEvent(handle, new Event("lostpointercapture"));
    fireEvent.pointerMove(window, { clientX: 40, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 40, pointerId: 1 });

    expect(onCommitResize).not.toHaveBeenCalled();
    expectGridRestored(gridElement, handle);
  });
});

function createCommitResizeMock(commitResult = true) {
  return vi.fn(
    (leftColumnIndex: number, delta: number) =>
      Number.isInteger(leftColumnIndex) && Number.isFinite(delta) && commitResult,
  );
}

function renderResizableGrid(
  onCommitResize: ReturnType<typeof createCommitResizeMock> | undefined = createCommitResizeMock(),
  columnGap = 0,
) {
  const commitResize = onCommitResize ?? createCommitResizeMock();
  const { container } = render(
    <div
      data-authoring-frame="grid"
      style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", columnGap }}
    >
      <GridColumnControls columnWidths={[1, 1]} editable onCommitResize={commitResize} />
    </div>,
  );

  const gridElement = container.firstElementChild as HTMLElement;
  vi.spyOn(gridElement, "getBoundingClientRect").mockReturnValue({
    bottom: 100,
    height: 100,
    left: 0,
    right: 100,
    top: 0,
    width: 100,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });

  const handle = screen.getByRole("separator", {
    name: "Resize columns 1 and 2",
  });

  return { gridElement, handle, onCommitResize: commitResize };
}

function mockPointerCaptureRelease(handle: HTMLElement) {
  const releasePointerCapture = vi.fn();
  Object.defineProperty(handle, "releasePointerCapture", {
    configurable: true,
    value: releasePointerCapture,
  });

  return releasePointerCapture;
}

async function expectPreview(gridElement: HTMLElement, handle: HTMLElement) {
  await waitFor(() => {
    expect(gridElement.style.gridTemplateColumns).toBe("minmax(0, 1.2fr) minmax(0, 0.8fr)");
    expect(handle.getAttribute("style")).toContain("60%");
  });
}

function expectGridRestored(gridElement: HTMLElement, handle: HTMLElement) {
  expect(gridElement.style.gridTemplateColumns).toBe("minmax(0, 1fr) minmax(0, 1fr)");
  expect(handle.getAttribute("style")).toContain("50%");
}
