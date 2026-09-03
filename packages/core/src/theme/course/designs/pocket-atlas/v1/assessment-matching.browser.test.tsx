import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";

import "@/styles/globals.css";
import "@/editor/assessment/matching/Matching.css";

import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";

import "../../scaffold-flow/v1/assessment-matching.css";
import "./theme.css";

const mountedRoots: Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("Matching component geometry", () => {
  it("provides the wide matching lanes and connector layer without a Course recipe", async () => {
    const host = document.createElement("div");
    host.style.width = "56rem";
    document.body.append(host);
    const root = createRoot(host);
    mountedRoots.push(root);

    root.render(<MatchingRuntimeFixture />);

    await waitForCondition(() => host.querySelector(".sc-course-matching__canvas") !== null);

    const canvas = requiredElement<HTMLElement>(host, ".sc-course-matching__canvas");
    const itemColumn = requiredElement<HTMLElement>(host, ".sc-course-matching__column--items");
    const targetColumn = requiredElement<HTMLElement>(host, ".sc-course-matching__column--targets");
    const connectors = requiredElement<SVGElement>(host, ".sc-course-matching__connectors");

    expect(getComputedStyle(canvas).gridTemplateColumns.split(" ")).toHaveLength(3);
    expect(getComputedStyle(itemColumn).gridColumnStart).toBe("1");
    expect(getComputedStyle(targetColumn).gridColumnStart).toBe("3");
    expect(getComputedStyle(connectors).display).toBe("block");
  });

  it("gives the real runtime activation surfaces a Flow focus treatment", async () => {
    const host = document.createElement("div");
    host.style.width = "56rem";
    document.body.append(host);
    const root = createRoot(host);
    mountedRoots.push(root);

    root.render(
      <CourseThemeProvider
        appearance="light"
        theme={{
          schemaVersion: 1,
          design: { id: "scaffold-flow", revision: "1" },
          colourSystem: { id: "scaffold-indigo", revision: "1" },
          overrides: {},
        }}
      >
        <MatchingRuntimeFixture />
      </CourseThemeProvider>,
    );

    await waitForCondition(() => host.querySelector(".sc-course-matching__item") !== null);
    const item = requiredElement<HTMLButtonElement>(host, ".sc-course-matching__item");
    const target = requiredElement<HTMLButtonElement>(host, ".sc-course-matching__place-action");

    item.focus();
    expect(getComputedStyle(item).outlineStyle).toBe("solid");
    expect(getComputedStyle(item).outlineWidth).toBe("2px");
    target.focus();
    expect(getComputedStyle(target).outlineStyle).toBe("solid");
    expect(getComputedStyle(target).outlineWidth).toBe("2px");
  });

  it("keeps Flow empty-target helper text at AA contrast", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    mountedRoots.push(root);

    root.render(
      <CourseThemeProvider
        appearance="light"
        theme={{
          schemaVersion: 1,
          design: { id: "scaffold-flow", revision: "1" },
          colourSystem: { id: "scaffold-indigo", revision: "1" },
          overrides: {},
        }}
      >
        <MatchingRuntimeFixture />
      </CourseThemeProvider>,
    );

    await waitForCondition(() => host.querySelector(".sc-course-matching__empty-target") !== null);
    const target = requiredElement<HTMLElement>(host, ".sc-course-matching__target");
    const empty = requiredElement<HTMLElement>(target, ".sc-course-matching__empty-target");

    expect(
      contrastRatio(getComputedStyle(empty).color, getComputedStyle(target).backgroundColor),
    ).toBeGreaterThanOrEqual(4.5);
  });
});

