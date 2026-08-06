import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

import type {
  CourseStructure,
  CourseStructureModule,
} from "@/document/model/course-structure";

export function createCourseStructureAuthoringPolicy({
  courseStructure,
}: {
  courseStructure: CourseStructureModule;
}) {
  return Extension.create({
    name: "courseStructureAuthoringPolicy",

    addProseMirrorPlugins() {
      return [
        new Plugin({
          filterTransaction(transaction) {
            if (!transaction.docChanged) return true;
            const candidate = courseStructure.validate(transaction.doc.toJSON());
            if (!candidate.ok) return false;

            const previous = courseStructure.validate(transaction.before.toJSON());
            return !previous.ok || surfaceVariantsRemainStable(previous.value, candidate.value);
          },
        }),
      ];
    },
  });
}

function surfaceVariantsRemainStable(
  previous: CourseStructure,
  candidate: CourseStructure,
): boolean {
  const previousVariants = new Map(
    previous.surfaces.map((surface) => [surface.id, surface.variantId]),
  );
  return candidate.surfaces.every((surface) => {
    const previousVariant = previousVariants.get(surface.id);
    return previousVariant === undefined || previousVariant === surface.variantId;
  });
}
