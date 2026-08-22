import { afterEach, describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import "@/editor/frame/view/bounded-placement.css";
import "@/theme/course/designs/scaffold-flow/v1/timeline.css";
import "./TimelineAuthoringControls.css";
import "./timeline.css";
import { TimelineTrack } from "./timeline-components";

type TimelinePresentation = "carousel" | "vertical";
const mountedRoots: Root[] = [];

afterEach(() => {
  mountedRoots.splice(0).forEach((root) => root.unmount());
  document.body.replaceChildren();
});

describe("Timeline layout and ownership", () => {
  it.each(["vertical", "carousel"] as const)(
    "fills a finite rectangle while keeping %s scrolling internal",
    async (presentation) => {
      const fixture = createTimelineFixture({ bounded: true, presentation });
      await nextLayoutFrame();

      expect(fixture.frame.getBoundingClientRect().height).toBeCloseTo(360, 0);
      expect(fixture.shell.getBoundingClientRect().height).toBeCloseTo(360, 0);
      expect(fixture.track.getBoundingClientRect().height).toBeCloseTo(360, 0);
      expect(getComputedStyle(fixture.track).maxHeight).toBe("none");

      if (presentation === "vertical") {
        expect(getComputedStyle(fixture.track).overflowY).toBe("auto");
        expect(fixture.track.scrollHeight).toBeGreaterThan(fixture.track.clientHeight);
      } else {
        expect(getComputedStyle(fixture.track).overflowX).toBe("auto");
        expect(fixture.track.scrollWidth).toBeGreaterThan(fixture.track.clientWidth);
      }
    },
  );

  it("keeps Page chronology browsing inside an adaptive vertical scrollport", async () => {
    const fixture = createTimelineFixture({ bounded: false, presentation: "vertical" });
    await nextLayoutFrame();

    expect(fixture.frame.hasAttribute("data-bounded-placement")).toBe(false);
    expect(getComputedStyle(fixture.track).overflowY).toBe("auto");
    expect(fixture.track.getBoundingClientRect().height).toBeGreaterThan(400);
    expect(fixture.track.scrollHeight).toBeGreaterThan(fixture.track.clientHeight);
  });

  it("lets events recede at the scrollport edge without extreme scaling", async () => {
    const fixture = createTimelineFixture({ bounded: false, presentation: "vertical" });
    fixture.track.setAttribute("data-timeline-scrollable", "");
    await nextLayoutFrame();

    fixture.track.scrollTop = fixture.track.scrollHeight - fixture.track.clientHeight;
    await nextLayoutFrame();
    await nextLayoutFrame();

    const eventStyle = getComputedStyle(fixture.firstEvent);
    const scale = new DOMMatrixReadOnly(eventStyle.transform).a;
    expect(Number.parseFloat(eventStyle.opacity)).toBeGreaterThanOrEqual(0.3);
    expect(Number.parseFloat(eventStyle.opacity)).toBeLessThanOrEqual(0.5);
    expect(scale).toBeGreaterThanOrEqual(0.98);
    expect(scale).toBeLessThanOrEqual(0.99);
  });

  it("uses the same restrained edge disappearance in the carousel", async () => {
    const fixture = createTimelineFixture({ bounded: false, presentation: "carousel" });
    fixture.track.setAttribute("data-timeline-scrollable", "");
    await nextLayoutFrame();

    fixture.track.scrollLeft = fixture.track.scrollWidth - fixture.track.clientWidth;
    await nextLayoutFrame();
    await nextLayoutFrame();

    const eventStyle = getComputedStyle(fixture.firstEvent);
    const scale = new DOMMatrixReadOnly(eventStyle.transform).a;
    expect(Number.parseFloat(eventStyle.opacity)).toBeGreaterThanOrEqual(0.3);
    expect(Number.parseFloat(eventStyle.opacity)).toBeLessThanOrEqual(0.5);
    expect(scale).toBeGreaterThanOrEqual(0.98);
    expect(scale).toBeLessThanOrEqual(0.99);
  });

  it("keeps authoring controls close to the first content line without overlap", async () => {
    const fixture = createTimelineFixture({ bounded: false, presentation: "vertical" });
    await nextLayoutFrame();

    const controlsBottom = Math.max(
      fixture.movementButton.getBoundingClientRect().bottom,
      fixture.deleteButton.getBoundingClientRect().bottom,
    );
    const controlToLineGap = fixture.firstLine.getBoundingClientRect().top - controlsBottom;
    expect(controlToLineGap).toBeGreaterThanOrEqual(8);
    expect(controlToLineGap).toBeLessThanOrEqual(16);
  });

  it("collapses alternating events to one full-width rail from container width", async () => {
    const fixture = createTimelineFixture({
      bounded: false,
      presentation: "vertical",
      width: 320,
    });
    await nextLayoutFrame();

    expect(fixture.firstCard.getBoundingClientRect().width).toBeGreaterThan(280);
    expect(fixture.firstCard.getBoundingClientRect().right).toBeLessThanOrEqual(
      fixture.frame.getBoundingClientRect().right + 1,
    );
  });

  it.each(["left", "right"] as const)(
    "keeps the narrow %s add affordance in the event content lane",
    async (side) => {
      const fixture = createTimelineFixture({
        bounded: false,
        presentation: "vertical",
        width: 320,
      });
      const addRow = document.createElement("div");
      addRow.className = "sc-app-timeline-add-row";
      addRow.dataset.timelineSide = side;
      const dot = document.createElement("span");
      dot.className = "sc-app-timeline-add-dot";
      const addButton = document.createElement("button");
      addButton.className = "sc-app-block-add sc-app-timeline-add";
      addButton.textContent = "Add event";
      addRow.append(dot, addButton);
      fixture.rail.append(addRow);

      await nextLayoutFrame();

      const addRect = addButton.getBoundingClientRect();
      expect(addRect.width).toBeGreaterThan(280);
      expect(addRect.right).toBeLessThanOrEqual(fixture.frame.getBoundingClientRect().right + 1);
    },
  );

  it("recolours Course content without recolouring the App-owned delete action", async () => {
    const fixture = createTimelineFixture({ bounded: false, presentation: "vertical" });
    expect(fixture.deleteButton.classList.contains("sc-course-timeline__delete")).toBe(false);
    expect(fixture.deleteButton.getBoundingClientRect().width).toBeCloseTo(36, 0);
    expect(fixture.deleteButton.getBoundingClientRect().height).toBeCloseTo(36, 0);
    expect(getComputedStyle(fixture.deleteButton).borderTopWidth).toBe("0px");
    expect(getComputedStyle(fixture.deleteButton).borderTopLeftRadius).toBe("6px");
    expect(getComputedStyle(fixture.deleteButton).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(fixture.deleteButton).color).toBe("rgb(113, 113, 122)");
    expect(getComputedStyle(fixture.deleteButton).opacity).toBe("0.72");

    fixture.host.style.setProperty("--gray-1", "rgb(24 24 27)");
    fixture.host.style.setProperty("--gray-11", "rgb(212 212 216)");
    fixture.host.style.setProperty("--gray-12", "rgb(250 250 250)");
    fixture.host.style.setProperty("--gray-a6", "rgb(63 63 70)");
    fixture.host.style.setProperty("--accent-11", "rgb(165 180 252)");
    fixture.host.style.setProperty("--sc-app-color-text-muted", "rgb(113 113 122)");
    fixture.host.style.setProperty("--sc-app-color-error", "rgb(225 29 72)");
    fixture.host.style.setProperty("--sc-app-color-error-background", "rgb(63 29 36)");
    fixture.host.style.setProperty("--sc-course-state-error-text", "rgb(244 63 94)");
    fixture.host.style.setProperty("--sc-course-state-error-background", "rgb(76 5 25)");
    await nextLayoutFrame();

    expect(getComputedStyle(fixture.firstCard).backgroundColor).toBe("rgb(24, 24, 27)");
    expect(getComputedStyle(fixture.firstCard).borderColor).toBe("rgb(63, 63, 70)");
    expect(getComputedStyle(fixture.deleteButton).color).toBe("rgb(113, 113, 122)");

    fixture.deleteButton.style.transition = "none";
    await userEvent.hover(fixture.deleteButton);
    expect(getComputedStyle(fixture.deleteButton).color).toBe("rgb(225, 29, 72)");
    expect(getComputedStyle(fixture.deleteButton).backgroundColor).toBe("rgb(63, 29, 36)");
    expect(getComputedStyle(fixture.deleteButton).opacity).toBe("1");

    await userEvent.unhover(fixture.deleteButton);
    fixture.deleteButton.focus();
    expect(getComputedStyle(fixture.deleteButton).color).toBe("rgb(225, 29, 72)");
    expect(getComputedStyle(fixture.deleteButton).outlineStyle).toBe("solid");

    fixture.deleteButton.setAttribute("aria-disabled", "true");
    expect(getComputedStyle(fixture.deleteButton).color).toBe("rgb(113, 113, 122)");
    expect(getComputedStyle(fixture.deleteButton).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(fixture.deleteButton).cursor).toBe("not-allowed");
    expect(getComputedStyle(fixture.deleteButton).opacity).toBe("0.45");
    expect(document.activeElement).toBe(fixture.deleteButton);
  });

  it("enables edge treatment only while a vertical Timeline actually overflows", async () => {
    const host = createCourseHost(420);
    host.style.height = "240px";
    const frame = document.createElement("div");
    frame.className = "sc-course-timeline";
    frame.dataset.boundedPlacement = "fill";
    host.append(frame);
    document.body.append(host);
    const root = createRoot(frame);
    mountedRoots.push(root);

    const renderEvents = (eventCount: number) => {
      root.render(
        createElement(
          "section",
          {
            className: "sc-course-timeline__shell",
            "data-alignment": "alternate",
            "data-presentation": "vertical",
            "data-show-axis": "true",
          },
          createElement(TimelineTrack, {
            children: createElement(
              "ol",
              { className: "sc-course-timeline__events" },
              ...Array.from({ length: eventCount }, (_, index) =>
                createElement(
                  "li",
                  {
                    className: "sc-course-timeline__event",
                    "data-timeline-event": "",
                    key: index,
                    style: { minHeight: "120px" },
                  },
                  `Event ${index + 1}`,
                ),
              ),
            ),
            eventCount,
            options: { alignment: "alternate", presentation: "vertical", showAxis: true },
          }),
        ),
      );
    };

    renderEvents(3);
    await nextLayoutFrame();
    await nextLayoutFrame();
    const track = frame.querySelector<HTMLElement>(".sc-course-timeline__track");
    expect(track).not.toBeNull();
    expect(track?.scrollHeight).toBeGreaterThan(track?.clientHeight ?? 0);
    expect(track).toHaveAttribute("data-timeline-scrollable", "");

    renderEvents(1);
    await nextLayoutFrame();
    await nextLayoutFrame();
    expect(track?.scrollHeight).toBeLessThanOrEqual(track?.clientHeight ?? 0);
    expect(track).not.toHaveAttribute("data-timeline-scrollable");
    const remainingEvent = track?.querySelector<HTMLElement>(".sc-course-timeline__event");
    expect(remainingEvent).not.toBeNull();
    expect(Number.parseFloat(getComputedStyle(remainingEvent!).opacity)).toBe(1);
  });

  it("navigates to adjacent event geometry with accurate endpoint states", async () => {
    const host = createCourseHost(420);
    const frame = document.createElement("div");
    frame.className = "sc-course-timeline";
    host.append(frame);
    document.body.append(host);
    const root = createRoot(frame);
    mountedRoots.push(root);

    root.render(
      createElement(
        "section",
        {
          className: "sc-course-timeline__shell",
          "data-alignment": "alternate",
          "data-presentation": "carousel",
          "data-show-axis": "true",
        },
        createElement(TimelineTrack, {
          children: createElement(
            "ol",
            { className: "sc-course-timeline__events" },
            ...Array.from({ length: 3 }, (_, index) =>
              createElement(
                "li",
                {
                  className: "sc-course-timeline__event",
                  "data-timeline-event": "",
                  key: index,
                },
                createElement("div", {
                  className: "sc-course-timeline__card",
                  style: { minHeight: "120px" },
                }),
              ),
            ),
          ),
          eventCount: 3,
          options: { alignment: "alternate", presentation: "carousel", showAxis: true },
        }),
      ),
    );
    await nextLayoutFrame();
    await nextLayoutFrame();

    const previous = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Previous event"]',
    );
    let next = document.querySelector<HTMLButtonElement>('button[aria-label="Next event"]');
    const track = document.querySelector<HTMLElement>(".sc-course-timeline__track");
    if (!previous || !next || !track) throw new Error("Timeline navigation did not render");
    expect(previous.disabled).toBe(true);
    expect(next.disabled).toBe(false);

    next.focus();
    await userEvent.keyboard("{Enter}");
    await nextLayoutFrame();
    expect(track.scrollLeft).toBeGreaterThan(0);

    next = document.querySelector<HTMLButtonElement>('button[aria-label="Next event"]');
    if (!next) throw new Error("Timeline next action disappeared");
    next.focus();
    await userEvent.keyboard("{Enter}");
    await nextLayoutFrame();
    await nextLayoutFrame();

    expect(next.disabled).toBe(true);
    expect(previous.disabled).toBe(false);
  });
});

