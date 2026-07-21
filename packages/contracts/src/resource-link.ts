import { z } from "zod";

export const ResourceLinkKindSchema = z.enum(["article", "video", "pdf", "audio", "link"]);
export type ResourceLinkKind = z.infer<typeof ResourceLinkKindSchema>;

export const ResourceLinkDataSchema = z.object({
  type: z.literal("resource_link").default("resource_link"),
  url: z.string().trim().default(""),
  kind: ResourceLinkKindSchema.default("link"),
  showDescription: z.boolean().default(true),
});
export type ResourceLinkData = z.infer<typeof ResourceLinkDataSchema>;
