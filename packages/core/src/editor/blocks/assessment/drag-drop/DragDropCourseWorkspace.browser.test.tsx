// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";

import "@/editor/assessment/drag-drop/DragDrop.css";
import { DragDropCourseWorkspace } from "@/editor/assessment/drag-drop/DragDropCourseWorkspace";

afterEach(cleanup);

describe("DragDropCourseWorkspace", () => {
  it("opens by keyboard, focuses its heading and restores the trigger after Escape and Close", async () => {
    const user = userEvent.setup();
    render(<WorkspaceHarness />);
    const trigger = screen.getByRole("button", { name: "Expand Drag and Drop" });

    trigger.focus();
    await user.keyboard("{Enter}");
    const heading = await screen.findByRole("heading", { name: "Answer Drag and Drop" });
    await waitFor(() => expect(heading).toHaveFocus());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.keyboard("{Enter}");
    await user.click(
      await screen.findByRole("button", { name: "Close expanded Drag and Drop workspace" }),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("gives the expanded presentation distinct scrolling marker and image regions", () => {
    render(
      <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
        <div className="sc-course-drag-drop-workspace">
          <div className="sc-course-drag-drop-interaction" data-drag-drop-presentation="expanded">
            <div className="sc-course-drag-drop-interaction__layout">
              <aside className="sc-course-drag-drop-tray" aria-label="Markers">
                <div className="sc-course-drag-drop-tray__unplaced">
                  <div className="sc-course-drag-drop-source">
                    <button type="button" aria-pressed="true">
                      Marker 1
                    </button>
                  </div>
                </div>
                <div className="sc-course-drag-drop-tray__actions">
                  <button type="button">Reset</button>
                </div>
              </aside>
              <div className="sc-course-drag-drop-stage">image</div>
            </div>
          </div>
        </div>
      </CourseThemeProvider>,
    );

    const layout = document.querySelector<HTMLElement>(
      '[data-drag-drop-presentation="expanded"] .sc-course-drag-drop-interaction__layout',
    );
    const tray = document.querySelector<HTMLElement>(
      '[data-drag-drop-presentation="expanded"] .sc-course-drag-drop-tray',
    );
    const unplaced = document.querySelector<HTMLElement>(
      '[data-drag-drop-presentation="expanded"] .sc-course-drag-drop-tray__unplaced',
    );
    expect(layout).not.toBeNull();
    expect(tray).not.toBeNull();
    expect(unplaced).not.toBeNull();
    const workspace = document.querySelector<HTMLElement>(".sc-course-drag-drop-workspace");
    const stage = layout!.querySelector<HTMLElement>(".sc-course-drag-drop-stage");
    expect(workspace).not.toBeNull();
    expect(stage).not.toBeNull();
    expect(getComputedStyle(workspace!).gap).toBe("0px");
    expect(getComputedStyle(stage!).padding).toBe("8px");
    expect(getComputedStyle(layout!).display).toBe("grid");
    expect(getComputedStyle(layout!).gridTemplateAreas).toContain("markers");
    expect(getComputedStyle(layout!).gridTemplateAreas).toContain("canvas");
    expect(getComputedStyle(unplaced!).overflowY).toBe("auto");
    expect(getComputedStyle(unplaced!).padding).toBe("8px");
    // The marker rail remains first in the DOM and in reading order.
    expect(layout!.firstElementChild).toBe(tray);
    expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
  });
});

function WorkspaceHarness() {
  const [open, setOpen] = useState(false);
  return (
    <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
      <button type="button" onClick={() => setOpen(true)}>
        Expand Drag and Drop
      </button>
      <DragDropCourseWorkspace.Root open={open} onOpenChange={setOpen}>
        <DragDropCourseWorkspace.Content
          title="Answer Drag and Drop"
          description="Place each marker on the image."
        >
          <div>Shared assessment target</div>
        </DragDropCourseWorkspace.Content>
      </DragDropCourseWorkspace.Root>
    </CourseThemeProvider>
  );
}
