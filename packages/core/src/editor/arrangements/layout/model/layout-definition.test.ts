import { ColumnsIcon } from "@phosphor-icons/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { createLayoutInsertAction, defineLayout, type LayoutDefinition } from "./layout-definition";

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

  it("owns layout and section semantic shells without invoking callbacks", () => {
    const describeLayout = vi.fn(() => ({ label: "Layout" }));
    const projectLayoutChildren = vi.fn(() => []);
    const describeSection = vi.fn(() => ({ label: "Section" }));
    const projectSectionChildren = vi.fn(() => []);

    const definition = defineLayout({
      id: "semantic-layout",
      title: "Semantic layout",
      description: "Layout semantics fixture",
      icon: ColumnsIcon,
      documentSemantics: {
        describe: describeLayout,
        projectChildren: projectLayoutChildren,
      },
      createContent: () => ({ type: "layout", attrs: { variant: "semantic-layout" } }),
      section: {
        label: "Panel",
        addLabel: "Add panel",
        documentSemantics: {
          describe: describeSection,
          projectChildren: projectSectionChildren,
        },
        create: () => ({ type: "section" }),
      },
    });

    expect(Object.isFrozen(definition.documentSemantics)).toBe(true);
    expect(Object.isFrozen(definition.section?.documentSemantics)).toBe(true);
    expect(definition.documentSemantics?.describe).toBe(describeLayout);
    expect(definition.documentSemantics?.projectChildren).toBe(projectLayoutChildren);
    expect(definition.section?.documentSemantics?.describe).toBe(describeSection);
    expect(definition.section?.documentSemantics?.projectChildren).toBe(projectSectionChildren);
    expect(describeLayout).not.toHaveBeenCalled();
    expect(projectLayoutChildren).not.toHaveBeenCalled();
    expect(describeSection).not.toHaveBeenCalled();
    expect(projectSectionChildren).not.toHaveBeenCalled();
  });
});
