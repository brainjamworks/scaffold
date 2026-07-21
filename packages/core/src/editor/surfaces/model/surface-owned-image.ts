import { z } from "zod";

import { ImagePositionSchema } from "@/schemas/course-document";

import type { SurfaceImageSlotRole } from "./slide-composition-definition";

export const SurfaceOwnedImageSchema = z
  .object({
    imageUrl: z.string().min(1).optional(),
    imageAlt: z.string().optional(),
    imagePosition: ImagePositionSchema.optional(),
  })
  .strict();

export type SurfaceOwnedImage = z.infer<typeof SurfaceOwnedImageSchema>;

export const EMPTY_SURFACE_OWNED_IMAGE: SurfaceOwnedImage = {};

export function defineSurfaceImageRoles<const Roles extends readonly SurfaceImageSlotRole[]>(
  roles: Roles,
) {
  const shape = Object.fromEntries(
    roles.map((role) => [role, SurfaceOwnedImageSchema.default({})]),
  );

  return z.object(shape).strict();
}
