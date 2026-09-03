import { afterEach, describe, expect, it } from "vite-plus/test";

import "@/editor/movement/view/movement-handles.css";
import "@/ui/components/course/AssessmentChoiceAuthoringRow/AssessmentChoiceAuthoringRow.css";
import "@/editor/assessment/sequencing/Sequencing.css";

afterEach(() => {
  document.body.replaceChildren();
});

describe("Sequencing authoring layout", () => {
  it("keeps the contained movement handle visible at rest", () => {
    const fixture = createConstrainedItem();

    expect(getComputedStyle(fixture.movement).opacity).toBe("1");
  });

  it("keeps item content and authoring actions on one constrained row", () => {
    const fixture = createConstrainedItem();
    const contentRect = fixture.content.getBoundingClientRect();
    const rowCenter = contentRect.top + contentRect.height / 2;

    for (const control of [fixture.movement, fixture.feedback, fixture.remove]) {
      const controlRect = control.getBoundingClientRect();
      expect(controlRect.top + controlRect.height / 2).toBeCloseTo(rowCenter, 0);
    }
  });
});

function createConstrainedItem() {
  const host = document.createElement("div");
  host.style.width = "20rem";
  host.style.containerType = "inline-size";

  const item = document.createElement("div");
  item.className = "sc-course-sequencing__item";
  item.setAttribute("data-contained-movement-target", "");
  item.innerHTML = `
    <button
      class="sc-app-contained-movement-handle"
      type="button"
    >Move</button>
    <div class="sc-course-sequencing__item-content">A sequencing item with wrapping text</div>
    <button
      class="sc-app-assessment-choice__authoring-action"
      data-intent="feedback"
      type="button"
    >Feedback</button>
    <button
      class="sc-app-assessment-choice__authoring-action"
      data-intent="delete"
      type="button"
    >Delete</button>
  `;
  host.append(item);
  document.body.append(host);

  return {
    content: requireElement<HTMLElement>(item, ".sc-course-sequencing__item-content"),
    feedback: requireElement<HTMLButtonElement>(item, '[data-intent="feedback"]'),
    movement: requireElement<HTMLButtonElement>(item, ".sc-app-contained-movement-handle"),
    remove: requireElement<HTMLButtonElement>(item, '[data-intent="delete"]'),
  };
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing test element: ${selector}`);
  return element;
}
