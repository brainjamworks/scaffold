// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Extensions, JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { createAuthoringMovementTestRoot } from "@/editor/movement/tests/authoring-movement-test-root";
import StarterKit from "@tiptap/starter-kit";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";

import {
  createSemanticActivationBindingTestExtension,
  requireSemanticActivationBinding,
  semanticActivationRequest,
} from "@/document/authoring/semantic-document/testing/semantic-activation-binding-test-extension";
import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { AUTHORING_FRAME_WRAPPER_ATTR } from "@/editor/interactions/dom/authoring-chrome";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { createBlockInsertActions } from "@/editor/insertion/block-insert-action";
import { createInsertCatalog } from "@/editor/insertion/insert-catalog";
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
import { reorderFlashcardCard } from "./flashcard-authoring";

const blockInsertCatalog = createInsertCatalog(
  createBlockInsertActions([flashcardBlockDefinition]),
);

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: FLASHCARD_NODE,
  actionId: "flashcard",
  extensions: [createScaffoldInteractionOwnerExtension(builtInBlockRegistry)],
  expectsConfiguration: true,
  expectsFrame: true,
  expectsAuthoringFrame: true,
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

function flashcardFixture(cardCount = 1): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: FLASHCARD_NODE,
        attrs: {
          id: "flashcard001",
          data: {
            type: "flashcard",
            shuffle: false,
          },
        },
        content: Array.from({ length: cardCount }, (_, index) => ({
          type: FLASHCARD_CARD_NODE,
          attrs: { id: `flashcard${String(index + 1).padStart(3, "0")}` },
          content: [
            {
              type: FLASHCARD_CARD_FRONT_NODE,
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: `Front ${index + 1}` }],
                },
              ],
            },
            {
              type: FLASHCARD_CARD_BACK_NODE,
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: `Back ${index + 1}` }],
                },
              ],
            },
          ],
        })),
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Keep after flashcard" }],
      },
    ],
  };
}

function renderFlashcardEditor(
  content: JSONContent = flashcardFixture(),
  extraExtensions: Extensions = [],
) {
  const fixture = createDisposableEditor({
    extensions: [
      StarterKit.configure({
        undoRedo: false,
        paragraph: false,
      }),
      ExtendedParagraph,
      ...extraExtensions,
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
      createRuntimeBlockFrameAttributesExtension([FLASHCARD_NODE]),
      FlashcardAuthoringExtension,
    ],
    content,
  });

  render(
    createAuthoringMovementTestRoot(
      fixture.editor,
      createElement(EditorContent, { editor: fixture.editor }),
    ),
  );

  return fixture;
}

