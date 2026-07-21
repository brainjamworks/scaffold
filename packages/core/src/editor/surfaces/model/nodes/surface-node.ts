import { mergeAttributes, Node, type NodeViewRenderer } from "@tiptap/core";

import { SurfaceAttrsSchema, SurfaceSettingsSchema } from "@/schemas/course-document";

import { ARRANGEMENT_CONTENT } from "@/document/model/content-model/content-groups";
import { isFieldContentEmpty } from "@/document/model/content-model/is-field-content-empty";

const DEFAULT_SURFACE_ID = "surface-1";

export interface SurfaceNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

function parseJsonAttr(value: string | null): unknown {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseSurfaceId(value: string | null): string {
  const parsed = SurfaceAttrsSchema.shape.id.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_SURFACE_ID;
}

function parseSurfaceVariant(value: string | null): string | null {
  const parsed = SurfaceAttrsSchema.shape.variant.safeParse(value);
  return parsed.success && typeof parsed.data === "string" ? parsed.data : null;
}

function parseSurfaceSettings(value: unknown): Record<string, unknown> {
  const parsed = SurfaceSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

function renderJsonAttr(name: string, value: unknown) {
  return value === null || value === undefined ? {} : { [name]: JSON.stringify(value) };
}

export function createSurfaceNode(options: SurfaceNodeOptions = {}) {
  return Node.create({
    name: "surface",
    content: `(block | ${ARRANGEMENT_CONTENT} | region)+`,
    selectable: false,
    draggable: false,
    isolating: true,
    defining: true,

    addAttributes() {
      return {
        id: {
          default: DEFAULT_SURFACE_ID,
          parseHTML: (element: HTMLElement) =>
            parseSurfaceId(element.getAttribute("data-surface-id")),
          renderHTML: (attrs: { id?: unknown }) => ({
            "data-surface-id":
              typeof attrs.id === "string" ? parseSurfaceId(attrs.id) : DEFAULT_SURFACE_ID,
          }),
        },
        title: {
          default: null,
          parseHTML: (element: HTMLElement) => element.getAttribute("data-surface-title"),
          renderHTML: (attrs: { title?: unknown }) =>
            typeof attrs.title === "string" ? { "data-surface-title": attrs.title } : {},
        },
        variant: {
          default: null,
          parseHTML: (element: HTMLElement) =>
            parseSurfaceVariant(element.getAttribute("data-surface-variant")),
          renderHTML: (attrs: { variant?: unknown }) => {
            const variant =
              typeof attrs.variant === "string" ? parseSurfaceVariant(attrs.variant) : null;
            return variant ? { "data-surface-variant": variant } : {};
          },
        },
        settings: {
          default: {},
          parseHTML: (element: HTMLElement) =>
            parseSurfaceSettings(parseJsonAttr(element.getAttribute("data-surface-settings"))),
          renderHTML: (attrs: { settings?: unknown }) =>
            renderJsonAttr("data-surface-settings", parseSurfaceSettings(attrs.settings)),
        },
        notes: {
          default: null,
          parseHTML: (element: HTMLElement) => element.getAttribute("data-surface-notes"),
          renderHTML: (attrs: { notes?: unknown }) =>
            typeof attrs.notes === "string" ? { "data-surface-notes": attrs.notes } : {},
        },
      };
    },

    parseHTML() {
      return [{ tag: "section[data-surface]" }];
    },

    renderHTML({ node, HTMLAttributes }) {
      return [
        "section",
        mergeAttributes(HTMLAttributes, {
          "data-surface": "",
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

export const SurfaceNode = createSurfaceNode();
