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
      control: undefined as never,
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
    expect(Object.hasOwn(definition, "control")).toBe(false);
    expect(describeLayout).not.toHaveBeenCalled();
    expect(projectLayoutChildren).not.toHaveBeenCalled();
    expect(describeSection).not.toHaveBeenCalled();
    expect(projectSectionChildren).not.toHaveBeenCalled();
  });

  it("normalizes a semantic-child-only Control Definition without invoking callbacks", () => {
    const projectChildren = vi.fn(() => []);
    const control = {
      semanticChildren: {
        section: {
          commands: [{ type: "select", label: "Select" }],
        },
      },
    } as const;

    const definition = defineLayout({
      id: "controlled-layout",
      title: "Controlled layout",
      description: "Controlled layout fixture",
      icon: ColumnsIcon,
      documentSemantics: { projectChildren },
      control,
      createContent: () => ({ type: "layout", attrs: { variant: "controlled-layout" } }),
    });

    expect(definition.control).toEqual(control);
    expect(definition.control).not.toBe(control);
    expect(definition.control?.semanticChildren).not.toBe(control.semanticChildren);
    expect(Object.isFrozen(definition.control)).toBe(true);
    expect(Object.isFrozen(definition.control?.semanticChildren)).toBe(true);
    expect(Object.isFrozen(definition.control?.semanticChildren?.["section"])).toBe(true);
    expect(Object.isFrozen(definition.control?.semanticChildren?.["section"]?.commands)).toBe(true);
    expect(projectChildren).not.toHaveBeenCalled();
  });

  it("rejects duplicate Control Definition capabilities", () => {
    expect(() =>
      defineLayout({
        id: "invalid-controlled-layout",
        title: "Invalid controlled layout",
        description: "Invalid control fixture",
        icon: ColumnsIcon,
        control: {
          owner: {
            events: [
              { type: "selected", label: "Selected" },
              { type: "selected", label: "Selected again" },
            ],
          },
        } as never,
        createContent: () => ({
          type: "layout",
          attrs: { variant: "invalid-controlled-layout" },
        }),
      }),
    ).toThrow('Control capability set "owner" contains duplicate event type "selected".');
  });
});
