import { mergeAttributes, Node, type NodeViewRenderer } from "@tiptap/core";

import {
  ARRANGEMENT_CONTENT,
  CELL_ARRANGEMENT_CONTENT,
  SECTION_ARRANGEMENT_CONTENT,
} from "@/document/model/content-model/content-groups";
import { isFieldContentEmpty } from "@/document/model/content-model/is-field-content-empty";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";
import {
  VerticalContentPositionSchema,
  type VerticalContentPosition,
} from "@/schemas/course-document";

export interface LayoutNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export interface SectionNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createLayoutNode(options: LayoutNodeOptions = {}) {
  return Node.create({
    name: "layout",
    group: `${ARRANGEMENT_CONTENT} ${CELL_ARRANGEMENT_CONTENT}`,
    content: "section+",
    selectable: true,
    draggable: false,
    isolating: true,
    defining: true,

    addAttributes() {
      return {
        id: stableNodeIdAttribute(),
        variant: {
          default: null,
          parseHTML: (element: HTMLElement) => element.getAttribute("data-layout-variant"),
          renderHTML: (attrs: { variant?: unknown }) => ({
            ...(typeof attrs.variant === "string" ? { "data-layout-variant": attrs.variant } : {}),
          }),
        },
        options: {
          default: {},
          parseHTML: (element: HTMLElement) =>
            parseOptions(parseJsonAttr(element.getAttribute("data-layout-options"))),
          renderHTML: (attrs: { options?: unknown }) =>
            renderJsonAttr("data-layout-options", parseOptions(attrs.options)),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'section[data-node="layout"]' }];
    },

    renderHTML({ node, HTMLAttributes }) {
      const layoutKind =
        typeof node.attrs.variant === "string" && node.attrs.variant.length > 0
          ? node.attrs.variant
          : "layout";

      return [
        "section",
        mergeAttributes(HTMLAttributes, {
          "data-node": "layout",
          "data-definition": layoutKind,
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

export function createSectionNode(options: SectionNodeOptions = {}) {
  return Node.create({
    name: "section",
    content: `(block | ${SECTION_ARRANGEMENT_CONTENT})+`,
    selectable: true,
    draggable: false,
    isolating: true,
    defining: false,

    addAttributes() {
      return {
        id: stableNodeIdAttribute(),
        role: {
          default: null,
          parseHTML: (element: HTMLElement) => element.getAttribute("data-section-role"),
          renderHTML: (attrs: { role?: unknown }) =>
            typeof attrs.role === "string" ? { "data-section-role": attrs.role } : {},
        },
        label: {
          default: null,
          parseHTML: (element: HTMLElement) => element.getAttribute("data-section-label"),
          renderHTML: (attrs: { label?: unknown }) =>
            typeof attrs.label === "string" ? { "data-section-label": attrs.label } : {},
        },
        defaultOpen: {
          default: null,
          parseHTML: (element: HTMLElement) => {
            const value = element.getAttribute("data-section-default-open");
            return value === null ? null : value === "true";
          },
          renderHTML: (attrs: { defaultOpen?: unknown }) =>
            typeof attrs.defaultOpen === "boolean"
              ? { "data-section-default-open": String(attrs.defaultOpen) }
              : {},
        },
        options: {
          default: {},
          parseHTML: (element: HTMLElement) =>
            parseOptions(parseJsonAttr(element.getAttribute("data-section-options"))),
          renderHTML: (attrs: { options?: unknown }) =>
            renderJsonAttr("data-section-options", parseOptions(attrs.options)),
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
      return [{ tag: 'section[data-node="section"]' }];
    },

    renderHTML({ node, HTMLAttributes }) {
      return [
        "section",
        mergeAttributes(HTMLAttributes, {
          "data-node": "section",
          "data-definition": "section",
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

function parseJsonAttr(value: string | null): unknown {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseOptions(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function renderJsonAttr(name: string, value: unknown) {
  return value === null || value === undefined ? {} : { [name]: JSON.stringify(value) };
}

function parseVerticalPosition(value: unknown): VerticalContentPosition {
  const parsed = VerticalContentPositionSchema.safeParse(value);
  return parsed.success ? parsed.data : "top";
}

export const LayoutNode = createLayoutNode();
export const SectionNode = createSectionNode();
