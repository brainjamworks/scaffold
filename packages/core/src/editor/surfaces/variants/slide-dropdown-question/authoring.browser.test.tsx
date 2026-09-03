import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { Editor, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { createAuthoringMovementTestRoot } from "@/editor/movement/tests/authoring-movement-test-root";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";

import "@/styles/globals.css";
import "@/theme/app/AppThemeProvider.css";
import "@/theme/course/designs/scaffold-flow/v1/theme.css";

let root: Root | null = null;
let editor: Editor | null = null;

afterEach(() => {
  root?.unmount();
  editor?.destroy();
  root = null;
  editor = null;
  document.body.replaceChildren();
});

describe("full-slide Dropdown authoring", () => {
  it("keeps App-owned correctness, feedback, movement, delete, and Add controls on the rail", async () => {
    await page.viewport(1100, 700);
    const host = document.createElement("section");
    host.className = "sc-app radix-themes light";
    host.style.cssText = "position:absolute;inset:0 auto auto 0;width:1024px;height:576px;";
    const reactHost = document.createElement("div");
    host.append(reactHost);
    document.body.append(host);

    editor = createAuthoringEditor();
    root = createRoot(reactHost);
    root.render(createAuthoringMovementTestRoot(editor, <EditorContent editor={editor} />, host));

    await waitForCondition(() =>
      host.querySelector(".sc-slide-dropdown-question-surface-authoring-view"),
    );
    const surface = requiredElement<HTMLElement>(
      host,
      ".sc-slide-dropdown-question-surface-authoring-view",
    );
    const group = requiredElement<HTMLElement>(surface, '[data-slot="dropdown-choices-group"]');
    const rail = requiredElement<HTMLElement>(
      group,
      ".sc-app-assessment-choices-scroll--authoring",
    );
    const add = requiredElement<HTMLButtonElement>(rail, ".sc-app-assessment-choice-add");
    const rows = () =>
      Array.from(rail.querySelectorAll<HTMLElement>('[data-node="dropdown-choice"]'));

    expect(group.getBoundingClientRect().width).toBeGreaterThan(
      surface.getBoundingClientRect().width * 0.8,
    );
    expect(getComputedStyle(rail).overflowY).toBe("auto");
    expect(rows()).toHaveLength(4);
    expect(
      rows().every((row) => {
        const surface = requiredElement<HTMLElement>(
          row,
          ".sc-app-assessment-choice-authoring-surface",
        );
        return !surface.classList.contains("sc-course-assessment-choice");
      }),
    ).toBe(true);
    expect(add.closest(".sc-app-assessment-choices-scroll--authoring")).toBe(rail);
    expect(add.querySelector("[class^='sc-course-']")).toBeNull();
    expect(
      rows().every(
        (row) => row.querySelectorAll(".sc-app-assessment-choice__authoring-action").length >= 3,
      ),
    ).toBe(true);
    expect(
      requiredElement<HTMLButtonElement>(rows()[0]!, '[data-intent="correctness"]'),
    ).toHaveAttribute("data-active");

    const initialChoiceIds = choiceIds(editor);
    const firstHandle = requiredElement<HTMLButtonElement>(
      rows()[0]!,
      "[data-contained-movement-handle]",
    );
    firstHandle.focus({ preventScroll: true });
    await userEvent.keyboard("{Space}");
    await waitForCondition(() => host.querySelector("[data-interaction-drag-overlay]"));
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{Space}");
    await waitForCondition(() => !host.querySelector("[data-interaction-drag-overlay]"));
    expect(choiceIds(editor)).toEqual([
      initialChoiceIds[1],
      initialChoiceIds[0],
      ...initialChoiceIds.slice(2),
    ]);

    await userEvent.click(add);
    await waitForCondition(() => rows().length === 5);
    expect(choiceIds(editor)).toHaveLength(5);
    expect(rail.lastElementChild).toBe(add);

    await userEvent.click(
      requiredElement<HTMLButtonElement>(rows()[1]!, '[aria-label="Delete choice 2"]'),
    );
    await waitForCondition(() => choiceIds(editor!).length === 4);
    expect(choiceIds(editor)).not.toContain(initialChoiceIds[0]);
  });
});

function createAuthoringEditor(): Editor {
  const composition = createCoreScaffoldAuthoringComposition();
  return new Editor({
    extensions: createCourseDocumentAuthoringExtensions({ editable: true, composition }),
    content: authoringDocument(),
  });
}

function authoringDocument(): JSONContent {
  const definition = builtInSurfaceVariantRegistry.get("slide-dropdown-question");
  if (!definition) throw new Error("Expected slide-dropdown-question Surface definition.");
  const surface = definition.createSurface({
    surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
  });
  const question = surface.content?.[0];
  if (!question) throw new Error("Expected Surface Dropdown question.");
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { mode: "slideshow" },
        content: [
          { type: "courseSection", attrs: { id: createEmbeddedNodeId(), title: "Intro" } },
          {
            ...surface,
            content: [
              {
                ...question,
                attrs: { ...question.attrs, id: "target000001" },
              },
            ],
          },
        ],
      },
    ],
  };
}

function choiceIds(currentEditor: Editor): string[] {
  const ids: string[] = [];
  currentEditor.state.doc.descendants((node) => {
    if (node.type.name === "dropdown_choice") ids.push(String(node.attrs["id"] ?? ""));
    return true;
  });
  return ids;
}

function requiredElement<T extends Element>(owner: ParentNode, selector: string): T {
  const element = owner.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element ${selector}.`);
  return element;
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 8_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for authoring fixture.");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
