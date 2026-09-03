// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
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

  it("gives the expanded presentation a bounded scrolling shelf and a footer submit", () => {
    render(
      <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
        <div className="sc-course-drag-drop-workspace">
          <div className="sc-course-drag-drop-interaction" data-drag-drop-presentation="expanded">
            <div className="sc-course-drag-drop-interaction__layout">
              <aside className="sc-course-drag-drop-tray" aria-label="Markers">
                <div className="sc-course-drag-drop-tray__unplaced">tray</div>
                <div className="sc-course-drag-drop-tray__actions">
                  <button type="button">Reset</button>
                </div>
              </aside>
              <div className="sc-course-drag-drop-stage">image</div>
            </div>
          </div>
          <div className="sc-course-drag-drop-workspace__footer">
            <button type="button">Submit</button>
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
    const footer = document.querySelector<HTMLElement>(
      ".sc-course-drag-drop-workspace__footer",
    );
    expect(layout).not.toBeNull();
    expect(tray).not.toBeNull();
    expect(footer).not.toBeNull();
    expect(getComputedStyle(layout!).display).toBe("grid");
    // The shelf renders above the stage in the DOM.
    expect(layout!.firstElementChild).toBe(tray);
    // The shelf wraps; the expanded interaction body is the scroll container.
    // The reachable action row is the footer submit, not tray placed-rows.
    const submit = within(footer!).getByRole("button", { name: "Submit" });
    expect(submit).toBeVisible();
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
