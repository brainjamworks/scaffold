import { afterEach, describe, expect, it } from "vite-plus/test";

import "@/theme/course/designs/pocket-atlas/v1/theme.css";
import "@/ui/icons/icon-renderer.css";

import "./Callout.css";
import "./CalloutAuthoringControls.css";

afterEach(() => {
  document.body.replaceChildren();
});

describe("Pocket Atlas Callout presentation", () => {
  it("keeps the authored icon geometry aligned with the learner preview", async () => {
    const host = document.createElement("main");
    host.className = "sc-course sc-course-theme-pocket-atlas-v1";
    host.style.width = "720px";
    host.style.setProperty("--heading-font-family", '"Pocket Atlas Test", monospace');
    host.innerHTML = `
      ${calloutSpecimen("runtime")}
      ${calloutSpecimen("authoring")}
    `;
    document.body.append(host);

    const runtime = requiredElement<HTMLElement>(host, '[data-callout-owner="runtime"]');
    const authoring = requiredElement<HTMLElement>(host, '[data-callout-owner="authoring"]');
    const runtimeGlyph = requiredElement<HTMLImageElement>(
      runtime,
      ".sc-course-callout__icon-glyph",
    );
    const authoringGlyph = requiredElement<HTMLImageElement>(
      authoring,
      ".sc-course-callout__icon-glyph",
    );
    await waitForCondition(() => runtimeGlyph.complete && authoringGlyph.complete);

    for (const specimen of [runtime, authoring]) {
      const layout = requiredElement<HTMLElement>(specimen, ".sc-course-callout__layout");
      const iconSlot = requiredElement<HTMLElement>(specimen, ".sc-course-callout__icon-slot");
      const content = requiredElement<HTMLElement>(specimen, ".sc-course-callout__content");
      const glyph = requiredElement<HTMLElement>(specimen, ".sc-course-callout__icon-glyph");

      expect(getComputedStyle(layout).display).toBe("grid");
      expect(getComputedStyle(layout).columnGap).toBe("12px");
      expect(getComputedStyle(content).rowGap).toBe("4px");
      expect(iconSlot.getBoundingClientRect().width).toBeCloseTo(32, 0);
      expect(iconSlot.getBoundingClientRect().height).toBeCloseTo(32, 0);
      expect(glyph.getBoundingClientRect().width).toBeCloseTo(10, 0);
      expect(glyph.getBoundingClientRect().height).toBeCloseTo(20, 0);
      expect(content.getBoundingClientRect().left).toBeGreaterThan(
        iconSlot.getBoundingClientRect().right,
      );
    }

    const title = requiredElement<HTMLElement>(runtime, ".sc-course-callout__title");
    expect(getComputedStyle(title).fontFamily).toContain("Pocket Atlas Test");
    expect(getComputedStyle(title).fontWeight).toBe("700");

    expect(
      Number.parseFloat(
        getComputedStyle(requiredElement<HTMLElement>(runtime, ".sc-course-callout__icon-chip"))
          .borderTopLeftRadius,
      ),
    ).toBe(0);
    expect(
      Number.parseFloat(
        getComputedStyle(requiredElement<HTMLElement>(authoring, ".sc-app-callout-icon-trigger"))
          .borderTopLeftRadius,
      ),
    ).toBeGreaterThan(0);
  });

  it("gives every semantic variant a distinct learner-facing treatment", () => {
    const host = document.createElement("main");
    host.className = "sc-course sc-course-theme-pocket-atlas-v1";
    host.innerHTML = [
      calloutStateSpecimen("info", 'data-course-state="info"'),
      calloutStateSpecimen("warning", 'data-course-state="warning"'),
      calloutStateSpecimen("success", 'data-course-state="success"'),
      calloutStateSpecimen("error", 'data-course-state="error"'),
      calloutStateSpecimen("tip", 'data-callout-variant="tip"'),
      calloutStateSpecimen("note", 'data-callout-variant="note"'),
    ].join("");
    document.body.append(host);

    const callouts = Array.from(host.querySelectorAll<HTMLElement>(".sc-course-callout"));
    const surfaceColours = callouts.map((callout) => getComputedStyle(callout).backgroundColor);
    const indicatorColours = callouts.map(
      (callout) =>
        getComputedStyle(requiredElement<HTMLElement>(callout, ".sc-course-callout__icon-chip"))
          .backgroundColor,
    );

    expect(new Set(surfaceColours).size).toBe(6);
    expect(new Set(indicatorColours).size).toBe(6);
  });
});

function calloutSpecimen(owner: "authoring" | "runtime"): string {
  const iconClass =
    owner === "authoring"
      ? "sc-course-callout__icon-slot sc-app-callout-icon-trigger"
      : "sc-course-callout__icon-slot sc-course-callout__icon-chip";
  const iconElement = owner === "authoring" ? "button" : "span";

  return `
    <aside class="sc-course-callout" data-callout-owner="${owner}" data-course-state="info">
      <div class="sc-course-callout__layout">
        <${iconElement} class="${iconClass}" ${owner === "authoring" ? 'type="button"' : ""}>
          <img
            class="sc-icon-renderer sc-course-callout__icon-glyph"
            data-kind="media"
            width="10"
            height="20"
            alt=""
            src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='20'%3E%3Cpath d='M1 1h8v18H1z'/%3E%3C/svg%3E"
          />
        </${iconElement}>
        <div class="sc-course-callout__content">
          <div class="sc-course-callout__title">Info title</div>
          <div class="sc-course-callout__prompt">Add a concise note for learners</div>
        </div>
      </div>
    </aside>
  `;
}

function calloutStateSpecimen(label: string, stateAttribute: string): string {
  return `
    <aside class="sc-course-callout" data-callout-specimen="${label}" ${stateAttribute}>
      <span class="sc-course-callout__icon-slot sc-course-callout__icon-chip"></span>
    </aside>
  `;
}

function requiredElement<Element extends globalThis.Element>(
  root: ParentNode,
  selector: string,
): Element {
  const element = root.querySelector<Element>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

async function waitForCondition(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const startedAt = performance.now();
  while (!predicate()) {
    if (performance.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for Callout browser fixture.");
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
