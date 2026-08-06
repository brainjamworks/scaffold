// @vitest-environment happy-dom

import { cleanup, render, waitFor } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { CalloutDataSchema as ContractCalloutDataSchema } from "@scaffold/contracts";

import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { AUTHORING_FRAME_ATTR } from "@/editor/interactions/dom/authoring-frame";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { createBlockInsertActions } from "@/editor/insertion/block-insert-action";
import { createInsertCatalog } from "@/editor/insertion/insert-catalog";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { describeBlockContract } from "@/editor/testing";
import { catalogIconValue } from "@/schemas/media/icon";

import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { calloutBlockDefinition } from "./callout-definition";
import { CalloutAuthoringExtension } from "./callout-authoring-extension";
import { CalloutRuntimeExtension } from "./callout-runtime-extension";
import { emptyCalloutData } from "./content";

const blockInsertCatalog = createInsertCatalog(createBlockInsertActions([calloutBlockDefinition]));

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: "callout",
  actionId: "callout",
  extensions: [createScaffoldInteractionOwnerExtension(builtInBlockRegistry)],
  expectsConfiguration: true,
  expectsFrame: true,
  expectsAuthoringFrame: true,
});

function makeEditor() {
  return new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
      createRuntimeBlockFrameAttributesExtension(["callout"]),
      CalloutAuthoringExtension,
    ],
  });
}

function makeRuntimeEditor() {
  return new Editor({
    editable: false,
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
      createRuntimeBlockFrameAttributesExtension(["callout"]),
      CalloutRuntimeExtension,
    ],
  });
}

function calloutDoc(
  attrs: Record<string, unknown> = {},
  content: { body?: string; title?: string } = {},
): JSONContent {
  const title = content.title ?? "Info title";
  const body = content.body ?? "Callout body";

  return {
    type: "callout",
    attrs: {
      id: "block-callout-test",
      data: {
        type: "callout",
        variant: "info",
        showIcon: true,
        icon: catalogIconValue("info"),
        headingLevel: 4,
      },
      ...attrs,
    },
    content: [
      {
        type: "callout_title",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: title }],
          },
        ],
      },
      {
        type: "callout_prompt",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: body }],
          },
        ],
      },
    ],
  };
}

function selectFirstNode(editor: Editor) {
  editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)));
}

