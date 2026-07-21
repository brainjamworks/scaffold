import type { JSONContent } from "@tiptap/core";
import { ExternalHttpUrlSchema } from "@scaffold/contracts";
import { z } from "zod";

import { CourseModeSchema, OverflowModeSchema, SurfaceSizeSchema } from "@/schemas/course-document";

import { defineCourseDocumentMigration } from "../migration-registry";
import { asRecord, findCourseDocument } from "./helpers";

const LegacyGalleryDataSchema = z.object({
  type: z.literal("gallery").default("gallery"),
  layout: z.enum(["carousel", "grid"]).default("carousel"),
  showCaptions: z.boolean().default(true),
});

const LegacyGalleryItemDataSchema = z.union([
  z.object({
    mode: z.literal("managed"),
    mediaId: z.string().min(1),
    alt: z.string().default(""),
    caption: z.string().default(""),
  }),
  z.object({
    mode: z.literal("external"),
    src: ExternalHttpUrlSchema,
    alt: z.string().default(""),
    caption: z.string().default(""),
  }),
  z.null(),
]);

const LegacyFigureDataSchema = z.object({
  type: z.literal("figure_pair").default("figure_pair"),
  layout: z.enum(["row-2", "row-3", "grid", "lead", "stack"]).default("row-2"),
});

const LegacyFigureSourceSchema = z.union([
  z.object({ mode: z.literal("external"), src: ExternalHttpUrlSchema }),
  z.object({ mode: z.literal("managed"), mediaId: z.string() }),
  z.null(),
]);

const LegacyFigureItemDataSchema = z.object({
  source: LegacyFigureSourceSchema.default(null),
  alt: z.string().default(""),
  caption: z.string().default(""),
});

const V2CourseDocumentAttrsSchema = z
  .object({
    schemaVersion: z.literal(2),
    mode: CourseModeSchema,
    surfaceSize: SurfaceSizeSchema.default("fluid"),
    overflowMode: OverflowModeSchema.default("grow"),
    theme: z.string().nullable().optional(),
    branching: z.unknown().optional(),
  })
  .refine(
    (attrs) =>
      attrs.mode === "slideshow" ? attrs.surfaceSize === "16x9" : attrs.surfaceSize === "fluid",
    { message: "surfaceSize must match the course mode", path: ["surfaceSize"] },
  );

export const v1ToV2CourseDocumentMigration = defineCourseDocumentMigration({
  from: 1,
  to: 2,
  description: "Consolidate legacy Gallery and Figures content into Gallery.",
  migrate(document) {
    const courseDocument = findCourseDocument(document);
    if (!courseDocument) {
      throw new Error("the courseDocument node is missing");
    }

    const attrs = asRecord(courseDocument.node.attrs);
    if (!attrs) {
      throw new Error("the courseDocument attrs are missing");
    }

    if (courseDocument.node.content) {
      courseDocument.node.content = courseDocument.node.content.map((node, index) =>
        migrateNode(node, `courseDocument.content[${index}]`),
      );
    }
    const migratedAttrs = V2CourseDocumentAttrsSchema.safeParse({ ...attrs, schemaVersion: 2 });
    if (!migratedAttrs.success) {
      throw new Error("the migrated courseDocument attrs do not match the v2 contract");
    }
    courseDocument.node.attrs = migratedAttrs.data;
    return document;
  },
});

function migrateNode(node: JSONContent, path: string): JSONContent {
  if (node.type === "gallery") return migrateGallery(node, path);
  if (node.type === "figure_pair") return migrateFigurePair(node, path);

  if (!node.content) return node;
  return {
    ...node,
    content: node.content.map((child, index) => migrateNode(child, `${path}.content[${index}]`)),
  };
}

function migrateGallery(node: JSONContent, path: string): JSONContent {
  const attrs = requiredAttrs(node, path);
  const data = parseLegacy(LegacyGalleryDataSchema, attrs["data"] ?? {}, `${path}.attrs.data`);
  const children = (node.content ?? []).map((child, index) => {
    if (child.type !== "gallery_item") {
      throw new Error(`${path}.content[${index}] is not a legacy gallery_item`);
    }
    return migrateGalleryItem(child, `${path}.content[${index}]`);
  });

  return {
    ...node,
    attrs: {
      ...attrs,
      data: {
        type: "gallery",
        layout: data.layout,
        caption: cloneEmptyRichText(),
      },
    },
    ...(node.content ? { content: children } : {}),
  };
}

function migrateGalleryItem(node: JSONContent, path: string): JSONContent {
  const attrs = requiredAttrs(node, path);
  const data = parseLegacy(
    LegacyGalleryItemDataSchema,
    attrs["data"] ?? null,
    `${path}.attrs.data`,
  );

  return {
    ...node,
    attrs: {
      ...attrs,
      data:
        data === null
          ? { image: null, caption: cloneEmptyRichText() }
          : {
              image:
                data.mode === "managed"
                  ? { mode: "managed", mediaId: data.mediaId, alt: data.alt }
                  : { mode: "external", src: data.src, alt: data.alt },
              caption: richTextFromString(data.caption),
            },
    },
  };
}

function migrateFigurePair(node: JSONContent, path: string): JSONContent {
  const attrs = requiredAttrs(node, path);
  parseLegacy(LegacyFigureDataSchema, attrs["data"] ?? {}, `${path}.attrs.data`);

  const items: JSONContent[] = [];
  let caption: JSONContent | null = null;

  for (const [index, child] of (node.content ?? []).entries()) {
    const childPath = `${path}.content[${index}]`;
    if (child.type === "figure_pair_figure") {
      items.push(migrateFigureItem(child, childPath));
      continue;
    }
    if (child.type === "figure_pair_caption" && caption === null) {
      caption = richTextFromContent(child.content);
      continue;
    }
    throw new Error(`${childPath} is not valid legacy Figure content`);
  }

  return {
    ...node,
    type: "gallery",
    attrs: {
      ...attrs,
      data: {
        type: "gallery",
        layout: "grid",
        caption: caption ?? cloneEmptyRichText(),
      },
    },
    ...(node.content ? { content: items } : {}),
  };
}

function migrateFigureItem(node: JSONContent, path: string): JSONContent {
  const attrs = requiredAttrs(node, path);
  const data = parseLegacy(LegacyFigureItemDataSchema, attrs["data"] ?? {}, `${path}.attrs.data`);
  const source = data.source ?? null;
  const image =
    source === null
      ? null
      : source.mode === "managed"
        ? { mode: "managed" as const, mediaId: source.mediaId, alt: data.alt }
        : { mode: "external" as const, src: source.src, alt: data.alt };

  return {
    ...node,
    type: "gallery_item",
    attrs: {
      ...attrs,
      data: {
        image,
        caption: richTextFromString(data.caption),
      },
    },
  };
}

function requiredAttrs(node: JSONContent, path: string): Record<string, unknown> {
  const attrs = asRecord(node.attrs);
  if (!attrs) throw new Error(`${path}.attrs are missing`);
  return attrs;
}

function parseLegacy<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
  path: string,
): z.output<TSchema> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`${path} does not match the v1 format`);
  }
  return result.data;
}

function richTextFromString(value: string): JSONContent {
  if (!value) return cloneEmptyRichText();
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: value }] }],
  };
}

function richTextFromContent(content: JSONContent[] | undefined): JSONContent {
  return content && content.length > 0 ? { type: "doc", content } : cloneEmptyRichText();
}

function cloneEmptyRichText(): JSONContent {
  return {
    type: "doc",
    content: [{ type: "paragraph" }],
  };
}