function createTimelineFixture(input: {
  bounded: boolean;
  presentation: TimelinePresentation;
  width?: number;
}) {
  const host = createCourseHost(input.width ?? 640);
  if (input.bounded) host.style.height = "360px";

  const frame = document.createElement("div");
  frame.className = "sc-course-timeline";
  frame.dataset.authoringFrame = "block";
  if (input.bounded) frame.dataset.boundedPlacement = "fill";

  const shell = document.createElement("section");
  shell.className = "sc-course-timeline__shell";
  shell.dataset.presentation = input.presentation;
  shell.dataset.alignment = "alternate";
  shell.dataset.showAxis = "true";

  const track = document.createElement("div");
  track.className = "sc-course-timeline__track";

  const rail = document.createElement("div");
  rail.className = "sc-course-timeline__rail";

  const events = document.createElement("ol");
  events.className = "sc-course-timeline__events";
  let firstCard: HTMLDivElement | null = null;
  let firstEvent: HTMLLIElement | null = null;
  let firstLine: HTMLParagraphElement | null = null;
  let movementButton: HTMLButtonElement | null = null;
  let deleteButton: HTMLButtonElement | null = null;
  for (let index = 0; index < 4; index += 1) {
    const event = document.createElement("li");
    const side = index % 2 === 0 ? "left" : "right";
    event.className = `sc-course-timeline__event sc-course-timeline__event--${side}`;
    event.dataset.timelineEvent = "";

    const dot = document.createElement("span");
    dot.className = "sc-course-timeline__dot";
    const card = document.createElement("div");
    card.className = "sc-course-timeline__card";
    card.style.minHeight = input.presentation === "vertical" ? "160px" : "180px";
    const content = document.createElement("div");
    content.className = "sc-course-timeline__content";
    const line = document.createElement("p");
    line.textContent = `Timeline event ${index + 1}`;
    content.append(line);
    event.append(dot, card);
    if (index === 0) {
      firstEvent = event;
      firstCard = card;
      firstLine = line;
      const chrome = document.createElement("div");
      chrome.className = "sc-app-timeline-chrome";
      movementButton = document.createElement("button");
      movementButton.type = "button";
      movementButton.className = "sc-app-contained-movement-handle sc-app-compact-movement-handle";
      const movementVisual = document.createElement("span");
      movementVisual.className =
        "sc-app-contained-movement-handle__visual sc-app-compact-movement-handle__visual";
      movementVisual.textContent = "Move event";
      movementButton.append(movementVisual);
      deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "sc-app-timeline-delete";
      deleteButton.textContent = "Delete event";
      chrome.append(movementButton, deleteButton);
      card.append(chrome);
    }
    card.append(content);
    events.append(event);
  }

  rail.append(events);
  track.append(rail);
  shell.append(track);
  frame.append(shell);
  host.append(frame);
  document.body.append(host);

  if (!firstCard || !firstEvent || !firstLine || !movementButton || !deleteButton) {
    throw new Error("Timeline fixture requires a first event");
  }

  return {
    deleteButton,
    firstCard,
    firstEvent,
    firstLine,
    frame,
    host,
    movementButton,
    rail,
    shell,
    track,
  };
}

