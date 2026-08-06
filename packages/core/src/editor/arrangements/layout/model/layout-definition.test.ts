import { ColumnsIcon } from "@phosphor-icons/react";
import { describe, expect, it } from "vite-plus/test";

import { createLayoutInsertAction, type LayoutDefinition } from "./layout-definition";

describe("createLayoutInsertAction", () => {
  it("projects bounded placement from the layout definition", () => {
    const definition = {
      id: "test-fill-layout",
      title: "Test fill layout",
      description: "Test layout placement projection",
      icon: ColumnsIcon,
      boundedPlacement: "fill",
      createContent: () => ({
        type: "layout",
        attrs: { variant: "test-fill-layout" },
        content: [{ type: "section", content: [{ type: "paragraph" }] }],
      }),
    } satisfies LayoutDefinition;

    expect(createLayoutInsertAction(definition).boundedPlacement).toBe("fill");
  });
});
