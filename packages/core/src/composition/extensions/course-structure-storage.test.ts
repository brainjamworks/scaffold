// @vitest-environment jsdom

import { Editor, Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import { createScaffoldApplication } from "@/composition/application/create-scaffold-application";

import {
  createCourseStructureStorageExtension,
  getCourseStructureForEditor,
  type CourseStructureStorage,
} from "./course-structure-storage";

describe("Course Structure storage", () => {
  it("keeps each editor session's exact module in its frozen owned record", () => {
    const first = createScaffoldApplication().authoring.courseStructure;
    const second = createScaffoldApplication().authoring.courseStructure;
    const firstEditor = createEditor(first);
    const secondEditor = createEditor(second);

    try {
      const firstStorage = readStorage(firstEditor);
      const secondStorage = readStorage(secondEditor);

      expect(first).not.toBe(second);
      expect(Object.keys(firstStorage)).toEqual(["courseStructure"]);
      expect(Object.isFrozen(firstStorage)).toBe(true);
      expect(Object.isFrozen(secondStorage)).toBe(true);
      expect(getCourseStructureForEditor(firstEditor)).toBe(first);
      expect(getCourseStructureForEditor(secondEditor)).toBe(second);
      expect(getCourseStructureForEditor(firstEditor)).not.toBe(second);
    } finally {
      firstEditor.destroy();
      secondEditor.destroy();
    }
  });

  it("fails clearly when storage is missing or does not contain a complete module", () => {
    const missing = new Editor({ extensions: [StarterKit] });
    const mismatched = new Editor({
      extensions: [
        StarterKit,
        Extension.create({
          name: "scaffoldCourseStructure",
          addStorage: () => ({ courseStructure: { validate: "not a function" } }),
        }),
      ],
    });

    try {
      expect(() => getCourseStructureForEditor(missing)).toThrowError(
        "Course Structure extension is not installed for this editor",
      );
      expect(() => getCourseStructureForEditor(mismatched)).toThrowError(
        "Course Structure storage does not contain a complete module",
      );
    } finally {
      missing.destroy();
      mismatched.destroy();
    }
  });

  it("uses the replacement module when an editor session is replaced", () => {
    const first = createScaffoldApplication().authoring.courseStructure;
    const second = createScaffoldApplication().authoring.courseStructure;
    const firstEditor = createEditor(first);

    expect(getCourseStructureForEditor(firstEditor)).toBe(first);
    firstEditor.destroy();

    const replacementEditor = createEditor(second);
    try {
      const storage = readStorage(replacementEditor);

      expect(Reflect.set(storage, "courseStructure", first)).toBe(false);
      expect(getCourseStructureForEditor(replacementEditor)).toBe(second);
      expect(getCourseStructureForEditor(replacementEditor)).not.toBe(first);
    } finally {
      replacementEditor.destroy();
    }
  });
});

function createEditor(
  courseStructure: ReturnType<typeof createScaffoldApplication>["authoring"]["courseStructure"],
): Editor {
  return new Editor({
    extensions: [StarterKit, createCourseStructureStorageExtension(courseStructure)],
  });
}

function readStorage(editor: Editor): CourseStructureStorage {
  return (
    editor.storage as unknown as {
      scaffoldCourseStructure: CourseStructureStorage;
    }
  ).scaffoldCourseStructure;
}
