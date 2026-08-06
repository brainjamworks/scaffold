import { Extension, type Editor } from "@tiptap/core";

import type { CourseStructureModule } from "@/document/model/course-structure";

const COURSE_STRUCTURE_STORAGE = "scaffoldCourseStructure";

export interface CourseStructureStorage {
  readonly courseStructure: CourseStructureModule;
}

export function createCourseStructureStorageExtension(courseStructure: CourseStructureModule) {
  return Extension.create<Record<string, never>, CourseStructureStorage>({
    name: COURSE_STRUCTURE_STORAGE,

    addStorage() {
      return { courseStructure };
    },

    onBeforeCreate() {
      Object.freeze(this.storage);
    },
  });
}

export function getCourseStructureForEditor(editor: Editor): CourseStructureModule {
  const editorStorage = editor.storage as unknown as Record<string, unknown>;
  const storage = editorStorage[COURSE_STRUCTURE_STORAGE] as
    | Partial<CourseStructureStorage>
    | undefined;

  if (!storage) {
    throw new Error("Course Structure extension is not installed for this editor");
  }
  if (typeof storage.courseStructure?.validate !== "function") {
    throw new Error("Course Structure storage does not contain a complete module");
  }

  return storage.courseStructure;
}
