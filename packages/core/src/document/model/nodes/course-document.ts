import { mergeAttributes, Node } from "@tiptap/core";

import {
  SCAFFOLD_DOCUMENT_FORMAT_VERSION,
  CourseDocumentAttrsSchema,
  CourseModeSchema,
  OverflowModeSchema,
  SurfaceSizeSchema,
} from "@/schemas/course-document";

const defaultAttrs = CourseDocumentAttrsSchema.parse({
  schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
  mode: "page",
});

function parseAttrWithDefault<T>(
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T } },
  value: unknown,
  defaultValue: T,
): T {
  const parsed = schema.safeParse(value);
  return parsed.success && parsed.data !== undefined ? parsed.data : defaultValue;
}

function parseJsonAttr(value: string | null): unknown {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseDocumentFormatVersion(value: unknown): number {
  if (value === null || value === undefined || value === "") {
    return defaultAttrs.schemaVersion;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : defaultAttrs.schemaVersion;
}

export const CourseDocumentNode = Node.create({
  name: "courseDocument",
  content: "surface+",
  selectable: false,
  draggable: false,
  isolating: true,
  defining: true,

  addAttributes() {
    return {
      mode: {
        default: defaultAttrs.mode,
        parseHTML: (element: HTMLElement) =>
          parseAttrWithDefault(
            CourseModeSchema,
            element.getAttribute("data-course-mode") ?? defaultAttrs.mode,
            defaultAttrs.mode,
          ),
        renderHTML: (attrs: { mode?: unknown }) => ({
          "data-course-mode": parseAttrWithDefault(CourseModeSchema, attrs.mode, defaultAttrs.mode),
        }),
      },
      schemaVersion: {
        default: defaultAttrs.schemaVersion,
        parseHTML: (element: HTMLElement) =>
          parseDocumentFormatVersion(element.getAttribute("data-scaffold-document-format-version")),
        renderHTML: (attrs: { schemaVersion?: unknown }) => ({
          "data-scaffold-document-format-version": String(
            parseDocumentFormatVersion(attrs.schemaVersion),
          ),
        }),
      },
      surfaceSize: {
        default: defaultAttrs.surfaceSize,
        parseHTML: (element: HTMLElement) =>
          parseAttrWithDefault(
            SurfaceSizeSchema,
            element.getAttribute("data-surface-size") ?? defaultAttrs.surfaceSize,
            defaultAttrs.surfaceSize,
          ),
        renderHTML: (attrs: { surfaceSize?: unknown }) => ({
          "data-surface-size": parseAttrWithDefault(
            SurfaceSizeSchema,
            attrs.surfaceSize,
            defaultAttrs.surfaceSize,
          ),
        }),
      },
      overflowMode: {
        default: defaultAttrs.overflowMode,
        parseHTML: (element: HTMLElement) =>
          parseAttrWithDefault(
            OverflowModeSchema,
            element.getAttribute("data-overflow-mode") ?? defaultAttrs.overflowMode,
            defaultAttrs.overflowMode,
          ),
        renderHTML: (attrs: { overflowMode?: unknown }) => ({
          "data-overflow-mode": parseAttrWithDefault(
            OverflowModeSchema,
            attrs.overflowMode,
            defaultAttrs.overflowMode,
          ),
        }),
      },
      theme: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-course-theme"),
        renderHTML: (attrs: { theme?: unknown }) =>
          typeof attrs.theme === "string" ? { "data-course-theme": attrs.theme } : {},
      },
      branching: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          parseJsonAttr(element.getAttribute("data-course-branching")),
        renderHTML: (attrs: { branching?: unknown }) =>
          attrs.branching === null || attrs.branching === undefined
            ? {}
            : { "data-course-branching": JSON.stringify(attrs.branching) },
      },
    };
  },

  parseHTML() {
    return [{ tag: "section[data-course-document]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["section", mergeAttributes(HTMLAttributes, { "data-course-document": "" }), 0];
  },
});
