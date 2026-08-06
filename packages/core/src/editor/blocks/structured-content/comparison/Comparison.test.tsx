// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { createBlockInsertActions } from "@/editor/insertion/block-insert-action";
import { createInsertCatalog } from "@/editor/insertion/insert-catalog";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { describeBlockContract } from "@/editor/testing";
import { createDisposableEditor } from "@/editor/testing/disposable-editor";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";

import {
  COMPARISON_CELL_NODE,
  COMPARISON_NODE,
  COMPARISON_ROW_NODE,
  createComparisonRow,
  emptyComparisonData,
} from "./content";
import { comparisonBlockDefinition } from "./comparison-definition";
import { ComparisonAuthoringExtension } from "./comparison-authoring-extension";
import { ComparisonRuntimeExtension } from "./comparison-runtime-extension";

const blockInsertCatalog = createInsertCatalog(
  createBlockInsertActions([comparisonBlockDefinition]),
);

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: COMPARISON_NODE,
  actionId: "comparison",
  extensions: [createScaffoldInteractionOwnerExtension(builtInBlockRegistry)],
  expectsConfiguration: true,
  expectsFrame: true,
  expectsAuthoringFrame: true,
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

function comparisonFixture(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: COMPARISON_NODE,
        attrs: {
          id: "comparison-fixture",
          data: {
            type: "comparison",
            leftLabel: "Before",
            rightLabel: "After",
          },
        },
        content: [createComparisonRow(0), createComparisonRow(1)],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Keep after comparison" }],
      },
    ],
  };
}

function renderComparisonEditor(content: JSONContent = comparisonFixture()) {
  const fixture = createDisposableEditor({
    extensions: [
      StarterKit.configure({
        undoRedo: false,
        paragraph: false,
      }),
      ExtendedParagraph,
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
      createRuntimeBlockFrameAttributesExtension([COMPARISON_NODE]),
      ComparisonAuthoringExtension,
    ],
    content,
  });

  render(createElement(EditorContent, { editor: fixture.editor }));

  return fixture;
}

function renderComparisonRuntime(content: JSONContent = comparisonFixture()) {
  const fixture = createDisposableEditor({
    editable: false,
    extensions: [
      StarterKit.configure({
        undoRedo: false,
        paragraph: false,
      }),
      ExtendedParagraph,
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
      createRuntimeBlockFrameAttributesExtension([COMPARISON_NODE]),
      ComparisonRuntimeExtension,
    ],
    content,
  });

  render(createElement(EditorContent, { editor: fixture.editor }));

  return fixture;
}