describe("composite callout node", () => {
  afterEach(() => {
    cleanup();
    document.body.replaceChildren();
  });

  it("constructs serialized defaults in the Callout feature", () => {
    expect(ContractCalloutDataSchema.parse(emptyCalloutData())).toEqual({
      type: "callout",
      variant: "info",
      showIcon: true,
      icon: null,
      headingLevel: 4,
    });
    expect(emptyCalloutData({ variant: "tip", showIcon: false })).toEqual({
      type: "callout",
      variant: "tip",
      showIcon: false,
      icon: null,
      headingLevel: 4,
    });
  });

  it("models callout slots as field containers", () => {
    const editor = makeEditor();

    expect(editor.schema.nodes["callout_title"]?.spec.content).toBe("paragraph");
    expect(editor.schema.nodes["callout_title"]?.spec.selectable).toBe(false);
    expect(editor.schema.nodes["callout_prompt"]?.spec.content).toBe("text_content+");
    expect(editor.schema.nodes["callout_prompt"]?.spec.selectable).toBe(false);

    editor.destroy();
  });

  it("seeds the inserted field content with the authoring defaults", () => {
    const insertContent = blockInsertCatalog.getById("callout")?.content() as
      | JSONContent
      | undefined;

    expect(insertContent?.attrs?.["id"]).toMatch(/^[0-9A-Z_a-z-]{12}$/);
    expect(insertContent?.content?.[0]?.type).toBe("callout_title");
    expect(insertContent?.content?.[0]?.content?.[0]?.content?.[0]?.text).toBe("Info title");
    expect(insertContent?.content?.[1]?.type).toBe("callout_prompt");
    expect(insertContent?.content?.[1]?.content?.[0]?.content?.[0]?.text).toBe(
      "Add a concise note for learners",
    );
  });

  it("round-trips presentation attrs and field content children", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        calloutDoc(
          {
            data: {
              type: "callout",
              variant: "warning",
              showIcon: true,
              icon: catalogIconValue("alert-triangle"),
              headingLevel: 3,
            },
          },
          {
            body: "Do not divide by a value that might be zero.",
            title: "Common mistake",
          },
        ),
      ],
    });

    const top = editor.getJSON().content?.[0] as JSONContent | undefined;
    expect(top?.attrs?.["data"]).toMatchObject({
      type: "callout",
      variant: "warning",
      icon: catalogIconValue("alert-triangle"),
      headingLevel: 3,
    });
    expect(top?.attrs?.["data"]).not.toHaveProperty("title");
    expect(top?.attrs?.["data"]).not.toHaveProperty("body");
    expect(top?.content?.[0]?.type).toBe("callout_title");
    expect(top?.content?.[0]?.content?.[0]?.content?.[0]?.text).toBe("Common mistake");
    expect(top?.content?.[1]?.type).toBe("callout_prompt");
    editor.destroy();
  });

  it("parses default attrs when data is absent and content is present", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "callout",
          content: [
            { type: "callout_title", content: [{ type: "paragraph" }] },
            { type: "callout_prompt", content: [{ type: "paragraph" }] },
          ],
        },
      ],
    });

    const top = editor.getJSON().content?.[0] as JSONContent | undefined;
    expect(top?.attrs?.["data"]).toMatchObject({
      type: "callout",
      variant: "info",
      showIcon: true,
      headingLevel: 4,
    });
    expect(top?.content?.map((child) => child.type)).toEqual(["callout_title", "callout_prompt"]);
    editor.destroy();
  });

  it("renders registry-backed responsive resize chrome when selected", async () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [calloutDoc()],
    });

    selectFirstNode(editor);
    render(createElement(EditorContent, { editor }));

    const wrapper = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>("[data-authoring-frame-wrapper]");
      expect(element).not.toBeNull();
      return element;
    });

    expect(wrapper?.dataset["authoringFrameResizeMode"]).toBe("responsive");
    expect(
      document.body.querySelector(
        `[${AUTHORING_FRAME_ATTR}="block"][data-id="block-callout-test"]`,
      ),
    ).toBeInstanceOf(HTMLElement);
    expect(document.body.querySelectorAll("[data-authoring-resize-handle]")).toHaveLength(5);

    editor.destroy();
  });

  it("uses stable Course semantics for every learner-facing variant", async () => {
    const variants = ["info", "warning", "success", "error", "tip", "note"] as const;
    const editor = makeRuntimeEditor();
    editor.commands.setContent({
      type: "doc",
      content: variants.map((variant) =>
        calloutDoc(
          {
            id: `block-callout-${variant}`,
            data: {
              type: "callout",
              variant,
              showIcon: true,
              icon: null,
              headingLevel: 4,
            },
          },
          { body: `${variant} body`, title: `${variant} title` },
        ),
      ),
    });

    render(createElement(EditorContent, { editor }));

    const callouts = await waitFor(() => {
      const elements = Array.from(
        document.body.querySelectorAll<HTMLElement>("aside.sc-course-callout"),
      );
      expect(elements).toHaveLength(variants.length);
      return elements;
    });

    expect(callouts.map((callout) => callout.getAttribute("role"))).toEqual(
      variants.map(() => "note"),
    );
    expect(callouts.map((callout) => callout.dataset["calloutVariant"])).toEqual(variants);
    expect(callouts.map((callout) => callout.dataset["courseState"] ?? null)).toEqual([
      "info",
      "warning",
      "success",
      "error",
      null,
      null,
    ]);
    expect(document.body.querySelector(".sc-callout")).toBeNull();

    editor.destroy();
  });

  it("keeps the editable icon trigger under App visual ownership", async () => {
    const editor = makeEditor();
    editor.commands.setContent({ type: "doc", content: [calloutDoc()] });

    render(createElement(EditorContent, { editor }));

    const trigger = await waitFor(() => {
      const element = document.body.querySelector<HTMLButtonElement>(
        'button[aria-label="Choose callout icon"]',
      );
      expect(element).not.toBeNull();
      return element;
    });

    expect(trigger).toHaveClass("sc-app-callout-icon-trigger");
    expect(trigger).toHaveClass("sc-course-callout__icon-slot");
    expect(trigger).not.toHaveClass("sc-course-callout__icon-chip");

    editor.destroy();
  });

  it("serializes persisted frame attrs without authoring resize chrome", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        calloutDoc({
          frame: {
            align: "end",
            aspectRatio: null,
            widthMode: "percent",
            widthPercent: 50,
          },
        }),
      ],
    });

    const html = editor.getHTML();
    expect(html).toContain('data-node="callout"');
    expect(html).toContain("data-frame");
    expect(html).toContain("width: 50%");
    expect(html).toContain("margin-left: auto");
    expect(html).not.toContain("data-authoring-resize-handle");

    editor.destroy();
  });
});
