import { Extension } from "@tiptap/core";

import { getScaffoldCapabilitiesForEditor } from "@/composition/extensions/scaffold-capabilities-storage";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import type { CourseStructureCommand } from "@/document/model/course-structure";
import { applyCourseStructureCommandToTransaction } from "@/document/model/course-structure/transactions";

export function createCourseStructureCommandsExtension({
  createId = createEmbeddedNodeId,
}: {
  /** @internal Deterministic identity source for command-interface tests. */
  readonly createId?: () => string;
} = {}) {
  return Extension.create({
    name: "courseStructureCommands",

    addCommands() {
      return {
        applyCourseStructureCommand:
          (command: CourseStructureCommand) =>
          ({ editor, state, tr, dispatch }) => {
            if (!editor.isEditable) {
              if (dispatch !== undefined) tr.setMeta("preventDispatch", true);
              return false;
            }
            const blockDefinitions =
              command.type === "course-section.duplicate" || command.type === "surface.duplicate"
                ? getScaffoldCapabilitiesForEditor(editor).blocks.registry
                : undefined;
            const applied = applyCourseStructureCommandToTransaction({
              ...(blockDefinitions ? { blockDefinitions } : {}),
              state,
              tr,
              command,
              createId,
            });

            if (!applied && dispatch !== undefined) tr.setMeta("preventDispatch", true);
            return applied;
          },
      };
    },
  });
}
