import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import "@/styles/globals.css";

import { Lightbox } from "./Lightbox/Lightbox";
import { OverlayBoundary } from "./OverlayBoundary/OverlayBoundary";
import * as Popover from "./Popover/Popover";
import { PopoverSurface } from "./PopoverSurface/PopoverSurface";
import * as Tooltip from "./Tooltip/Tooltip";
import { WorkspaceDialog } from "./WorkspaceDialog/WorkspaceDialog";

const mountedRoots: Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("overlay theme ownership", () => {
  it("keeps learner popovers and tooltips inside the course theme owner", async () => {
    const fixture = createOwnershipFixture("course");
    fixture.root.render(
      <OverlayBoundary container={fixture.boundaryContainer} kind="viewport">
        <Popover.Root open>
          <Popover.Trigger>Feedback trigger</Popover.Trigger>
          <Popover.Portal>
            <Popover.Content data-testid="course-popover">
              <PopoverSurface title="Feedback">Review this answer.</PopoverSurface>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <Tooltip.Provider delayDuration={0}>
          <Tooltip.Root open>
            <Tooltip.Trigger>Stage information</Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content data-testid="course-tooltip">Stage 1</Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>
      </OverlayBoundary>,
    );

    const popover = await waitForElement('[data-testid="course-popover"]');
    const tooltip = await waitForElement('[data-testid="course-tooltip"]');

    expectThemeOwner(popover, "course");
    expectThemeOwner(tooltip, "course");
    expect(getComputedStyle(popover.querySelector(".sc-popover-surface")!).backgroundColor).toBe(
      "rgb(18, 52, 86)",
    );
    expect(getComputedStyle(tooltip).backgroundColor).toBe("rgb(18, 52, 86)");
    expect(getComputedStyle(tooltip).color).toBe("rgb(35, 69, 103)");
    expect(getComputedStyle(popover.querySelector(".sc-popover-surface")!).borderTopWidth).toBe(
      "3px",
    );
    expect(getComputedStyle(popover.querySelector(".sc-popover-surface")!).borderRadius).toBe(
      "18px",
    );
    expect(getComputedStyle(popover.querySelector(".sc-popover-surface")!).paddingTop).toBe(
      "17.5px",
    );
    expect(getComputedStyle(popover.querySelector(".sc-popover-surface")!).boxShadow).toBe(
      "rgb(1, 2, 3) 0px 4px 12px 0px",
    );
    expect(getComputedStyle(tooltip).borderTopWidth).toBe("3px");
    expect(getComputedStyle(tooltip).borderRadius).toBe("12px");
    expect(getComputedStyle(tooltip).boxShadow).toBe("rgb(1, 2, 3) 0px 4px 12px 0px");
    expect(popover.closest("[data-scaffold-overlay-host]")?.parentElement).toBe(
      fixture.boundaryContainer,
    );
    expect(tooltip.closest("[data-scaffold-overlay-host]")?.parentElement).toBe(
      fixture.boundaryContainer,
    );
  });

  it("establishes the course body font on a standalone learner portal host", async () => {
    const fixture = createOwnershipFixture("application");
    fixture.application.style.fontFamily = '"Application Font", sans-serif';
    fixture.root.render(
      <OverlayBoundary
        container={fixture.boundaryContainer}
        hostClassName="sc-course-theme-portal-scope"
        hostCssVariables={{ "--sc-course-font-body": '"Course Body", serif' }}
        kind="viewport"
      >
        <Popover.Root open>
          <Popover.Trigger>Feedback trigger</Popover.Trigger>
          <Popover.Portal>
            <Popover.Content data-testid="standalone-course-popover">
              <PopoverSurface title="Feedback">Review this answer.</PopoverSurface>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </OverlayBoundary>,
    );

    const popover = await waitForElement('[data-testid="standalone-course-popover"]');
    const portalHost = popover.closest<HTMLElement>(".sc-course-theme-portal-scope");

    expect(portalHost).not.toBeNull();
    expect(getComputedStyle(portalHost!).fontFamily).toContain("Course Body");
    expect(getComputedStyle(popover.querySelector(".sc-popover-surface")!).fontFamily).toContain(
      "Course Body",
    );
  });

  it("keeps a learner workspace and lightbox inside the course theme owner", async () => {
    const workspaceFixture = createOwnershipFixture("course");
    workspaceFixture.root.render(
      <OverlayBoundary container={workspaceFixture.boundaryContainer} kind="viewport">
        <WorkspaceDialog.Root open>
          <WorkspaceDialog.Content aria-label="Answer image hotspot">
            <WorkspaceDialog.Header>
              <WorkspaceDialog.Title>Answer image hotspot</WorkspaceDialog.Title>
              <WorkspaceDialog.Description>
                Choose the region that answers the question.
              </WorkspaceDialog.Description>
            </WorkspaceDialog.Header>
            <WorkspaceDialog.Body>Choose a region.</WorkspaceDialog.Body>
          </WorkspaceDialog.Content>
        </WorkspaceDialog.Root>
      </OverlayBoundary>,
    );

    const workspace = await waitForElement(".sc-workspace-dialog-content");
    expectThemeOwner(workspace, "course");
    expect(getComputedStyle(workspace).backgroundColor).toBe("rgb(18, 52, 86)");
    expect(getComputedStyle(workspace).borderTopWidth).toBe("3px");
    expect(getComputedStyle(workspace).borderRadius).toBe("12px");
    expect(getComputedStyle(workspace).boxShadow).toBe("rgb(1, 2, 3) 0px 4px 12px 0px");
    expect(getComputedStyle(workspace.querySelector(".sc-workspace-dialog-body")!).padding).toBe(
      "30px",
    );

    workspaceFixture.root.unmount();
    mountedRoots.splice(mountedRoots.indexOf(workspaceFixture.root), 1);
    workspaceFixture.application.remove();

    const lightboxFixture = createOwnershipFixture("course");
    lightboxFixture.root.render(
      <OverlayBoundary container={lightboxFixture.boundaryContainer} kind="viewport">
        <Lightbox
          open
          onOpenChange={() => undefined}
          ariaLabel="Course image viewer"
          items={[
            {
              key: "course-image",
              src: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
              alt: "Course image",
              caption: "Course caption",
            },
          ]}
        />
      </OverlayBoundary>,
    );

    const lightbox = await waitForElement(".sc-lightbox-content");
    expectThemeOwner(lightbox, "course");
    expectThemeOwner(await waitForElement(".sc-lightbox-caption"), "course");
  });

  it("keeps authoring overlays on the application theme owner", async () => {
    const fixture = createOwnershipFixture("application");
    fixture.root.render(
      <OverlayBoundary container={fixture.boundaryContainer} kind="viewport">
        <Tooltip.Provider delayDuration={0}>
          <Tooltip.Root open>
            <Tooltip.Trigger>Editor tool</Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content data-testid="application-tooltip">Editor action</Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>
      </OverlayBoundary>,
    );

    const tooltip = await waitForElement('[data-testid="application-tooltip"]');
    expectThemeOwner(tooltip, "application");
    expect(tooltip.closest(".sc-course-theme-scope")).toBeNull();
    expect(getComputedStyle(tooltip).borderTopWidth).toBe("1px");
    expect(getComputedStyle(tooltip).borderRadius).toBe("8px");
  });
});

