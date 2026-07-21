import TextAlign from "@tiptap/extension-text-align";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";

import type { HorizontalAlignment } from "@/schemas/course-document";

export const SCAFFOLD_TEXT_ALIGNMENTS = ["left", "center", "right", "justify"] as const;
export type ScaffoldTextAlignment = (typeof SCAFFOLD_TEXT_ALIGNMENTS)[number];

const SCAFFOLD_TEXT_BLOCK_TYPES = new Set(["paragraph", "heading", "slide_title"]);

const ScaffoldTextAlign = TextAlign.extend({
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          textAlign: {
            default: this.options.defaultAlignment,
            parseHTML: (element) => {
              const styleAlignment = parseScaffoldTextAlignment(element.style.textAlign);
              if (styleAlignment) return styleAlignment;

              return (
                parseScaffoldTextAlignment(element.getAttribute("data-text-align")) ??
                this.options.defaultAlignment
              );
            },
            renderHTML: (attributes) => {
              const textAlign = parseScaffoldTextAlignment(attributes["textAlign"]);
              if (!textAlign) return {};

              return {
                "data-text-align": textAlign,
                style: `text-align: ${textAlign}`,
              };
            },
          },
        },
      },
    ];
  },
});

export function createScaffoldTextAlignExtension(types: readonly string[]) {
  return ScaffoldTextAlign.configure({
    alignments: [...SCAFFOLD_TEXT_ALIGNMENTS],
    defaultAlignment: "left",
    types: [...types],
  });
}

export function readTextBlockHorizontalAlignment(
  node: ProseMirrorNode,
): ScaffoldTextAlignment | null {
  if (!isScaffoldTextBlock(node)) return null;
  return parseScaffoldTextAlignment(node.attrs["textAlign"]) ?? "left";
}

export function setTextBlockHorizontalAlignmentInTransaction(
  tr: Transaction,
  pos: number,
  value: HorizontalAlignment,
): Transaction | null {
  if (!isHorizontalAlignment(value) || !Number.isInteger(pos) || pos < 0) return null;
  const node = tr.doc.nodeAt(pos);
  if (!node || !isScaffoldTextBlock(node) || node.attrs["textAlign"] === value) return null;

  try {
    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      textAlign: value,
    });
    return tr;
  } catch {
    return null;
  }
}

function isScaffoldTextBlock(node: ProseMirrorNode): boolean {
  return (
    SCAFFOLD_TEXT_BLOCK_TYPES.has(node.type.name) && Boolean(node.type.spec.attrs?.["textAlign"])
  );
}

function parseScaffoldTextAlignment(value: unknown): ScaffoldTextAlignment | null {
  return typeof value === "string" &&
    SCAFFOLD_TEXT_ALIGNMENTS.includes(value as ScaffoldTextAlignment)
    ? (value as ScaffoldTextAlignment)
    : null;
}

function isHorizontalAlignment(value: unknown): value is HorizontalAlignment {
  return value === "left" || value === "center" || value === "right";
}
