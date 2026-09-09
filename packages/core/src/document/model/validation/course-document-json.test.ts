import { describe, expect, it } from "vite-plus/test";

import {
  cloneCourseDocumentJSON,
  findCourseDocument,
  readCourseDocumentFormatVersion,
} from "./course-document-json";

describe("course document JSON helpers", () => {
  const document = {
    type: "doc",
    content: [{ type: "courseDocument", attrs: { schemaVersion: 5 } }],
  };

  it("clones JSON without converting it", () => {
    const clone = cloneCourseDocumentJSON(document);
    expect(clone).toEqual(document);
    expect(clone).not.toBe(document);
  });

  it("finds the Course Document and reads its exact version", () => {
    expect(findCourseDocument(document)?.index).toBe(0);
    expect(readCourseDocumentFormatVersion(document)).toBe(5);
    expect(readCourseDocumentFormatVersion({ type: "doc", content: [] })).toBeNull();
  });
});
