import { mergeAttributes, Node, type NodeViewRenderer } from "@tiptap/core";

import {
  ARRANGEMENT_CONTENT,
  CELL_ARRANGEMENT_CONTENT,
  SECTION_ARRANGEMENT_CONTENT,
} from "@/document/model/content-model/content-groups";
import { boundedPlacementAttributes } from "@/editor/frame/model/bounded-placement";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";
import { isGridCellEmpty, isGridCellVerticalPosition } from "./grid-model";

export interface GridNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export interface CellNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createGridNode(options: GridNodeOptions = {}) {
  return Node.create({
    name: "grid",
    group: `${ARRANGEMENT_CONTENT} ${SECTION_ARRANGEMENT_CONTENT}`,
    content: "cell+",
    selectable: false,
    draggable: false,
    isolating: true,
    defining: false,

    addAttributes() {
      return {
        id: stableNodeIdAttribute(),
        columnWidths: {
          default: [],
          parseHTML: (element: HTMLElement) =>
            parseColumnWidths(parseJsonAttr(element.getAttribute("data-column-widths"))),
          renderHTML: (attrs: { columnWidths?: unknown }) =>
            renderJsonAttr("data-column-widths", parseColumnWidths(attrs.columnWidths)),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'div[data-node="grid"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(
          HTMLAttributes,
          {
            "data-node": "grid",
            "data-definition": "grid",
          },
          boundedPlacementAttributes("fill"),
        ),
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

export function createCellNode(options: CellNodeOptions = {}) {
  return Node.create({
    name: "cell",
    content: `(block | ${CELL_ARRANGEMENT_CONTENT})+`,
    selectable: false,
    draggable: false,
    isolating: true,
    defining: false,

    addAttributes() {
      return {
        id: stableNodeIdAttribute(),
        verticalPosition: {
          default: "top",
          parseHTML: (element: HTMLElement) =>
            parseVerticalPosition(element.getAttribute("data-vertical-content-position")),
          renderHTML: (attrs: { verticalPosition?: unknown }) => ({
            "data-vertical-content-position": parseVerticalPosition(attrs.verticalPosition),
          }),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'div[data-node="cell"]' }];
    },

    renderHTML({ node, HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, {
          "data-node": "cell",
          "data-definition": "cell",
          ...(isGridCellEmpty(node) ? { "data-empty": "true" } : {}),
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

function parseJsonAttr(value: string | null): unknown {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseColumnWidths(value: unknown): number[] {
  return Array.isArray(value) && value.every((width) => typeof width === "number") ? value : [];
}

function renderJsonAttr(name: string, value: unknown) {
  return value === null || value === undefined ? {} : { [name]: JSON.stringify(value) };
}

function parseVerticalPosition(value: unknown) {
  return isGridCellVerticalPosition(value) ? value : "top";
}

export const GridNode = createGridNode();
export const CellNode = createCellNode();
