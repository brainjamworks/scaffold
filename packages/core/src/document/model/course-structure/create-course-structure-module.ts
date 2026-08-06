import type { SurfaceVariantLookup } from "@/editor/surfaces/model/surface-variant-registry";

import type { CourseStructureModule } from "./types";
import { validateCourseStructure } from "./validation";

interface CourseStructureModuleInput {
  readonly surfaceVariants: SurfaceVariantLookup;
}

export function createCourseStructureModule({
  surfaceVariants,
}: CourseStructureModuleInput): CourseStructureModule {
  const validate: CourseStructureModule["validate"] = (content) =>
    validateCourseStructure(content, surfaceVariants);

  return Object.freeze({ validate });
}
