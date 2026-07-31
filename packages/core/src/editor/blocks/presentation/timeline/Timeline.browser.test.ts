import { afterEach, describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";

import "@/editor/frame/view/bounded-placement.css";
import "./timeline.css";

type TimelinePresentation = "carousel" | "vertical";

afterEach(() => {
  document.body.replaceChildren();
});

describe("Timeline bounded geometry", () => {
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

  it("keeps the vertical viewport capped in ordinary page flow", async () => {
    const fixture = createTimelineFixture({ bounded: false, presentation: "vertical" });
    await nextLayoutFrame();

    expect(fixture.frame.hasAttribute("data-bounded-placement")).toBe(false);
    expect(getComputedStyle(fixture.track).maxHeight).toBe("512px");
  });

  it("keeps its authoring delete control on the application error semantic", async () => {
    const fixture = createTimelineFixture({ bounded: false, presentation: "vertical" });
    fixture.host.style.setProperty("--sc-app-color-error", "rgb(185 28 28)");
    fixture.frame.style.setProperty("--color-secondary", "rgb(8 145 178)");
    fixture.deleteButton.style.transition = "none";

    await userEvent.hover(fixture.firstEvent);
    await userEvent.hover(fixture.deleteButton);

    expect(getComputedStyle(fixture.deleteButton).color).toBe("rgb(185, 28, 28)");
  });
});

function createTimelineFixture(input: { bounded: boolean; presentation: TimelinePresentation }) {
  const host = document.createElement("div");
  host.style.width = "640px";
  if (input.bounded) host.style.height = "360px";

  const frame = document.createElement("div");
  frame.className = "sc-timeline";
  frame.dataset.authoringFrame = "block";
  if (input.bounded) frame.dataset.boundedPlacement = "fill";

  const shell = document.createElement("div");
  shell.className = "sc-timeline__shell";
  shell.dataset.presentation = input.presentation;
  shell.dataset.alignment = "alternate";
  shell.dataset.showAxis = "true";

  const track = document.createElement("div");
  track.className = "sc-timeline__track";

  const rail = document.createElement("div");
  rail.className = "sc-timeline__rail";
  let firstEvent: HTMLDivElement | null = null;
  let deleteButton: HTMLButtonElement | null = null;
  for (let index = 0; index < 4; index += 1) {
    const event = document.createElement("div");
    event.className = `sc-timeline__event sc-timeline__event--${index % 2 === 0 ? "left" : "right"}`;
    event.dataset.timelineEvent = "";

    const card = document.createElement("div");
    card.className = "sc-timeline__card";
    card.style.height = input.presentation === "vertical" ? "160px" : "180px";
    event.append(card);
    if (index === 0) {
      firstEvent = event;
      deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "sc-timeline__action sc-timeline__delete";
      deleteButton.textContent = "Delete event";
      event.append(deleteButton);
    }
    rail.append(event);
  }

  track.append(rail);
  shell.append(track);
  frame.append(shell);
  host.append(frame);
  document.body.append(host);

  if (!firstEvent || !deleteButton) throw new Error("Timeline fixture requires a first event");

  return { deleteButton, firstEvent, frame, host, shell, track };
}

async function nextLayoutFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