describe("comparison block", () => {
  it("renders configured labels as Course-owned ARIA table semantics", async () => {
    const fixture = renderComparisonEditor();

    const table = await screen.findByRole("table", {
      name: "Before compared with After",
    });

    expect(table.classList.contains("sc-course-comparison__surface")).toBe(true);
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Before",
      "After",
    ]);
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getAllByRole("cell")).toHaveLength(4);
    expect(document.body.querySelector('[class*="sc-comparison"]')).toBeNull();

    fixture.destroy();
  });

  it("constructs serialized defaults in the Comparison feature", () => {
    expect(emptyComparisonData()).toEqual({
      type: "comparison",
      leftLabel: "Option A",
      rightLabel: "Option B",
    });
    expect(emptyComparisonData({ leftLabel: "Before", rightLabel: "After" })).toEqual({
      type: "comparison",
      leftLabel: "Before",
      rightLabel: "After",
    });
  });

  it("seeds catalog content as a comparison block with row and cell nodes", () => {
    const insertContent = blockInsertCatalog.getById("comparison")?.content() as
      | JSONContent
      | undefined;

    expect(insertContent?.type).toBe(COMPARISON_NODE);
    expect(insertContent?.attrs?.["id"]).toMatch(/^[0-9A-Z_a-z-]{12}$/);
    expect(insertContent?.attrs?.["data"]).toMatchObject({
      type: "comparison",
      leftLabel: "Option A",
      rightLabel: "Option B",
    });
    expect(insertContent?.attrs?.["variant"]).toBeUndefined();
    expect(insertContent?.content?.map((child) => child.type)).toEqual([
      COMPARISON_ROW_NODE,
      COMPARISON_ROW_NODE,
    ]);
    expect(insertContent?.content?.[0]?.content?.map((child) => child.type)).toEqual([
      COMPARISON_CELL_NODE,
      COMPARISON_CELL_NODE,
    ]);
  });

  it("renders comparison row chrome without layout-specific targets", async () => {
    const fixture = renderComparisonEditor();

    await waitFor(() => {
      expect(document.body.querySelector('[data-node="comparison-row"]')).not.toBeNull();
    });

    expect(document.body.querySelector('[data-authoring-frame="block"]')).not.toBeNull();
    expect(document.body.querySelector('[data-authoring-frame="layout"]')).toBeNull();
    expect(document.body.querySelector("[data-layout-kind]")).toBeNull();
    expect(await screen.findByRole("button", { name: "Delete comparison row 2" })).not.toBeNull();

    fixture.destroy();
  });

  it("deletes the requested comparison row and keeps following content", async () => {
    const user = userEvent.setup();
    const fixture = renderComparisonEditor();

    await user.click(
      await screen.findByRole("button", {
        name: "Delete comparison row 2",
      }),
    );

    await waitFor(() => {
      expect(fixture.json().content?.[0]?.content).toHaveLength(1);
    });

    expect(fixture.topLevelNodeTypes()).toEqual(["comparison", "paragraph"]);
    expect(fixture.editor.state.doc.textContent).toContain("Keep after comparison");

    fixture.destroy();
  });

  it("keeps the last row delete control focusable with a minimum-row explanation", async () => {
    const content = comparisonFixture();
    content.content![0]!.content = [createComparisonRow(0)];
    const fixture = renderComparisonEditor(content);

    const deleteButton = await screen.findByRole("button", {
      name: "Delete comparison row 1",
    });
    const explanationId = deleteButton.getAttribute("aria-describedby");

    expect(deleteButton.getAttribute("aria-disabled")).toBe("true");
    expect(deleteButton).not.toHaveAttribute("disabled");
    expect(explanationId).not.toBeNull();
    expect(document.getElementById(explanationId!)?.textContent).toBe(
      "A comparison must contain at least one row.",
    );

    fixture.destroy();
  });

  it("derives cell labels from parent data without rendering App controls at runtime", async () => {
    const fixture = renderComparisonRuntime();

    const table = await screen.findByRole("table", {
      name: "Before compared with After",
    });
    const labels = table.querySelectorAll<HTMLElement>(".sc-course-comparison__cell-label");
    const cells = screen.getAllByRole("cell");

    expect(Array.from(labels, (label) => label.textContent)).toEqual([
      "Before",
      "After",
      "Before",
      "After",
    ]);
    expect(cells[0]?.getAttribute("aria-labelledby")).toBe(
      "sc-course-comparison-comparison-fixture-left-header",
    );
    expect(cells[1]?.getAttribute("aria-labelledby")).toBe(
      "sc-course-comparison-comparison-fixture-right-header",
    );
    expect(table.querySelector('[class*="sc-app-comparison-"]')).toBeNull();
    expect(screen.queryByRole("button", { name: "Add row" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Delete comparison row/ })).toBeNull();

    fixture.destroy();
  });

  it("adds a new blank row through the comparison ghost affordance", async () => {
    const user = userEvent.setup();
    const fixture = renderComparisonEditor();

    await user.click(await screen.findByRole("button", { name: "Add row" }));

    await waitFor(() => {
      expect(fixture.json().content?.[0]?.content).toHaveLength(3);
    });

    const comparison = fixture.json().content?.[0];
    expect(comparison?.content?.[2]?.type).toBe(COMPARISON_ROW_NODE);
    expect(comparison?.content?.[2]?.content).toHaveLength(2);

    fixture.destroy();
  });
});
