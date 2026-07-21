import { afterEach, describe, expect, it } from "vite-plus/test";

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
  for (let index = 0; index < 4; index += 1) {
    const event = document.createElement("div");
    event.className = `sc-timeline__event sc-timeline__event--${index % 2 === 0 ? "left" : "right"}`;
    event.dataset.timelineEvent = "";

    const card = document.createElement("div");
    card.className = "sc-timeline__card";
    card.style.height = input.presentation === "vertical" ? "160px" : "180px";
    event.append(card);
    rail.append(event);
  }

  track.append(rail);
  shell.append(track);
  frame.append(shell);
  host.append(frame);
  document.body.append(host);

  return { frame, shell, track };
}

async function nextLayoutFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
