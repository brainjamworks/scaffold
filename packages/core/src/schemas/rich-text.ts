import type { JSONContent } from "@tiptap/core";
import {
  AssessmentFeedbackContentSchema,
  type AssessmentFeedbackContent,
  type ScaffoldRichTextDocument as ContractRichTextDocument,
} from "@scaffold/contracts";
import { z } from "zod";

export type ScaffoldRichTextDocument = JSONContent & { type: "doc" };

export const ScaffoldRichTextMarkSchema = z
  .object({
    type: z.string(),
    attrs: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const ScaffoldRichTextNodeSchema: z.ZodType<unknown> = z.lazy(() =>
  z
    .object({
      type: z.string(),
      attrs: z.record(z.string(), z.unknown()).optional(),
      content: z.array(ScaffoldRichTextNodeSchema).optional(),
      marks: z.array(ScaffoldRichTextMarkSchema).optional(),
      text: z.string().optional(),
    })
    .passthrough(),
);

export const ScaffoldRichTextDocumentSchema = z
  .object({
    type: z.literal("doc"),
    attrs: z.record(z.string(), z.unknown()).optional(),
    content: z.array(ScaffoldRichTextNodeSchema).optional(),
  })
  .passthrough()
  .transform((value) => value as ScaffoldRichTextDocument);

export const EmptyScaffoldRichTextDocument: ScaffoldRichTextDocument = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export function createAssessmentFeedbackContent(
  document: ScaffoldRichTextDocument,
): AssessmentFeedbackContent {
  return AssessmentFeedbackContentSchema.parse({ kind: "rich-text", document });
}

export function toTiptapRichTextDocument(value: unknown): ScaffoldRichTextDocument | null {
  const parsed = ScaffoldRichTextDocumentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function scaffoldRichTextText(
  value: ScaffoldRichTextDocument | ContractRichTextDocument,
): string {
  return richTextNodeText(value).trim();
}

export function isScaffoldRichTextDocumentEmpty(
  value: ScaffoldRichTextDocument | ContractRichTextDocument | null | undefined,
): boolean {
  return !value || scaffoldRichTextText(value).length === 0;
}

interface RichTextTextNode {
  text?: string | undefined;
  content?: readonly RichTextTextNode[] | undefined;
}

function richTextNodeText(value: RichTextTextNode): string {
  if (typeof value.text === "string") return value.text;
  return (value.content ?? [])
    .map(richTextNodeText)
    .filter((part) => part.length > 0)
    .join(" ");
}
