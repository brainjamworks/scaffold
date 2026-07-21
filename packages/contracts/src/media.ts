import { z } from "zod";

import { ExternalHttpUrlSchema } from "./http-url";

export const ExternalMediaSourceSchema = z.object({
  mode: z.literal("external"),
  src: ExternalHttpUrlSchema,
});
export type ExternalMediaSource = z.infer<typeof ExternalMediaSourceSchema>;

export const ManagedMediaSourceSchema = z.object({
  mode: z.literal("managed"),
  mediaId: z.string(),
});
export type ManagedMediaSource = z.infer<typeof ManagedMediaSourceSchema>;

export const MediaSourceSchema = z.discriminatedUnion("mode", [
  ExternalMediaSourceSchema,
  ManagedMediaSourceSchema,
]);
export type MediaSource = z.infer<typeof MediaSourceSchema>;

export const ImageBlockAttrsSchema = z.discriminatedUnion("mode", [
  ExternalMediaSourceSchema.extend({ alt: z.string().optional() }),
  ManagedMediaSourceSchema.extend({ alt: z.string().optional() }),
]);
export type ImageBlockAttrs = z.infer<typeof ImageBlockAttrsSchema>;

export const AudioBlockAttrsSchema = z.discriminatedUnion("mode", [
  ExternalMediaSourceSchema.extend({ title: z.string().optional() }),
  ManagedMediaSourceSchema.extend({ title: z.string().optional() }),
]);
export type AudioBlockAttrs = z.infer<typeof AudioBlockAttrsSchema>;