function createCourseHost(width: number) {
  const host = document.createElement("div");
  host.className = "sc-course sc-course-theme-scaffold-flow-v1";
  host.style.width = `${width}px`;
  host.style.setProperty("--space-1", "4px");
  host.style.setProperty("--space-2", "8px");
  host.style.setProperty("--space-3", "12px");
  host.style.setProperty("--space-4", "16px");
  host.style.setProperty("--space-5", "20px");
  host.style.setProperty("--space-6", "24px");
  host.style.setProperty("--space-8", "32px");
  host.style.setProperty("--radius-3", "8px");
  host.style.setProperty("--gray-1", "rgb(255 255 255)");
  host.style.setProperty("--gray-8", "rgb(161 161 170)");
  host.style.setProperty("--gray-11", "rgb(82 82 91)");
  host.style.setProperty("--gray-12", "rgb(24 24 27)");
  host.style.setProperty("--gray-a6", "rgb(228 228 231)");
  host.style.setProperty("--gray-a7", "rgb(212 212 216)");
  host.style.setProperty("--accent-9", "rgb(79 70 229)");
  host.style.setProperty("--accent-11", "rgb(67 56 202)");
  host.style.setProperty("--accent-a6", "rgb(165 180 252)");
  host.style.setProperty("--accent-a7", "rgb(129 140 248)");
  host.style.setProperty("--sc-app-color-background", "rgb(255 255 255)");
  host.style.setProperty("--sc-app-color-border", "rgb(228 228 231)");
  host.style.setProperty("--sc-app-color-text-muted", "rgb(113 113 122)");
  host.style.setProperty("--sc-app-color-error", "rgb(185 28 28)");
  host.style.setProperty("--sc-app-color-error-background", "rgb(254 226 226)");
  host.style.setProperty("--sc-app-color-focus-outline", "rgb(79 70 229)");
  host.style.setProperty("--sc-app-radius-control", "6px");
  return host;
}

async function nextLayoutFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