function createOwnershipFixture(owner: "application" | "course") {
  const application = document.createElement("div");
  application.style.setProperty("--test-theme-owner", "application");
  application.style.setProperty("--color-background", "rgb(10 20 30)");
  application.style.setProperty("--color-ink", "rgb(40 50 60)");

  const course = document.createElement("section");
  course.className = "sc-course-theme-scope";
  course.style.setProperty("--test-theme-owner", "course");
  course.style.setProperty("--color-background", "rgb(18 52 86)");
  course.style.setProperty("--color-ink", "rgb(35 69 103)");
  course.style.setProperty("--color-border", "rgb(69 103 137)");
  course.style.setProperty("--color-primary", "rgb(86 120 154)");
  course.style.setProperty("--sc-course-color-background", "rgb(18 52 86)");
  course.style.setProperty("--sc-course-color-surface-muted", "rgb(52 86 120)");
  course.style.setProperty("--sc-course-color-text", "rgb(35 69 103)");
  course.style.setProperty("--sc-course-color-text-muted", "rgb(103 137 171)");
  course.style.setProperty("--sc-course-color-border", "rgb(69 103 137)");
  course.style.setProperty("--sc-course-color-primary", "rgb(86 120 154)");
  course.style.setProperty("--sc-course-roundness", "1");
  course.style.setProperty("--sc-course-stroke", "3px");
  course.style.setProperty("--sc-course-shadow", "0 4px 12px rgb(1 2 3)");
  course.style.setProperty("--sc-course-density", "1.25");
  application.append(course);

  const boundaryContainer = owner === "course" ? course : application;
  const mount = document.createElement("div");
  boundaryContainer.append(mount);
  document.body.append(application);

  const root = createRoot(mount);
  mountedRoots.push(root);
  return { application, boundaryContainer, root };
}

function expectThemeOwner(element: Element, expected: "application" | "course"): void {
  expect(getComputedStyle(element).getPropertyValue("--test-theme-owner").trim()).toBe(expected);
}

async function waitForElement(selector: string): Promise<HTMLElement> {
  const deadline = performance.now() + 5_000;
  while (performance.now() < deadline) {
    const element = document.querySelector<HTMLElement>(selector);
    if (element) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      return element;
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  throw new Error(`Timed out waiting for ${selector}.`);
}
