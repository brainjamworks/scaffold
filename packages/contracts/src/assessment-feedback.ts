import { z } from "zod";

export const ScaffoldRichTextMarkSchema = z
  .object({
    type: z.string(),
    attrs: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();
export type ScaffoldRichTextMark = z.infer<typeof ScaffoldRichTextMarkSchema>;

const ScaffoldRichTextNodeFieldsSchema = z
  .object({
    type: z.string(),
    attrs: z.record(z.string(), z.unknown()).optional(),
    marks: z.array(ScaffoldRichTextMarkSchema).optional(),
    text: z.string().optional(),
  })
  .passthrough();

type RecursiveScaffoldRichTextNode = z.infer<typeof ScaffoldRichTextNodeFieldsSchema> & {
  content?: RecursiveScaffoldRichTextNode[] | undefined;
};

export const ScaffoldRichTextNodeSchema: z.ZodType<RecursiveScaffoldRichTextNode> = z.lazy(() =>
  ScaffoldRichTextNodeFieldsSchema.extend({
    content: z.array(ScaffoldRichTextNodeSchema).optional(),
  }),
);
export type ScaffoldRichTextNode = z.infer<typeof ScaffoldRichTextNodeSchema>;

export const ScaffoldRichTextDocumentSchema = z
  .object({
    type: z.literal("doc"),
    attrs: z.record(z.string(), z.unknown()).optional(),
    content: z.array(ScaffoldRichTextNodeSchema).optional(),
  })
  .passthrough();
export type ScaffoldRichTextDocument = z.infer<typeof ScaffoldRichTextDocumentSchema>;

export const AssessmentFeedbackContentSchema = z.object({
  kind: z.literal("rich-text"),
  document: ScaffoldRichTextDocumentSchema,
});
export type AssessmentFeedbackContent = z.infer<typeof AssessmentFeedbackContentSchema>;
