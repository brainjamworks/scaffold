import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import type { CopiedBlockDefinitionLookup } from "@/document/model/identity/clone-with-new-ids";
import type { SurfaceVariantLookup } from "@/editor/surfaces/model/surface-variant-registry";

import { buildCourseStructureTransaction } from "./transactions";
import type { CourseStructureModule } from "./types";
import { validateCourseStructure } from "./validation";

interface CourseStructureModuleInput {
  readonly blockDefinitions: CopiedBlockDefinitionLookup;
  readonly surfaceVariants: SurfaceVariantLookup;
  /** @internal Deterministic identity source for module-interface tests. */
  readonly createId?: () => string;
}

export function createCourseStructureModule({
  blockDefinitions,
  surfaceVariants,
  createId = createEmbeddedNodeId,
}: CourseStructureModuleInput): CourseStructureModule {
  const validate: CourseStructureModule["validate"] = (content) =>
    validateCourseStructure(content, surfaceVariants);
  const buildTransaction: CourseStructureModule["buildTransaction"] = (state, command) =>
    buildCourseStructureTransaction({
      blockDefinitions,
      state,
      command,
      validate,
      createId,
    });

  return Object.freeze({
    validate,
    buildTransaction,
  });
}
