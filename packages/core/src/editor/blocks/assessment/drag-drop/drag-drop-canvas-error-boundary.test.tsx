// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { DragDropCanvasErrorBoundary } from "./drag-drop-authoring-extension";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function ExplodingChild({ explode }: { explode: boolean }) {
  if (explode) {
    throw new Error("Simulated canvas failure.");
  }
  return <span data-testid="canvas-recovered">Canvas ready</span>;
}

describe("DragDropCanvasErrorBoundary", () => {
  it("shows a per-block fallback and recovers on Retry", async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    const view = render(
      <ErrorObserver onError={onError}>
        <DragDropCanvasErrorBoundary>
          <ExplodingChild explode />
        </DragDropCanvasErrorBoundary>
      </ErrorObserver>,
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("This block hit an error.");
    expect(screen.queryByTestId("canvas-recovered")).toBeNull();

    view.rerender(
      <ErrorObserver onError={onError}>
        <DragDropCanvasErrorBoundary>
          <ExplodingChild explode={false} />
        </DragDropCanvasErrorBoundary>
      </ErrorObserver>,
    );
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => {
      expect(screen.getByTestId("canvas-recovered")).toBeTruthy();
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });
});

function ErrorObserver({
  children,
  onError,
}: {
  children: React.ReactNode;
  onError: (error: Error) => void;
}) {
  return (
    <div
      onErrorCapture={(event) => {
        onError(event.error as Error);
      }}
    >
      {children}
    </div>
  );
}
