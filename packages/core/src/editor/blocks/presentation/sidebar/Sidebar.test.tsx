// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { SidebarDataSchema as ContractSidebarDataSchema } from "@scaffold/contracts";

import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { createBlockInsertActions } from "@/editor/insertion/block-insert-action";
import { createInsertCatalog } from "@/editor/insertion/insert-catalog";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { describeBlockContract } from "@/editor/testing";
import { createDisposableEditor } from "@/editor/testing/disposable-editor";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";

import {
  SIDEBAR_BODY_NODE,
  SIDEBAR_LABEL_NODE,
  SIDEBAR_NODE,
  SIDEBAR_TITLE_NODE,
  emptySidebarData,
} from "./content";
import { sidebarBlockDefinition } from "./sidebar-definition";
import { SidebarAuthoringExtension } from "./sidebar-authoring-extension";
import { SidebarRuntimeExtension } from "./sidebar-runtime-extension";

const blockInsertCatalog = createInsertCatalog(createBlockInsertActions([sidebarBlockDefinition]));

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: SIDEBAR_NODE,
  actionId: "sidebar",
  extensions: [createScaffoldInteractionOwnerExtension(builtInBlockRegistry)],
  expectsFrame: true,
  expectsAuthoringFrame: true,
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

function renderSidebarEditor(content: JSONContent = sidebarFixture()) {
  const fixture = createDisposableEditor({
    extensions: [
      StarterKit.configure({
        undoRedo: false,
        paragraph: false,
      }),
      ExtendedParagraph,
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
      createRuntimeBlockFrameAttributesExtension([SIDEBAR_NODE]),
      SidebarAuthoringExtension,
    ],
    content,
  });

  render(createElement(EditorContent, { editor: fixture.editor }));

  return fixture;
}

function renderSidebarRuntime(content: JSONContent = sidebarFixture()) {
  const fixture = createDisposableEditor({
    editable: false,
    extensions: [
      StarterKit.configure({
        undoRedo: false,
        paragraph: false,
      }),
      ExtendedParagraph,
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
      createRuntimeBlockFrameAttributesExtension([SIDEBAR_NODE]),
      SidebarRuntimeExtension,
    ],
    content,
  });

  render(createElement(EditorContent, { editor: fixture.editor }));

  return fixture;
}

function sidebarFixture(): JSONContent {
  const insertContent = blockInsertCatalog.getById("sidebar")?.content() as JSONContent | undefined;

  if (!insertContent) {
    throw new Error("Expected sidebar insert content to be registered.");
  }

  return {
    type: "doc",
    content: [insertContent],
  };
}

describe("sidebar block", () => {
  it("constructs serialized defaults in the Sidebar feature", () => {
    expect(ContractSidebarDataSchema.parse(emptySidebarData())).toEqual({
      type: "sidebar",
      icon: null,
    });
    expect(emptySidebarData({ icon: { kind: "emoji", value: "💡" } })).toEqual({
      type: "sidebar",
      icon: { kind: "emoji", value: "💡" },
    });
  });

  it("seeds catalog content as a sidebar block with icon data and field slots", () => {
    const insertContent = blockInsertCatalog.getById("sidebar")?.content() as
      | JSONContent
      | undefined;

    expect(insertContent?.type).toBe(SIDEBAR_NODE);
    expect(insertContent?.attrs?.["id"]).toMatch(/^[0-9A-Z_a-z-]{12}$/);
    expect(insertContent?.attrs?.["data"]).toEqual({
      type: "sidebar",
      icon: null,
    });
    expect(insertContent?.attrs?.["variant"]).toBeUndefined();
    expect(insertContent?.content?.map((child) => child.type)).toEqual([
      SIDEBAR_LABEL_NODE,
      SIDEBAR_TITLE_NODE,
      SIDEBAR_BODY_NODE,
    ]);
  });

  it("renders an editable icon picker and label field without layout semantics", async () => {
    const fixture = renderSidebarEditor();

    await waitFor(() => {
      expect(document.body.querySelector('[data-slot="sidebar-label"]')).not.toBeNull();
    });

    expect(await screen.findByRole("button", { name: "Choose sidebar icon" })).not.toBeNull();
    expect(document.body.querySelector('[data-authoring-frame="block"]')).not.toBeNull();
    expect(document.body.querySelector('[data-authoring-frame="layout"]')).toBeNull();
    expect(document.body.querySelector("[data-layout-kind]")).toBeNull();
    expect(document.body.querySelector("[data-variant]")).toBeNull();

    fixture.destroy();
  });

  it("keeps the authoring icon trigger under App visual ownership", async () => {
    const fixture = renderSidebarEditor();

    const trigger = await screen.findByRole("button", { name: "Choose sidebar icon" });

    expect(trigger).toHaveClass("sc-app-sidebar-icon-trigger");
    expect(trigger).not.toHaveClass("sc-course-sidebar__icon-chip");
    expect(trigger.querySelector(".sc-app-sidebar-icon-trigger__glyph")).not.toBeNull();
    expect(document.body.querySelector(".sc-course-sidebar")).not.toBeNull();
    expect(document.body.querySelector(".sc-sidebar")).toBeNull();

    fixture.destroy();
  });

  it("renders the learner aside with Course-owned classes and preserved semantics", async () => {
    const fixture = renderSidebarRuntime();

    const aside = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>("aside.sc-course-sidebar__surface");
      if (!element) throw new Error("Expected the Course-owned Sidebar aside to render.");
      return element;
    });

    expect(document.body.querySelector(".sc-course-sidebar")).not.toBeNull();
    expect(document.body.querySelector(".sc-sidebar")).toBeNull();
    expect(aside.querySelector('[aria-hidden="true"].sc-course-sidebar__icon-chip')).not.toBeNull();
    expect(await screen.findByRole("heading", { level: 4 })).not.toBeNull();

    fixture.destroy();
  });
});
