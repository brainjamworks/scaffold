import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";

import "@/styles/globals.css";
import "@/editor/assessment/sequencing/Sequencing.css";
import "@/editor/surfaces/variants/slide-sequencing-question/styles.css";
import "@/ui/components/course/AssessmentChoiceAuthoringRow/AssessmentChoiceAuthoringRow.css";

import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { AppThemeProvider } from "@/theme/app/AppThemeProvider";

import "./theme.css";

const mountedRoots: Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("Pocket Atlas Sequencing recipe", () => {
  it("centres Course position markers and the App add marker on one authoring rail", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    mountedRoots.push(root);

    root.render(
      <AppThemeProvider appearance="light">
        <div>
          <CourseThemeProvider
            appearance="light"
            theme={{
              schemaVersion: 1,
              design: { id: "pocket-atlas", revision: "1" },
              colourSystem: { id: "pocket-atlas", revision: "1" },
              overrides: {},
            }}
          >
            <section className="sc-slide-sequencing-question-surface-view sc-slide-sequencing-question-surface-authoring-view">
              <div className="sc-course-sequencing__group" data-sequencing-density="comfortable">
                <div className="sc-course-sequencing__scroll">
                  <ul className="sc-course-sequencing__list">
                    <SequencingItem label="First field note" position={1} />
                    <SequencingItem label="Second field note" position={2} />
                  </ul>
                  <button
                    className="sc-app-assessment-choice-add sc-app-sequencing-add-item"
                    type="button"
                  >
                    <span className="sc-app-sequencing-add-item__position">3</span>
                    <span className="sc-app-assessment-choice-add__icon">+</span>
                    <span>Add item</span>
                  </button>
                </div>
              </div>
            </section>
          </CourseThemeProvider>
        </div>
      </AppThemeProvider>,
    );

    await waitForCondition(() => host.querySelector(".sc-app-sequencing-add-item") !== null);
    const list = requiredElement<HTMLElement>(host, ".sc-course-sequencing__list");
    const position = requiredElement<HTMLElement>(host, ".sc-course-sequencing__position");
    const add = requiredElement<HTMLElement>(host, ".sc-app-sequencing-add-item");
    const addPosition = requiredElement<HTMLElement>(host, ".sc-app-sequencing-add-item__position");
    const listRect = list.getBoundingClientRect();
    const positionRect = position.getBoundingClientRect();
    const addRect = add.getBoundingClientRect();
    const addPositionRect = addPosition.getBoundingClientRect();
    const railOffset = Number.parseFloat(getComputedStyle(list, "::before").left);
    const addRailOffset = Number.parseFloat(getComputedStyle(add, "::before").left);

    expect(listRect.left + railOffset).toBeCloseTo(positionRect.left + positionRect.width / 2, 0);
    expect(addRect.left + addRailOffset).toBeCloseTo(listRect.left + railOffset, 0);
    expect(addPositionRect.left + addPositionRect.width / 2).toBeCloseTo(
      listRect.left + railOffset,
      0,
    );
  });

  it.each(["light", "dark"] as const)(
    "keeps rows distinct and the runtime drag affordance visible in %s mode",
    async (appearance) => {
      const host = document.createElement("div");
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
          <section className="sc-course-assessment-sequencing">
            <div className="sc-course-sequencing__group">
              <div className="sc-course-sequencing__scroll">
                <ul className="sc-course-sequencing__list">
                  <SequencingItem label="First field note" />
                  <SequencingItem label="Second field note" />
                </ul>
              </div>
            </div>
            <div className="sc-course-sequencing__drag-preview" data-testid="drag-preview">
              <div className="sc-course-sequencing__item-content">First field note</div>
            </div>
          </section>
        </CourseThemeProvider>,
      );

      await waitForCondition(() => host.querySelector(".sc-course-sequencing__item") !== null);

      const list = requiredElement<HTMLElement>(host, ".sc-course-sequencing__list");
      const item = requiredElement<HTMLElement>(host, ".sc-course-sequencing__item");
      const handle = requiredElement<HTMLButtonElement>(
        host,
        ".sc-course-sequencing__runtime-handle",
      );
      const dragPreview = requiredElement<HTMLElement>(host, '[data-testid="drag-preview"]');
      const itemStyle = getComputedStyle(item);
      const shadowBlockEnd = readShadowBlockEnd(itemStyle.boxShadow);

      expect(Number.parseFloat(getComputedStyle(list).rowGap)).toBeGreaterThanOrEqual(
        shadowBlockEnd,
      );
      expect(Number.parseFloat(itemStyle.columnGap)).toBeGreaterThan(0);
      expect(getComputedStyle(dragPreview).borderTopWidth).toBe(itemStyle.borderTopWidth);
      expect(getComputedStyle(dragPreview).backgroundColor).toBe(itemStyle.backgroundColor);
      expect(getComputedStyle(dragPreview).boxShadow).not.toBe("none");
      expect(handle.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
      expect(handle.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);

      const restingHandleBackground = getComputedStyle(handle).backgroundColor;
      const restingItemBackground = getComputedStyle(item).backgroundColor;
      await userEvent.hover(handle);
      await waitForCondition(
        () => getComputedStyle(handle).backgroundColor !== restingHandleBackground,
      );
      expect(getComputedStyle(handle).backgroundColor).not.toBe(restingHandleBackground);
      expect(getComputedStyle(item).backgroundColor).not.toBe(restingItemBackground);

      await userEvent.unhover(handle);
      handle.focus();
      expect(document.activeElement).toBe(handle);
      expect(getComputedStyle(handle).outlineStyle).toBe("solid");
      expect(getComputedStyle(handle).outlineWidth).toBe("3px");
    },
  );
});

function SequencingItem({ label, position }: { label: string; position?: number }) {
  return (
    <li className="sc-course-sequencing__item" data-draggable="">
      {position ? <span className="sc-course-sequencing__position">{position}</span> : null}
      <button
        aria-label={`Drag ${label}`}
        className="sc-course-sequencing__runtime-handle"
        type="button"
      >
        Drag
      </button>
      <div className="sc-course-sequencing__item-content">{label}</div>
    </li>
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
