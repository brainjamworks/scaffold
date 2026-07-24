import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";

import {
  FLASHCARD_CARD_BACK_NODE,
  FLASHCARD_CARD_FRONT_NODE,
  FLASHCARD_CARD_NODE,
} from "./content";
import { shouldIgnoreFlashcardEnterFlip } from "./flashcard-shared";

import "./flashcard.css";

const FLASHCARD_SIDE_CONTENT = "block+";

export interface FlashcardCardNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createFlashcardCardNode(options: FlashcardCardNodeOptions = {}) {
  return Node.create({
    name: FLASHCARD_CARD_NODE,
    content: `${FLASHCARD_CARD_FRONT_NODE} ${FLASHCARD_CARD_BACK_NODE}`,
    defining: true,
    isolating: true,
    selectable: false,
    draggable: false,

    addAttributes() {
      return {
        id: stableNodeIdAttribute(),
      };
    },

    parseHTML() {
      return [{ tag: 'div[data-node="flashcard-card"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, {
          "data-node": "flashcard-card",
        }),
        0,
      ];
    },

    ...(options.addNodeView
      ? {
          addNodeView() {
            return options.addNodeView!();
          },
        }
      : {}),
  });
}

export const FlashcardCardNode = createFlashcardCardNode();

export const FlashcardCardFrontNode = Node.create({
  name: FLASHCARD_CARD_FRONT_NODE,
  content: FLASHCARD_SIDE_CONTENT,
  defining: true,
  isolating: true,
  selectable: false,
  draggable: false,

  parseHTML() {
    return [{ tag: 'div[data-slot="flashcard-card-front"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-slot": "flashcard-card-front",
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FlashcardCardFrontView);
  },
});

export const FlashcardCardBackNode = Node.create({
  name: FLASHCARD_CARD_BACK_NODE,
  content: FLASHCARD_SIDE_CONTENT,
  defining: true,
  isolating: true,
  selectable: false,
  draggable: false,

  parseHTML() {
    return [{ tag: 'div[data-slot="flashcard-card-back"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-slot": "flashcard-card-back",
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FlashcardCardBackView);
  },
});

function FlashcardCardFrontView(props: NodeViewProps) {
  const face = useFlashcardFace(props, "front");
  return (
    <NodeViewWrapper
      ref={face.ref}
      data-slot="flashcard-card-front"
      data-flashcard-visible-face={face.visible ? "" : undefined}
      role="region"
      aria-label="Flashcard front content"
      aria-hidden={!face.visible}
      inert={!face.visible}
      tabIndex={face.tabIndex}
      onKeyDown={face.onKeyDown}
      className="sc-flashcard-side sc-flashcard-side--front"
    >
      <FaceCaption side="Front" />
      <div className="sc-flashcard-side__inner">
        <div className="sc-flashcard-side__content sc-flashcard-side__content--front">
          <NodeViewContent />
        </div>
      </div>
    </NodeViewWrapper>
  );
}

function FlashcardCardBackView(props: NodeViewProps) {
  const face = useFlashcardFace(props, "back");
  return (
    <NodeViewWrapper
      ref={face.ref}
      data-slot="flashcard-card-back"
      data-flashcard-visible-face={face.visible ? "" : undefined}
      role="region"
      aria-label="Flashcard back content"
      aria-hidden={!face.visible}
      inert={!face.visible}
      tabIndex={face.tabIndex}
      onKeyDown={face.onKeyDown}
      className="sc-flashcard-side sc-flashcard-side--back"
    >
      <FaceCaption side="Back" />
      <div className="sc-flashcard-side__inner">
        <div className="sc-flashcard-side__content sc-flashcard-side__content--back">
          <NodeViewContent />
        </div>
      </div>
    </NodeViewWrapper>
  );
}

function FaceCaption({ side }: { side: "Front" | "Back" }) {
  return (
    <span
      contentEditable={false}
      aria-hidden
      data-scaffold-card-no-flip
      className="sc-flashcard-side__caption"
    >
      {side}
    </span>
  );
}

type FlashcardFaceSide = "back" | "front";

function useFlashcardFace(props: NodeViewProps, side: FlashcardFaceSide) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(side === "front");

  useLayoutEffect(() => {
    let attachFrame: number | null = null;
    let focusFrame: number | null = null;
    let observer: MutationObserver | null = null;

    const syncVisibility = (element: HTMLElement, card: HTMLElement) => {
      const flipped = card.dataset["flashcardFlipped"] === "true";
      const nextVisible = side === "back" ? flipped : !flipped;
      const shouldTransferFocus =
        !nextVisible && element.contains(element.ownerDocument.activeElement);

      setVisible((current) => (current === nextVisible ? current : nextVisible));
      if (shouldTransferFocus) {
        if (focusFrame !== null) cancelAnimationFrame(focusFrame);
        focusFrame = requestAnimationFrame(() => {
          const nextFace = card.querySelector<HTMLElement>(
            `[data-slot="flashcard-card-${side === "front" ? "back" : "front"}"]`,
          );
          if (nextFace && !nextFace.inert) nextFace.focus({ preventScroll: true });
        });
      }
    };

    const attach = () => {
      const element = ref.current;
      const card = element?.closest<HTMLElement>('[data-node="flashcard-card"]');
      if (!element || !card) {
        attachFrame = requestAnimationFrame(attach);
        return;
      }

      syncVisibility(element, card);
      observer = new MutationObserver(() => syncVisibility(element, card));
      observer.observe(card, {
        attributes: true,
        attributeFilter: ["data-flashcard-flipped"],
      });
    };

    attach();
    return () => {
      observer?.disconnect();
      if (attachFrame !== null) cancelAnimationFrame(attachFrame);
      if (focusFrame !== null) cancelAnimationFrame(focusFrame);
    };
  }, [side]);

  const runtimeVisible = visible && !props.editor.isEditable;
  return {
    ref,
    visible,
    tabIndex: runtimeVisible ? 0 : -1,
    onKeyDown: runtimeVisible ? handleFlashcardFaceKey : undefined,
  };
}

function handleFlashcardFaceKey(event: ReactKeyboardEvent<HTMLElement>): void {
  const face = event.currentTarget;
  if (event.key === "Enter") {
    if (shouldIgnoreFlashcardEnterFlip(event.target)) return;

    event.preventDefault();
    event.stopPropagation();
    face.closest<HTMLElement>(".sc-flashcard-card__surface")?.click();
    return;
  }

  const maximum = Math.max(0, face.scrollHeight - face.clientHeight);
  let nextScrollTop: number | null = null;

  switch (event.key) {
    case "ArrowDown":
      nextScrollTop = Math.min(maximum, face.scrollTop + 40);
      break;
    case "ArrowUp":
      nextScrollTop = Math.max(0, face.scrollTop - 40);
      break;
    case "End":
      nextScrollTop = maximum;
      break;
    case "Home":
      nextScrollTop = 0;
      break;
    case "PageDown":
      nextScrollTop = Math.min(maximum, face.scrollTop + Math.max(1, face.clientHeight));
      break;
    case "PageUp":
      nextScrollTop = Math.max(0, face.scrollTop - Math.max(1, face.clientHeight));
      break;
  }

  if (nextScrollTop === null) return;
  event.preventDefault();
  face.scrollTop = nextScrollTop;
}
