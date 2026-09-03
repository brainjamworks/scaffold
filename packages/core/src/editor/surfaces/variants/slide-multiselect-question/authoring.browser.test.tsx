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
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";

import "@/styles/globals.css";
import "@/theme/app/AppThemeProvider.css";
import "@/theme/course/designs/pocket-atlas/v1/theme.css";
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

describe("full-slide Multi-select authoring", () => {
  it("keeps App-owned correctness, movement, and Add controls on the full-width rail", async () => {
    await page.viewport(1100, 700);
    const host = document.createElement("section");
    host.className = "sc-app radix-themes light";
    host.style.cssText = "position:absolute;inset:0 auto auto 0;width:1024px;height:420px;";
    const reactHost = document.createElement("div");
    host.append(reactHost);
    document.body.append(host);

    editor = createAuthoringEditor();
    root = createRoot(reactHost);
    root.render(
      createAuthoringMovementTestRoot(
        editor,
        <CourseThemeProvider
          appearance="light"
          theme={{
            schemaVersion: 1,
            design: { id: "pocket-atlas", revision: "1" },
            colourSystem: { id: "pocket-atlas", revision: "1" },
            overrides: {},
          }}
        >
          <EditorContent editor={editor} />
        </CourseThemeProvider>,
        host,
      ),
    );

    await waitForCondition(() =>
      host.querySelector(".sc-slide-multiselect-question-surface-authoring-view"),
    );
    const surface = requiredElement<HTMLElement>(
      host,
      ".sc-slide-multiselect-question-surface-authoring-view",
    );
    const group = requiredElement<HTMLElement>(surface, '[data-slot="assessment-choices-group"]');
    const rail = requiredElement<HTMLElement>(
      group,
      ".sc-app-assessment-choices-scroll--authoring",
    );
    const add = requiredElement<HTMLButtonElement>(rail, ".sc-app-assessment-choice-add");
    const rows = () =>
      Array.from(rail.querySelectorAll<HTMLElement>(".sc-course-assessment-choice--authoring"));

    expect(group.getBoundingClientRect().width).toBeGreaterThan(
      surface.getBoundingClientRect().width * 0.8,
    );
    expect(getComputedStyle(rail).overflowY).toBe("auto");
    expect(Number.parseFloat(getComputedStyle(group).paddingBlockStart)).toBeLessThanOrEqual(8);
    expect(rows()).toHaveLength(4);
    expect(add.closest(".sc-app-assessment-choices-scroll--authoring")).toBe(rail);
    expect(add.querySelector("[class^='sc-course-']")).toBeNull();
    expect(add.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      rail.getBoundingClientRect().top,
    );
    expect(add.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      rail.getBoundingClientRect().bottom + 1,
    );
    expect(
      rows().every(
        (row) => row.querySelectorAll(".sc-app-assessment-choice__authoring-action").length >= 3,
      ),
    ).toBe(true);
    const correctness = rows().map((row) =>
      requiredElement<HTMLButtonElement>(row, '[data-intent="correctness"]'),
    );
    expect(correctness[0]).toHaveAttribute("data-active");
    expect(correctness[1]).toHaveAttribute("data-active");
    expect(correctness[2]).toHaveAttribute("aria-disabled", "true");
    expect(correctness[2]).toHaveAccessibleDescription(
      "Increase max selections or unmark another correct answer.",
    );

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
  const definition = builtInSurfaceVariantRegistry.get("slide-multiselect-question");
  if (!definition) throw new Error("Expected slide-multiselect-question Surface definition.");
  const surface = definition.createSurface({
    surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
  });
  const question = surface.content?.[0];
  if (!question) throw new Error("Expected Surface Multi-select question.");
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
                attrs: {
                  ...question.attrs,
                  id: "target000001",
                  settings: { ...question.attrs?.["settings"], maxSelect: 2 },
                },
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
    if (node.type.name === "selectable_choice") ids.push(String(node.attrs["id"] ?? ""));
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
