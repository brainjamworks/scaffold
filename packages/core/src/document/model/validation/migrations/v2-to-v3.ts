import type { JSONContent } from "@tiptap/core";
import { z } from "zod";

import { createStableId } from "@/document/model/identity/stable-ids";
import {
  AnnotatedFigureSourceSchema,
  DEFAULT_ANNOTATED_FIGURE_CAPTION_DISPLAY,
} from "@scaffold/contracts";
import { CourseDocumentAttrsSchema } from "@/schemas/course-document";

import { defineCourseDocumentMigration } from "../migration-registry";
import { asRecord, findCourseDocument } from "./helpers";

const LegacyAnnotatedFigurePinSchema = z
  .object({
    id: z.string().optional(),
    x: z.number().finite().min(0).max(100),
    y: z.number().finite().min(0).max(100),
  })
  .strict();

const LegacyAnnotatedFigureDataSchema = z
  .object({
    type: z.literal("annotated_figure").default("annotated_figure"),
    source: AnnotatedFigureSourceSchema.default(null),
    alt: z.string().default(""),
    pins: z.array(LegacyAnnotatedFigurePinSchema).default([]),
  })
  .strict();

export const v2ToV3CourseDocumentMigration = defineCourseDocumentMigration({
  from: 2,
  to: 3,
  description: "Convert Annotated Figures to compound annotations with an atomic canvas.",
  migrate(document) {
    const courseDocument = findCourseDocument(document);
    if (!courseDocument) throw new Error("the courseDocument node is missing");

    const attrs = asRecord(courseDocument.node.attrs);
    if (!attrs) throw new Error("the courseDocument attrs are missing");

    if (courseDocument.node.content) {
      courseDocument.node.content = courseDocument.node.content.map((node, index) =>
        migrateNode(node, `courseDocument.content[${index}]`),
      );
    }

    const migratedAttrs = CourseDocumentAttrsSchema.safeParse({ ...attrs, schemaVersion: 3 });
    if (!migratedAttrs.success) {
      const issue = migratedAttrs.error.issues[0];
      throw new Error(
        issue
          ? `${formatPath("courseDocument.attrs", issue.path)} does not match the v3 courseDocument format`
          : "courseDocument.attrs do not match the v3 courseDocument format",
      );
    }
    courseDocument.node.attrs = migratedAttrs.data;
    return document;
  },
});

function migrateNode(node: JSONContent, path: string): JSONContent {
  if (node.type === "annotated_figure") return migrateAnnotatedFigure(node, path);
  if (!node.content) return node;

  return {
    ...node,
    content: node.content.map((child, index) => migrateNode(child, `${path}.content[${index}]`)),
  };
}

function migrateAnnotatedFigure(node: JSONContent, path: string): JSONContent {
  const attrs = requiredAttrs(node, path);
  const data = parseLegacyAnnotatedFigureData(attrs["data"], `${path}.attrs.data`);
  const children = node.content ?? [];

  if (children.length !== 1) {
    const mismatchIndex = children.length < 1 ? 0 : 1;
    throw new Error(`${path}.content[${mismatchIndex}] is not the single legacy legend`);
  }
  const legend = children[0]!;
  if (legend.type !== "annotated_figure_legend") {
    throw new Error(`${path}.content[0].type is not annotated_figure_legend`);
  }

  const captions = (legend.content ?? []).map((caption, index) => {
    if (caption.type !== "paragraph") {
      throw new Error(`${path}.content[0].content[${index}].type is not a legacy paragraph`);
    }
    return caption;
  });

  const seenIds = new Set<string>();
  const annotations: JSONContent[] = data.pins.map((pin, index) => ({
    type: "annotated_figure_annotation",
    attrs: {
      id: uniqueAnnotationId(pin.id, seenIds),
      x: pin.x,
      y: pin.y,
    },
    content: [captions[index] ?? emptyParagraph()],
  }));

  const unpairedCaptions = captions.slice(data.pins.length);
  if (isSemanticallyEmptyParagraph(unpairedCaptions.at(-1))) unpairedCaptions.pop();
  for (const caption of unpairedCaptions) {
    annotations.push({
      type: "annotated_figure_annotation",
      attrs: { id: uniqueAnnotationId(undefined, seenIds), x: 50, y: 50 },
      content: [caption],
    });
  }

  return {
    ...node,
    attrs: {
      ...attrs,
      data: {
        type: "annotated_figure",
        source: data.source,
        alt: data.alt,
        captionDisplay: DEFAULT_ANNOTATED_FIGURE_CAPTION_DISPLAY,
      },
    },
    content: [
      { type: "annotated_figure_canvas" },
      { type: "annotated_figure_legend", content: annotations },
    ],
  };
}

function parseLegacyAnnotatedFigureData(value: unknown, path: string) {
  const parsed = LegacyAnnotatedFigureDataSchema.safeParse(value);
  if (parsed.success) return parsed.data;

  const issue = parsed.error.issues[0];
  const unknownKey = issue?.code === "unrecognized_keys" ? issue.keys[0] : undefined;
  throw new Error(
    issue
      ? `${formatPath(path, [...issue.path, ...(unknownKey ? [unknownKey] : [])])} does not match the v2 annotated figure format`
      : `${path} does not match the v2 annotated figure format`,
  );
}

function requiredAttrs(node: JSONContent, path: string): Record<string, unknown> {
  const attrs = asRecord(node.attrs);
  if (!attrs) throw new Error(`${path}.attrs are missing`);
  return attrs;
}

function uniqueAnnotationId(candidate: string | undefined, seenIds: Set<string>): string {
  if (candidate?.trim() && !seenIds.has(candidate)) {
    seenIds.add(candidate);
    return candidate;
  }

  let generated = createStableId();
  while (seenIds.has(generated)) generated = createStableId();
  seenIds.add(generated);
  return generated;
}

function isSemanticallyEmptyParagraph(node: JSONContent | undefined): boolean {
  if (!node || node.type !== "paragraph") return false;
  const inline = node.content ?? [];
  return inline.every((child) => child.type === "text" && !(child.text ?? "").trim());
}

function emptyParagraph(): JSONContent {
  return { type: "paragraph" };
}

function formatPath(base: string, path: readonly PropertyKey[]): string {
  return path.reduce<string>(
    (current, part) =>
      typeof part === "number" ? `${current}[${part}]` : `${current}.${String(part)}`,
    base,
  );
}