describe("flashcard block", () => {
  it("registers semantic activation and reveals the requested card", async () => {
    const semanticHarness = createSemanticActivationBindingTestExtension();
    const fixture = renderFlashcardEditor(flashcardFixture(2), [semanticHarness.extension]);
    const ownerId = EmbeddedNodeIdSchema.parse("flashcard001");
    const secondCardId = EmbeddedNodeIdSchema.parse("flashcard002");
    const binding = await waitFor(() => {
      const resolution = semanticHarness.registry.resolve(ownerId);
      expect(resolution.kind).toBe("resolved");
      return requireSemanticActivationBinding(semanticHarness.registry, ownerId);
    });

    const activation = binding.activate(semanticActivationRequest(ownerId, secondCardId));
    await waitFor(() => {
      expect(
        document.body.querySelector(`[data-flashcard-filmstrip-card="${secondCardId}"]`),
      ).toHaveAttribute("data-current", "true");
      expect(
        document.body.querySelector(`[data-node="flashcard-card"][data-id="${secondCardId}"]`),
      ).not.toHaveClass("sc-course-flashcard-card--inactive");
    });
    await expect(activation).resolves.toEqual({ kind: "revealed", ownerId, childId: secondCardId });

    fixture.destroy();
  });

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
      document.body
        .querySelector(".sc-course-flashcard-card__rotator")
        ?.hasAttribute("aria-hidden"),
    ).toBe(false);

    const flipButton = document.body.querySelector<HTMLButtonElement>(
      ".sc-course-flashcard-reader-controls__flip-button",
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
    const insertContent = blockInsertCatalog.getById("flashcard")?.content() as
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
      expect(document.body.querySelector(".sc-course-flashcard-deck")).not.toBeNull();
    });

    expect(document.body.querySelector(".sc-course-flashcard-card__surface")).not.toBeNull();
    expect(document.body.querySelector(`[${AUTHORING_FRAME_WRAPPER_ATTR}]`)).not.toBeNull();
    expect(document.body.querySelector("[data-layout-kind]")).toBeNull();
    expect(document.body.querySelector("[data-layout-menu-trigger]")).toBeNull();
    expect(document.body.querySelector('[data-authoring-frame="layout"]')).toBeNull();
    expect(await screen.findByRole("button", { name: "Add card" })).not.toBeNull();

    fixture.destroy();
  });

  it("mounts the same editable surface and App management controls for every selected card", async () => {
    const user = userEvent.setup();
    const fixture = renderFlashcardEditor(flashcardFixture(2));

    await user.click(await screen.findByRole("button", { name: "Next card" }));

    await waitFor(() => {
      const selected = document.body.querySelector<HTMLElement>('[data-id="flashcard002"]');
      expect(selected?.classList.contains("sc-course-flashcard-card")).toBe(true);
      expect(selected?.querySelector(".sc-course-flashcard-card__surface")).not.toBeNull();
    });

    expect(
      screen.getByRole("button", { name: /Card 2: Front 2\. Drag to reorder/u }),
    ).not.toBeNull();
    expect(document.body.querySelector(".sc-app-flashcard-card-movement")).toBeNull();
    const deleteButton = screen.getByRole("button", { name: "Delete flashcard card 2" });
    expect(deleteButton).toHaveClass("sc-app-flashcard-card-delete");
    expect(deleteButton).not.toHaveClass("sc-course-flashcard__delete");
    expect(screen.queryByRole("button", { name: /Mark as/u })).toBeNull();
    expect(document.body.querySelector(".sc-course-flashcard-deck-header__progress")).toBeNull();

    fixture.destroy();
  });

  it("keeps the final card delete action visible with its invariant explained", async () => {
    const fixture = renderFlashcardEditor();
    const deleteButton = await screen.findByRole("button", { name: "Delete flashcard card 1" });

    expect(deleteButton.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("A flashcard deck must contain at least one card.")).not.toBeNull();

    fixture.destroy();
  });

  it("deletes cards while exposing the filmstrip reorder control", async () => {
    const user = userEvent.setup();
    const fixture = renderFlashcardEditor(flashcardFixture(2));

    expect(
      await screen.findByRole("button", { name: /Card 1: Front 1\. Drag to reorder/u }),
    ).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Delete flashcard card 1" }));
    await waitFor(() => {
      expect(fixture.json().content?.[0]?.content?.map((card) => card.attrs?.["id"])).toEqual([
        "flashcard002",
      ]);
    });

    fixture.destroy();
  });

  it("commits a stable-id filmstrip reorder in one document transaction", () => {
    const fixture = renderFlashcardEditor(flashcardFixture(3));
    let documentWrites = 0;
    fixture.editor.on("transaction", ({ transaction }) => {
      if (transaction.docChanged) documentWrites += 1;
    });

    expect(
      reorderFlashcardCard({
        editor: fixture.editor,
        getPos: () => 0,
        sourceId: "flashcard001",
        targetId: "flashcard003",
      }),
    ).toBe(true);
    expect(fixture.json().content?.[0]?.content?.map((card) => card.attrs?.["id"])).toEqual([
      "flashcard002",
      "flashcard003",
      "flashcard001",
    ]);
    expect(documentWrites).toBe(1);

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
