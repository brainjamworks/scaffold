import { Node } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";

import { createCourseDocumentRuntimeExtensions } from "./create-runtime-composition";

describe("createCourseDocumentRuntimeExtensions", () => {
  it("constructs one built-in runtime surface node", () => {
    const extensions = createCourseDocumentRuntimeExtensions();

    expect(extensions.filter((extension) => extension.name === "surface")).toHaveLength(1);
  });

  it("still accepts an explicit runtime surface node for isolated composition tests", () => {
    const TestRuntimeSurfaceNode = Node.create({
      name: "surface",
      group: "block",
      content: "block*",
    });

    const extensions = createCourseDocumentRuntimeExtensions({
      surfaceNode: TestRuntimeSurfaceNode,
    });

    expect(extensions.find((extension) => extension.name === "surface")).toBe(
      TestRuntimeSurfaceNode,
    );
  });
});