describe("Pocket Atlas Matching recipe", () => {
  it.each(["light", "dark"] as const)(
    "keeps authoring fields and runtime states distinct in %s mode",
    async (appearance) => {
      const host = document.createElement("div");
      host.style.width = "56rem";
      document.body.append(host);
      const root = createRoot(host);
      mountedRoots.push(root);

      root.render(
        <CourseThemeProvider
          appearance={appearance}
          theme={{
            schemaVersion: 1,
            design: { id: "pocket-atlas", revision: "1" },
            colourSystem: { id: "pocket-atlas", revision: "1" },
            overrides: {},
          }}
        >
          <MatchingAuthoringFixture />
          <MatchingRuntimeFixture />
        </CourseThemeProvider>,
      );

      await waitForCondition(() => host.querySelector(".sc-course-matching__field") !== null);

      const pairList = requiredElement<HTMLElement>(host, ".sc-course-matching__pair-list");
      const pairGrid = requiredElement<HTMLElement>(host, ".sc-course-matching__pair-grid");
      const field = requiredElement<HTMLElement>(host, ".sc-course-matching__field");
      const runtimeList = requiredElement<HTMLElement>(host, ".sc-course-matching__runtime-list");
      const item = requiredElement<HTMLButtonElement>(host, ".sc-course-matching__item");
      const selectedItem = requiredElement<HTMLButtonElement>(
        host,
        ".sc-course-matching__item[data-selected]",
      );
      const target = requiredElement<HTMLElement>(host, ".sc-course-matching__target");
      const targetAction = requiredElement<HTMLButtonElement>(
        target,
        ".sc-course-matching__place-action",
      );
      const activeTarget = requiredElement<HTMLElement>(
        host,
        ".sc-course-matching__target[data-active]",
      );
      const dragPreview = requiredElement<HTMLElement>(host, ".sc-course-matching__drag-preview");

      expect(Number.parseFloat(getComputedStyle(pairList).rowGap)).toBeGreaterThan(0);
      expect(Number.parseFloat(getComputedStyle(pairGrid).columnGap)).toBeGreaterThan(0);
      expect(Number.parseFloat(getComputedStyle(field).paddingInlineStart)).toBeGreaterThan(0);
      expect(getComputedStyle(field).borderTopWidth).not.toBe("0px");
      expect(getComputedStyle(field).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
      expect(Number.parseFloat(getComputedStyle(runtimeList).rowGap)).toBeGreaterThanOrEqual(
        readShadowBlockEnd(getComputedStyle(item).boxShadow),
      );
      expect(getComputedStyle(target).borderTopStyle).toBe("dashed");
      expect(getComputedStyle(selectedItem).backgroundColor).not.toBe(
        getComputedStyle(item).backgroundColor,
      );
      expect(getComputedStyle(activeTarget).backgroundColor).not.toBe(
        getComputedStyle(target).backgroundColor,
      );
      expect(getComputedStyle(dragPreview).borderTopWidth).toBe(
        getComputedStyle(item).borderTopWidth,
      );
      expect(getComputedStyle(dragPreview).boxShadow).not.toBe("none");

      item.focus();
      expect(getComputedStyle(item).outlineStyle).toBe("solid");
      expect(getComputedStyle(item).outlineWidth).toBe("3px");
      targetAction.focus();
      expect(getComputedStyle(targetAction).outlineStyle).toBe("solid");
      expect(getComputedStyle(targetAction).outlineWidth).toBe("3px");

      const restingItemBackground = getComputedStyle(item).backgroundColor;
      await userEvent.hover(item);
      await waitForCondition(
        () => getComputedStyle(item).backgroundColor !== restingItemBackground,
      );
      expect(getComputedStyle(item).backgroundColor).not.toBe(restingItemBackground);
    },
  );
});

function MatchingAuthoringFixture() {
  return (
    <section className="sc-course-assessment-matching">
      <div className="sc-course-matching__group">
        <div className="sc-course-matching__scroll">
          <div className="sc-course-matching__header">
            <span />
            <span>Items</span>
            <span>Matches</span>
            <span />
          </div>
          <div className="sc-course-matching__pair-list">
            {Array.from({ length: 2 }, (_, index) => (
              <div className="sc-course-matching__pair-grid" key={index}>
                <span className="sc-course-matching__move-cell" />
                <div className="sc-course-matching__field sc-course-matching__field--item">
                  Item {index + 1}
                </div>
                <div className="sc-course-matching__field sc-course-matching__field--target">
                  Match {index + 1}
                </div>
                <span className="sc-course-matching__pair-actions" />
              </div>
            ))}
          </div>
          <button className="sc-app-assessment-choice-add sc-app-matching__add" type="button">
            Add pair
          </button>
        </div>
      </div>
    </section>
  );
}

function MatchingRuntimeFixture() {
  return (
    <section className="sc-course-assessment-matching">
      <div className="sc-course-matching__group">
        <div className="sc-course-matching__scroll">
          <div className="sc-course-matching__canvas">
            <svg aria-hidden className="sc-course-matching__connectors" />
            <div className="sc-course-matching__column sc-course-matching__column--items">
              <div className="sc-course-matching__header">Items</div>
              <div className="sc-course-matching__runtime-list">
                <MatchingItem label="Item one" />
                <MatchingItem label="Selected item" selected />
              </div>
            </div>
            <div className="sc-course-matching__column sc-course-matching__column--targets">
              <div className="sc-course-matching__header">Matches</div>
              <div className="sc-course-matching__runtime-list">
                <MatchingTarget label="Choose an item" />
                <MatchingTarget active label="Place selected item" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="sc-course-matching__drag-preview">
        <div className="sc-course-matching__item-content">Item one</div>
      </div>
    </section>
  );
}

function MatchingItem({ label, selected = false }: { label: string; selected?: boolean }) {
  return (
    <button
      aria-label={`Select ${label}`}
      className="sc-course-matching__item"
      data-selected={selected || undefined}
      type="button"
    >
      <span className="sc-course-matching__item-handle">Drag</span>
      <span className="sc-course-matching__item-content">{label}</span>
    </button>
  );
}

function MatchingTarget({ active = false, label }: { active?: boolean; label: string }) {
  return (
    <div className="sc-course-matching__target" data-active={active || undefined}>
      <button aria-label={label} className="sc-course-matching__place-action" type="button" />
      <span className="sc-course-matching__empty-target">{label}</span>
    </div>
  );
}

function readShadowBlockEnd(boxShadow: string): number {
  const match = boxShadow.match(/(-?[\d.]+)px\s+(-?[\d.]+)px/);
  if (!match) throw new Error(`Expected a pixel offset shadow, received: ${boxShadow}`);
  return Math.max(0, Number(match[2]));
}

function requiredElement<ElementType extends Element>(
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
