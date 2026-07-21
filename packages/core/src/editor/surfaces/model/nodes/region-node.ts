import { mergeAttributes, Node, type NodeViewRenderer } from "@tiptap/core";

import { ARRANGEMENT_CONTENT } from "@/document/model/content-model/content-groups";
import { isFieldContentEmpty } from "@/document/model/content-model/is-field-content-empty";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";
import {
  VerticalContentPositionSchema,
  type VerticalContentPosition,
} from "@/schemas/course-document";

const DEFAULT_REGION_ROLE = "main";

export interface RegionNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

function parseRegionRole(value: string | null): string {
  return value && value.trim().length > 0 ? value : DEFAULT_REGION_ROLE;
}

export function createRegionNode(options: RegionNodeOptions = {}) {
  return Node.create({
    name: "region",
    content: `(block | ${ARRANGEMENT_CONTENT})+`,
    selectable: false,
    draggable: false,
    isolating: true,
    defining: false,

    addAttributes() {
      return {
        id: stableNodeIdAttribute(),
        role: {
          default: DEFAULT_REGION_ROLE,
          parseHTML: (element: HTMLElement) =>
            parseRegionRole(element.getAttribute("data-region-role")),
          renderHTML: (attrs: { role?: unknown }) => ({
            "data-region-role":
              typeof attrs.role === "string" ? parseRegionRole(attrs.role) : DEFAULT_REGION_ROLE,
          }),
        },
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
      return [{ tag: 'section[data-node="region"]' }];
    },

    renderHTML({ node, HTMLAttributes }) {
      return [
        "section",
        mergeAttributes({ class: "sc-region" }, HTMLAttributes, {
          "data-node": "region",
          ...(isFieldContentEmpty(node) ? { "data-empty": "true" } : {}),
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

function parseVerticalPosition(value: unknown): VerticalContentPosition {
  const parsed = VerticalContentPositionSchema.safeParse(value);
  return parsed.success ? parsed.data : "top";
}

export const RegionNode = createRegionNode();
