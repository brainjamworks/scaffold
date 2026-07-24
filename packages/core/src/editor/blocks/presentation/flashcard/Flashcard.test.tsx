// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { AUTHORING_FRAME_WRAPPER_ATTR } from "@/editor/interactions/dom/authoring-chrome";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { builtInInsertCatalog } from "@/editor/insertion/built-in-insert-catalog";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { describeBlockContract } from "@/editor/testing";
import { createDisposableEditor } from "@/editor/testing/disposable-editor";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";

import {
  FLASHCARD_CARD_BACK_NODE,
  FLASHCARD_CARD_FRONT_NODE,
  FLASHCARD_CARD_NODE,
  FLASHCARD_NODE,
} from "./content";
import { flashcardBlockDefinition } from "./flashcard-definition";
import { FlashcardAuthoringExtension } from "./flashcard-authoring-extension";

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: FLASHCARD_NODE,
  catalogId: "flashcard",
  extensions: [createScaffoldInteractionOwnerExtension(builtInBlockRegistry)],
  expectsConfiguration: true,
  expectsFrame: true,
  expectsAuthoringFrame: true,
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

function flashcardFixture(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: FLASHCARD_NODE,
        attrs: {
          id: "flashcard-fixture",
          data: {
            type: "flashcard",
            shuffle: false,
          },
        },
        content: [
          {
            type: FLASHCARD_CARD_NODE,
            attrs: { id: "card-a" },
            content: [
              {
                type: FLASHCARD_CARD_FRONT_NODE,
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "First front" }],
                  },
                ],
              },
              {
                type: FLASHCARD_CARD_BACK_NODE,
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "First back" }],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Keep after flashcard" }],
      },
    ],
  };
}

function renderFlashcardEditor(content: JSONContent = flashcardFixture()) {
  const fixture = createDisposableEditor({
    extensions: [
      StarterKit.configure({
        undoRedo: false,
        paragraph: false,
      }),
      ExtendedParagraph,
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
      createRuntimeBlockFrameAttributesExtension([FLASHCARD_NODE]),
      FlashcardAuthoringExtension,
    ],
    content,
  });

  render(createElement(EditorContent, { editor: fixture.editor }));

  return fixture;
}

describe("flashcard block", () => {
  it("exposes only the visible authoring face to interaction", async () => {
    const user = userEvent.setup();
    const fixture = renderFlashcardEditor();

    const front = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>(
        '[data-slot="flashcard-card-front"]',
      );
      expect(element).not.toBeNull();
      return element;
    });
    const back = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>('[data-slot="flashcard-card-back"]');
      expect(element).not.toBeNull();
      return element;
    });
    if (!front || !back) throw new Error("Expected both flashcard faces to render.");

    await waitFor(() => {
      expect(front.getAttribute("aria-hidden")).toBe("false");
      expect(front.tabIndex).toBe(-1);
      expect(front.inert).toBe(false);
      expect(front.getAttribute("aria-label")).toBe("Flashcard front content");
      expect(back.getAttribute("aria-hidden")).toBe("true");
      expect(back.tabIndex).toBe(-1);
      expect(back.inert).toBe(true);
    });
    expect(
      document.body.querySelector(".sc-flashcard-card__rotator")?.hasAttribute("aria-hidden"),
    ).toBe(false);

    const flipButton = document.body.querySelector<HTMLButtonElement>(
      ".sc-flashcard-reader-controls__flip-button",
    );
    expect(flipButton).not.toBeNull();
    await user.click(flipButton!);

    await waitFor(() => {
      const currentFront = document.body.querySelector<HTMLElement>(
        '[data-slot="flashcard-card-front"]',
      );
      const currentBack = document.body.querySelector<HTMLElement>(
        '[data-slot="flashcard-card-back"]',
      );
      expect(currentFront?.getAttribute("aria-hidden")).toBe("true");
      expect(currentFront?.tabIndex).toBe(-1);
      expect(currentFront?.inert).toBe(true);
      expect(currentBack?.getAttribute("aria-hidden")).toBe("false");
      expect(currentBack?.tabIndex).toBe(-1);
      expect(currentBack?.inert).toBe(false);
      expect(currentBack?.getAttribute("aria-label")).toBe("Flashcard back content");
    });

    fixture.destroy();
  });

  it("seeds catalog content as a flashcard block with private cards", () => {
    const insertContent = builtInInsertCatalog.getById("flashcard")?.content() as
      | JSONContent
      | undefined;

    expect(insertContent?.type).toBe(FLASHCARD_NODE);
    expect(insertContent?.attrs?.["id"]).toMatch(/^[0-9A-Z_a-z-]{12}$/);
    expect(insertContent?.attrs?.["data"]).toEqual({
      type: "flashcard",
      shuffle: false,
    });
    expect(insertContent?.attrs?.["variant"]).toBeUndefined();
    expect(insertContent?.content?.map((child) => child.type)).toEqual([
      FLASHCARD_CARD_NODE,
      FLASHCARD_CARD_NODE,
      FLASHCARD_CARD_NODE,
    ]);
    expect(insertContent?.content?.[0]?.content?.map((child) => child.type)).toEqual([
      FLASHCARD_CARD_FRONT_NODE,
      FLASHCARD_CARD_BACK_NODE,
    ]);
  });

  it("renders authoring flashcards without layout chrome", async () => {
    const fixture = renderFlashcardEditor();

    await waitFor(() => {
      expect(document.body.querySelector(".sc-flashcard-deck")).not.toBeNull();
    });

    expect(document.body.querySelector(".sc-flashcard-card__surface")).not.toBeNull();
    expect(document.body.querySelector(`[${AUTHORING_FRAME_WRAPPER_ATTR}]`)).not.toBeNull();
    expect(document.body.querySelector("[data-layout-kind]")).toBeNull();
    expect(document.body.querySelector("[data-layout-menu-trigger]")).toBeNull();
    expect(document.body.querySelector('[data-authoring-frame="layout"]')).toBeNull();
    expect(await screen.findByRole("button", { name: "Add card" })).not.toBeNull();

    fixture.destroy();
  });

  it("uses responsive frame resizing", () => {
    expect(flashcardBlockDefinition.frame).toMatchObject({
      resizable: true,
      resizeMode: "responsive",
    });
  });

  it("fills bounded containers", () => {
    expect(flashcardBlockDefinition.boundedPlacement).toBe("fill");
  });

  it("adds a new blank card through the flashcard ghost affordance", async () => {
    const user = userEvent.setup();
    const fixture = renderFlashcardEditor();

    await user.click(await screen.findByRole("button", { name: "Add card" }));

    await waitFor(() => {
      expect(fixture.json().content?.[0]?.content).toHaveLength(2);
    });

    const flashcard = fixture.json().content?.[0];
    expect(flashcard?.type).toBe(FLASHCARD_NODE);
    expect(flashcard?.content?.[1]?.type).toBe(FLASHCARD_CARD_NODE);
    expect(flashcard?.content?.[1]?.content?.map((child) => child.type)).toEqual([
      FLASHCARD_CARD_FRONT_NODE,
      FLASHCARD_CARD_BACK_NODE,
    ]);
    expect(fixture.topLevelNodeTypes()).toEqual(["flashcard", "paragraph"]);

    fixture.destroy();
  });
});
