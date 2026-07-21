// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { builtInInsertCatalog } from "@/editor/insertion/built-in-insert-catalog";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import type { InsertAction } from "@/editor/insertion/insert-action";
import {
  AUTHORING_CHROME_ATTR,
  AuthoringChromeKind,
} from "@/editor/interactions/dom/authoring-chrome";
import { createScaffoldDocumentContent } from "@/format/artifact";

import { BlockStrip } from "./BlockStrip";

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(() =>
    DOMRect.fromRect({
      height: 32,
      width: 96,
      x: 48,
      y: 48,
    }),
  );
  vi.spyOn(Element.prototype, "getClientRects").mockImplementation(
    function mockClientRects(this: Element) {
      return [this.getBoundingClientRect()] as unknown as DOMRectList;
    },
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
    function clientWidth(this: HTMLElement) {
      return this === document.documentElement || this === document.body ? 1024 : 96;
    },
  );
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
    function clientHeight(this: HTMLElement) {
      return this === document.documentElement || this === document.body ? 768 : 32;
    },
  );
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(
    function scrollWidth(this: HTMLElement) {
      return this.clientWidth;
    },
  );
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
    function scrollHeight(this: HTMLElement) {
      return this.clientHeight;
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

function makeEditor() {
  return new Editor({
    extensions: [...createCourseDocumentAuthoringExtensions({ editable: true })],
    content: createScaffoldDocumentContent({ mode: "page" }),
  });
}

function catalogItem(id: string): InsertAction {
  const item = builtInInsertCatalog.getById(id);
  if (!item) throw new Error(`Insert action "${id}" is not built in`);
  return item;
}

function renderBuiltInBlockStrip(editor: Editor) {
  return render(
    <BlockStrip
      blockDefinitions={builtInBlockRegistry}
      editor={editor}
      items={builtInInsertCatalog.actions}
      surfaceVariants={builtInSurfaceVariantRegistry}
    />,
  );
}

describe("BlockStrip", () => {
  it("exposes category popovers as labelled insert panels", async () => {
    const editor = makeEditor();

    renderBuiltInBlockStrip(editor);

    expect(screen.getByRole("complementary", { name: "Insert block" })).toBeInTheDocument();

    const contentTrigger = screen.getByRole("button", { name: "Content" });
    expect(contentTrigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(contentTrigger.getAttribute("aria-expanded")).toBe("false");

    await userEvent.click(contentTrigger);

    expect(contentTrigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("dialog", { name: "Content blocks" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Content blocks" })).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    expect(contentTrigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("dialog", { name: "Content blocks" })).toBeNull();
    expect(document.activeElement).toBe(contentTrigger);

    editor.destroy();
  });

  it("marks category and variant popovers as editor floating authoring chrome", async () => {
    const editor = makeEditor();

    renderBuiltInBlockStrip(editor);

    await userEvent.click(screen.getByRole("button", { name: "Content" }));

    const contentDialog = screen.getByRole("dialog", { name: "Content blocks" });
    expect(contentDialog.getAttribute(AUTHORING_CHROME_ATTR)).toBe(AuthoringChromeKind.Popover);

    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Data" }));

    const dataDialog = screen.getByRole("dialog", { name: "Data blocks" });
    expect(dataDialog.getAttribute(AUTHORING_CHROME_ATTR)).toBe(AuthoringChromeKind.Popover);

    const chartTrigger = screen.getByRole("button", {
      name: "Chart, opens variants",
    });
    chartTrigger.focus();
    await userEvent.keyboard("{ArrowRight}");

    const variantDialog = await waitFor(() =>
      screen.getByRole("dialog", { name: "Chart variants" }),
    );
    expect(variantDialog.getAttribute(AUTHORING_CHROME_ATTR)).toBe(AuthoringChromeKind.Popover);

    editor.destroy();
  });

  it("renders only supplied categories and variants", async () => {
    const editor = makeEditor();
    const chart = catalogItem("chart");
    const chartVariants = builtInInsertCatalog.actions.filter(
      (item) => item.variantOf === chart.id,
    );
    const includedVariant = chartVariants[0];
    const excludedVariant = chartVariants[1];
    if (!includedVariant || !excludedVariant) {
      throw new Error("Chart catalog needs at least two variants for this test");
    }

    render(
      <BlockStrip
        blockDefinitions={builtInBlockRegistry}
        editor={editor}
        items={[chart, includedVariant]}
        surfaceVariants={builtInSurfaceVariantRegistry}
      />,
    );

    expect(screen.queryByRole("button", { name: "Content" })).toBeNull();
    expect(screen.getByRole("button", { name: "Data" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Data" }));
    const dataDialog = screen.getByRole("dialog", { name: "Data blocks" });
    expect(screen.getByRole("button", { name: "Chart, opens variants" })).toBeInTheDocument();
    expect(dataDialog.querySelector(".sc-block-strip-header-count")?.textContent).toBe("2");
    expect(dataDialog.textContent).not.toContain(excludedVariant.title);

    editor.destroy();
  });

  it("inserts a supplied catalog item through the checked insertion path", async () => {
    const editor = makeEditor();
    document.body.append(editor.view.dom);
    const callout = catalogItem("callout");

    render(
      <BlockStrip
        blockDefinitions={builtInBlockRegistry}
        editor={editor}
        items={[callout]}
        surfaceVariants={builtInSurfaceVariantRegistry}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Content" }));
    await userEvent.click(screen.getByRole("button", { name: "Callout" }));

    await waitFor(() => {
      let hasCallout = false;
      editor.state.doc.descendants((node) => {
        if (node.type.name === callout.nodeType) hasCallout = true;
      });
      expect(hasCallout).toBe(true);
    });

    editor.view.dom.remove();
    editor.destroy();
  });

  it("connects block row names, descriptions, and disabled reasons", async () => {
    const editor = makeEditor();

    renderBuiltInBlockStrip(editor);

    await userEvent.click(screen.getByRole("button", { name: "Media" }));

    const gallery = screen.getByRole("button", { name: "Gallery" });
    const describedBy = gallery.getAttribute("aria-describedby") ?? "";
    const describedByIds = describedBy.split(/\s+/);

    expect(describedByIds).toContain("block-strip-item-gallery-description");
    expect(document.getElementById("block-strip-item-gallery-description")?.textContent).toBe(
      "Multi-image carousel or grid with fullscreen viewer",
    );

    if (gallery.hasAttribute("disabled")) {
      expect(describedByIds).toContain("block-strip-item-gallery-disabled-reason");
      expect(document.getElementById("block-strip-item-gallery-disabled-reason")?.textContent).toBe(
        "Cannot insert this block here.",
      );
    }

    editor.destroy();
  });

  it("moves focus through category triggers with arrow, home, and end keys", async () => {
    const editor = makeEditor();

    renderBuiltInBlockStrip(editor);

    const categories = screen
      .getAllByRole("button")
      .filter((button) => button.hasAttribute("data-block-strip-category-trigger"));
    expect(categories.length).toBeGreaterThan(1);

    categories[0]?.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(categories[1]);

    await userEvent.keyboard("{End}");
    expect(document.activeElement).toBe(categories.at(-1));

    await userEvent.keyboard("{Home}");
    expect(document.activeElement).toBe(categories[0]);

    await userEvent.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(categories.at(-1));

    editor.destroy();
  });

  it("moves focus through open block rows with arrow, home, and end keys", async () => {
    const editor = makeEditor();

    renderBuiltInBlockStrip(editor);

    await userEvent.click(screen.getByRole("button", { name: "Media" }));

    const mediaButtons = screen
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-describedby")?.startsWith("block-strip-item-"));
    expect(mediaButtons.length).toBeGreaterThan(1);

    mediaButtons[0]?.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(mediaButtons[1]);

    await userEvent.keyboard("{End}");
    expect(document.activeElement).toBe(mediaButtons.at(-1));

    await userEvent.keyboard("{Home}");
    expect(document.activeElement).toBe(mediaButtons[0]);

    await userEvent.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(mediaButtons.at(-1));

    editor.destroy();
  });

  it("returns focus to the editor after inserting a block", async () => {
    const editor = makeEditor();
    document.body.append(editor.view.dom);

    renderBuiltInBlockStrip(editor);

    await userEvent.click(screen.getByRole("button", { name: "Content" }));

    const contentDialog = screen.getByRole("dialog", {
      name: "Content blocks",
    });
    const insertButton = contentDialog.querySelector<HTMLButtonElement>("button:not(:disabled)");
    if (!insertButton) {
      throw new Error("No enabled content block insert row rendered");
    }

    await userEvent.click(insertButton);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Content blocks" })).toBeNull();
      expect(editor.isFocused).toBe(true);
    });

    editor.view.dom.remove();
    editor.destroy();
  });

  it("exposes variant drill-ins as dialog popovers, not menu popups", async () => {
    const editor = makeEditor();

    renderBuiltInBlockStrip(editor);

    await userEvent.click(screen.getByRole("button", { name: "Data" }));

    const chartTrigger = screen
      .getAllByRole("button")
      .find((button) => button.textContent?.includes("Chart"));
    if (!chartTrigger) {
      throw new Error("Chart insert row did not render");
    }
    expect(chartTrigger.getAttribute("aria-label")).toBe("Chart, opens variants");
    expect(chartTrigger.getAttribute("aria-haspopup")).toBe("dialog");

    fireEvent.focus(chartTrigger);
    await userEvent.keyboard("{ArrowRight}");

    await waitFor(() => {
      const variantDialog = document.querySelector('[role="dialog"][aria-label="Chart variants"]');
      const variantList = document.querySelector('[role="list"][aria-label="Chart variants"]');
      if (!variantDialog || !variantList) {
        throw new Error("Chart variants popup did not expose dialog and list labels");
      }
    });

    editor.destroy();
  });

  it("moves focus through variant rows with arrow, home, and end keys", async () => {
    const editor = makeEditor();

    renderBuiltInBlockStrip(editor);

    await userEvent.click(screen.getByRole("button", { name: "Data" }));

    const chartTrigger = screen.getByRole("button", {
      name: "Chart, opens variants",
    });
    chartTrigger.focus();
    await userEvent.keyboard("{ArrowRight}");

    const variantList = await waitFor(() => screen.getByRole("list", { name: "Chart variants" }));
    const variantButtons = Array.from(
      variantList.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
    );
    expect(variantButtons.length).toBeGreaterThan(1);

    variantButtons[0]?.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(variantButtons[1]);

    await userEvent.keyboard("{End}");
    expect(document.activeElement).toBe(variantButtons.at(-1));

    await userEvent.keyboard("{Home}");
    expect(document.activeElement).toBe(variantButtons[0]);

    await userEvent.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(variantButtons.at(-1));

    editor.destroy();
  });

  it("returns focus to the editor after inserting a variant block", async () => {
    const editor = makeEditor();
    document.body.append(editor.view.dom);

    renderBuiltInBlockStrip(editor);

    await userEvent.click(screen.getByRole("button", { name: "Data" }));

    const chartTrigger = screen.getByRole("button", {
      name: "Chart, opens variants",
    });
    chartTrigger.focus();
    await userEvent.keyboard("{ArrowRight}");

    const variantList = await waitFor(() => screen.getByRole("list", { name: "Chart variants" }));
    const variantButton = variantList.querySelector<HTMLButtonElement>("button:not(:disabled)");
    if (!variantButton) {
      throw new Error("No enabled chart variant row rendered");
    }

    await userEvent.click(variantButton);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Data blocks" })).toBeNull();
      expect(screen.queryByRole("dialog", { name: "Chart variants" })).toBeNull();
      expect(editor.isFocused).toBe(true);
    });

    editor.view.dom.remove();
    editor.destroy();
  });
});
