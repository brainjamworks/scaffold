import { Node, mergeAttributes } from "@tiptap/core";
import { Fragment, type Node as ProseMirrorNode, type Schema } from "@tiptap/pm/model";

import {
  BLOCK_CONTENT,
  fieldContainerSpec,
  textContentExpression,
} from "@/document/model/content-model/content-groups";

export const HEADER_FOOTER_SLOT_POSITIONS = ["left", "center", "right"] as const;
export type SurfaceHeaderFooterSlotPosition = (typeof HEADER_FOOTER_SLOT_POSITIONS)[number];
export const SURFACE_HEADER_FOOTER_NODE_TYPES = ["surface_header", "surface_footer"] as const;
export type SurfaceHeaderFooterNodeType = (typeof SURFACE_HEADER_FOOTER_NODE_TYPES)[number];
const HEADER_FOOTER_SLOT_CONTENT = "surface_header_footer_slot+";
const HEADER_FOOTER_SLOT_TEXT_CONTENT = textContentExpression();

function parseHeaderFooterSlotPosition(value: string | null): SurfaceHeaderFooterSlotPosition {
  return HEADER_FOOTER_SLOT_POSITIONS.includes(value as SurfaceHeaderFooterSlotPosition)
    ? (value as SurfaceHeaderFooterSlotPosition)
    : "left";
}

function createSurfaceHeaderFooterNode({ name, slot }: { name: string; slot: string }) {
  return Node.create({
    name,
    group: BLOCK_CONTENT,
    content: HEADER_FOOTER_SLOT_CONTENT,
    defining: true,
    isolating: true,
    selectable: false,

    parseHTML() {
      return [{ tag: `div[data-slot="${slot}"]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-slot": slot }), 0];
    },
  });
}

export const SurfaceHeaderNode = createSurfaceHeaderFooterNode({
  name: "surface_header",
  slot: "surface-header",
});

export const SurfaceFooterNode = createSurfaceHeaderFooterNode({
  name: "surface_footer",
  slot: "surface-footer",
});

export const SurfaceHeaderFooterSlotNode = Node.create({
  name: "surface_header_footer_slot",
  ...fieldContainerSpec({ content: HEADER_FOOTER_SLOT_TEXT_CONTENT }),

  addAttributes() {
    return {
      position: {
        default: "left",
        parseHTML: (element: HTMLElement) =>
          parseHeaderFooterSlotPosition(element.getAttribute("data-header-footer-slot-position")),
        renderHTML: (attrs: { position?: unknown }) => {
          const position =
            typeof attrs.position === "string"
              ? parseHeaderFooterSlotPosition(attrs.position)
              : "left";
          return { "data-header-footer-slot-position": position };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-header-footer-slot]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "sc-field-content sc-surface-header-footer-slot__content",
        "data-header-footer-slot": "",
      }),
      0,
    ];
  },
});

export function createEmptySurfaceHeaderFooterNode(
  schema: Schema,
  headerFooterType: SurfaceHeaderFooterNodeType,
): ProseMirrorNode | null {
  const headerFooterNode = schema.nodes[headerFooterType];
  const headerFooterSlotNode = schema.nodes.surface_header_footer_slot;
  const paragraphNode = schema.nodes.paragraph;
  if (!headerFooterNode || !headerFooterSlotNode || !paragraphNode) return null;

  try {
    const slots = HEADER_FOOTER_SLOT_POSITIONS.map((position) =>
      headerFooterSlotNode.createChecked(
        { position },
        Fragment.from(paragraphNode.createChecked({ textAlign: position })),
      ),
    );
    return headerFooterNode.createChecked(null, Fragment.fromArray(slots));
  } catch {
    return null;
  }
}

export function isSurfaceHeaderFooterNodeType(
  typeName: string,
): typeName is SurfaceHeaderFooterNodeType {
  return SURFACE_HEADER_FOOTER_NODE_TYPES.includes(typeName as SurfaceHeaderFooterNodeType);
}

export function isValidSurfaceHeaderFooterNode(node: ProseMirrorNode): boolean {
  if (!isSurfaceHeaderFooterNodeType(node.type.name)) return false;
  if (node.childCount !== HEADER_FOOTER_SLOT_POSITIONS.length) return false;

  for (let index = 0; index < HEADER_FOOTER_SLOT_POSITIONS.length; index += 1) {
    const child = node.child(index);
    if (child.type.name !== "surface_header_footer_slot") return false;
    if (child.attrs["position"] !== HEADER_FOOTER_SLOT_POSITIONS[index]) {
      return false;
    }
  }

  return true;
}
