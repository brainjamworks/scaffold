import { Extension } from "@tiptap/core";

import { getScaffoldCapabilitiesForEditor } from "@/composition/extensions/scaffold-capabilities-storage";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import {
  type CourseStructureCommand,
  type CourseStructureCommandResultHandler,
  type CourseStructureModule,
} from "@/document/model/course-structure";
import { applyCourseStructureCommandToTransaction } from "@/document/model/course-structure/transactions";

export function createCourseStructureCommandsExtension({
  courseStructure,
  createId = createEmbeddedNodeId,
}: {
  readonly courseStructure: CourseStructureModule;
  /** @internal Deterministic identity source for command-interface tests. */
  readonly createId?: () => string;
}) {
  return Extension.create({
    name: "courseStructureCommands",

    addCommands() {
      return {
        applyCourseStructureCommand:
          (command: CourseStructureCommand, onResult?: CourseStructureCommandResultHandler) =>
          ({ editor, state, tr, dispatch }) => {
            const blockDefinitions =
              command.type === "course-section.duplicate" || command.type === "surface.duplicate"
                ? getScaffoldCapabilitiesForEditor(editor).blocks.registry
                : undefined;
            const result = applyCourseStructureCommandToTransaction({
              ...(blockDefinitions ? { blockDefinitions } : {}),
              state,
              tr,
              command,
              validate: (document) => courseStructure.validate(document),
              createId,
            });

            onResult?.(result);
            if (!result.ok && dispatch !== undefined) tr.setMeta("preventDispatch", true);
            return result.ok;
          },
      };
    },
  });
}
