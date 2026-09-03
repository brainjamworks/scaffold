import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";

import "@/styles/globals.css";
import "@/editor/assessment/drag-drop/DragDrop.css";

import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";

import "./theme.css";

const mountedRoots: Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("Pocket Atlas Drag and Drop recipe", () => {
  it.each(["light", "dark"] as const)(
    "keeps markers distinct with keylines, signal colour and non-colour cues in %s mode",
    async (appearance) => {
      const { host } = mountDragDrop(appearance);
      await waitForCondition(() => host.querySelector(".sc-course-drag-drop-marker") !== null);
      const resting = requireElement<HTMLButtonElement>(
        host,
        '[data-testid="plain-marker"] > button',
      );
      const selected = requireElement<HTMLButtonElement>(
        host,
        '[data-testid="selected-marker"] > button',
      );
      const correct = requireElement<HTMLButtonElement>(
        host,
        '[data-testid="correct-marker"] > button',
      );
      const incorrect = requireElement<HTMLButtonElement>(
        host,
        '[data-testid="incorrect-marker"] > button',
      );
      const restingStyle = getComputedStyle(resting);

      expect(restingStyle.borderTopWidth).toBe("2px");
      expect(restingStyle.borderTopLeftRadius).toBe("0px");
      expect(restingStyle.boxShadow).not.toBe("none");
      expect(resting.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
      expect(resting.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);

      const selectedStyle = getComputedStyle(selected);
      expect(selectedStyle.backgroundColor).not.toBe(restingStyle.backgroundColor);
      expect(getComputedStyle(selected).outlineStyle).toBe("solid");

      const correctStyle = getComputedStyle(correct);
      const incorrectStyle = getComputedStyle(incorrect);
      expect(correctStyle.backgroundColor).not.toBe(incorrectStyle.backgroundColor);
      expect(correctStyle.backgroundColor).not.toBe(restingStyle.backgroundColor);
      // Structural verdict language survives the Atlas treatment.
      expect(getComputedStyle(correct).borderTopStyle).toBe("double");
      expect(getComputedStyle(incorrect).borderTopStyle).toBe("dashed");

      const label = requireElement<HTMLElement>(
        host,
        '[data-testid="correct-marker"] .sc-course-drag-drop-marker__label',
      );
      const labelStyle = getComputedStyle(label);
      expect(labelStyle.borderTopLeftRadius).toBe("0px");
      expect(labelStyle.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
      expect(contrastRatio(labelStyle.color, labelStyle.backgroundColor)).toBeGreaterThanOrEqual(
        4.5,
      );

      resting.focus();
      expect(getComputedStyle(resting).outlineStyle).toBe("solid");
      expect(getComputedStyle(resting).outlineWidth).toBe("3px");

      const trayButton = requireElement<HTMLButtonElement>(
        host,
        '[data-testid="tray-source"] > button',
      );
      const restingButtonBackground = getComputedStyle(trayButton).backgroundColor;
      await userEvent.hover(trayButton);
      await waitForCondition(
        () => getComputedStyle(trayButton).backgroundColor !== restingButtonBackground,
      );
      expect(getComputedStyle(trayButton).backgroundColor).not.toBe(restingButtonBackground);
    },
  );

  it.each(["light", "dark"] as const)(
    "leaves the slide itself unadorned while framing the image box in %s mode",
    async (appearance) => {
      const { host } = mountDragDrop(appearance);
      await waitForCondition(() => host.querySelector(".sc-course-drag-drop-stage") !== null);

      const stage = requireElement<HTMLElement>(host, ".sc-course-drag-drop-stage");
      expect(getComputedStyle(stage).boxShadow).toBe("none");
      expect(getComputedStyle(stage).backgroundColor).toBe("rgba(0, 0, 0, 0)");

      const surface = requireElement<HTMLElement>(stage, "[data-spatial-image-surface]");
      expect(getComputedStyle(surface).borderTopWidth).toBe("2px");
      expect(getComputedStyle(surface).borderTopLeftRadius).toBe("0px");
      expect(getComputedStyle(surface).boxShadow).toBe("none");
    },
  );

  it("keeps custom-icon fallback markers labelled and operable", async () => {
    const { host } = mountDragDrop("light");
    await waitForCondition(() => host.querySelector("[data-custom-icon-fallback]") !== null);

    const fallback = requireElement<HTMLElement>(host, "[data-custom-icon-fallback]");
    const labelled = requireElement<HTMLButtonElement>(
      host,
      '[data-testid="custom-source"] > button',
    );
    expect(fallback).toBeVisible();
    expect(labelled).toHaveTextContent("Harbour");
    expect(labelled.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
  });

  it("adds no structural compensation on top of the family layout", async () => {
    const { host } = mountDragDrop("light");
    await waitForCondition(() => host.querySelector(".sc-course-drag-drop-marker") !== null);

    const themed = scopedGeometry(host.querySelector<HTMLElement>('[data-themed="true"]')!);
    const plain = scopedGeometry(host.querySelector<HTMLElement>('[data-themed="false"]')!);
    expect(themed).toEqual(plain);
  });
});

function DragDropFixture() {
  return (
    <section className="sc-course-drag-drop-interaction" data-drag-drop-presentation="inline">
      <div className="sc-course-drag-drop-interaction__layout">
        <div className="sc-course-drag-drop-stage">
          <div data-spatial-image-surface="" data-spatial-image-surface-state="ready">
            <span
              className="sc-course-drag-drop-marker"
              data-course-state="correct"
              data-edge-x="middle"
              data-edge-y="top"
              data-testid="correct-marker"
              style={{ left: "25%", top: "30%" }}
            >
              <button aria-label="Placed London" type="button">
                <span aria-hidden>⌖</span>
              </button>
              <span className="sc-course-drag-drop-marker__label">London</span>
            </span>
            <span
              className="sc-course-drag-drop-marker"
              data-course-state="incorrect"
              data-edge-x="right"
              data-edge-y="bottom"
              data-testid="incorrect-marker"
              style={{ left: "90%", top: "85%" }}
            >
              <button aria-label="Placed Paris" type="button">
                <span aria-hidden>⚑</span>
              </button>
              <span className="sc-course-drag-drop-marker__label">Paris</span>
            </span>
            <span
              className="sc-course-drag-drop-marker"
              data-edge-x="middle"
              data-edge-y="top"
              data-selected=""
              data-testid="selected-marker"
              style={{ left: "55%", top: "40%" }}
            >
              <button aria-label="Placed Madrid" aria-pressed="true" type="button">
                <span aria-hidden>●</span>
              </button>
              <span className="sc-course-drag-drop-marker__label">Madrid</span>
            </span>
            <span
              className="sc-course-drag-drop-marker"
              data-edge-x="left"
              data-edge-y="top"
              data-testid="plain-marker"
              style={{ left: "10%", top: "20%" }}
            >
              <button aria-label="Placed Rome" type="button">
                <span aria-hidden>●</span>
              </button>
              <span className="sc-course-drag-drop-marker__label">Rome</span>
            </span>
            <button
              aria-label="Position Berlin"
              className="sc-course-drag-drop-keyboard-cursor"
              data-drag-drop-keyboard-cursor=""
              type="button"
            >
              <span aria-hidden>●</span>
            </button>
          </div>
        </div>
        <aside aria-label="Markers" className="sc-course-drag-drop-tray">
          <div className="sc-course-drag-drop-tray__unplaced">
            <h3>Markers to place</h3>
            <span className="sc-course-drag-drop-source" data-testid="tray-source">
              <button aria-label="Select Berlin for placement" aria-pressed="true" type="button">
                <span aria-hidden>●</span>
                <span>Berlin</span>
              </button>
            </span>
            <span className="sc-course-drag-drop-source" data-testid="custom-source">
              <button aria-label="Select Harbour for placement" aria-pressed="false" type="button">
                <span aria-hidden data-custom-icon-fallback="">
                  ●
                </span>
                <span>Harbour</span>
              </button>
            </span>
          </div>
          <div className="sc-course-drag-drop-tray__actions">
            <button type="button">Reset</button>
          </div>
        </aside>
      </div>
      <span className="sc-course-drag-drop-drag-preview">
        <span aria-hidden>●</span>
        <span>Berlin</span>
      </span>
    </section>
  );
}

function mountDragDrop(appearance: "light" | "dark") {
  const host = document.createElement("div");
  host.style.width = "56rem";
  document.body.append(host);
  const root = createRoot(host);
  mountedRoots.push(root);
  root.render(
    <>
      <CourseThemeProvider
        appearance={appearance}
        theme={{
          schemaVersion: 1,
          design: { id: "pocket-atlas", revision: "1" },
          colourSystem: { id: "pocket-atlas", revision: "1" },
          overrides: {},
        }}
      >
        <div data-themed="true">
          <DragDropFixture />
        </div>
      </CourseThemeProvider>
      <div data-themed="false">
        <DragDropFixture />
      </div>
    </>,
  );
  return { host };
}

function scopedGeometry(scope: HTMLElement): Record<string, string> {
  const geometry: Record<string, string> = {};
  const pick = (selector: string, properties: readonly string[]): void => {
    const element = scope.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Expected ${selector}`);
    const style = getComputedStyle(element);
    for (const property of properties) {
      geometry[`${selector}::${property}`] = style.getPropertyValue(property);
    }
  };
  pick(".sc-course-drag-drop-interaction", ["display"]);
  pick(".sc-course-drag-drop-interaction__layout", ["display"]);
  pick(".sc-course-drag-drop-stage", ["display", "overflow"]);
  pick(".sc-course-drag-drop-tray", ["display", "overflow", "max-height"]);
  pick(".sc-course-drag-drop-marker", ["position"]);
  pick(".sc-course-drag-drop-tray__actions", ["position", "display"]);
  return geometry;
}

function requireElement<ElementType extends Element>(
  root: ParentNode,
  selector: string,
): ElementType {
  const element = root.querySelector<ElementType>(selector);
  if (!element) throw new Error(`Expected ${selector}`);
  return element;
}

async function waitForCondition(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (condition()) return;
    await new Promise(requestAnimationFrame);
  }
  throw new Error("Timed out waiting for browser render");
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(parseRgb(foreground));
  const backgroundLuminance = relativeLuminance(parseRgb(background));
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseRgb(value: string): [number, number, number] {
  const channels = value
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  if (!channels || channels.length !== 3)
    throw new Error(`Expected RGB colour, received: ${value}`);
  return channels as [number, number, number];
}

function relativeLuminance([red, green, blue]: [number, number, number]): number {
  const linear = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
}
