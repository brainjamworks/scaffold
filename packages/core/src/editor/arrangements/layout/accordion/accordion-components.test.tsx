// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { deriveSettingsSheetDefinition } from "@/editor/configuration/settings-sheet-derivation";

import {
  AccordionLayoutShell,
  AccordionSectionFrame,
  accordionOpenSectionIds,
  accordionPanelId,
  accordionTriggerId,
  defaultOpenAccordionSectionIds,
  isAccordionSectionOpen,
  nextAccordionSectionForKey,
  readAccordionOptions,
  readAccordionSections,
  readRequiredAccordionNodeId,
} from "./accordion-components";
import { accordionLayoutDefinition } from "./accordion-definition";

describe("accordion shared components", () => {
  it("exposes the multiple-open option clearly through the Accordion settings sheet", () => {
    const settingsSheet = deriveSettingsSheetDefinition(
      accordionLayoutDefinition.configuration,
    );
    const allowMultiple = settingsSheet?.sections
      .flatMap((section) => section.items)
      .find((item) => item.kind !== "directChildCollection" && item.name === "allowMultiple");

    expect(allowMultiple).toMatchObject({
      kind: "boolean",
      label: "Allow multiple sections open",
      description: "Turn this off to keep only one section open at a time.",
      presentation: "switch",
    });
  });

  it("reads persisted options and falls back to defaults", () => {
    expect(
      readAccordionOptions({
        allowMultiple: true,
        label: "Lesson sections",
        variant: "borderless",
      }),
    ).toEqual({
      allowMultiple: true,
      label: "Lesson sections",
      variant: "borderless",
    });
    expect(readAccordionOptions({ allowMultiple: false, label: "", variant: "bad" })).toEqual({
      allowMultiple: false,
      label: "Accordion",
      variant: "default",
    });
  });

  it("reads section summaries from layout children", () => {
    const sections = readAccordionSections({
      childCount: 2,
      child: (index: number) => ({
        attrs:
          index === 0
            ? { id: "section-a", options: { defaultOpen: true } }
            : { id: "section-b", options: {} },
      }),
    });

    expect(sections).toEqual([
      { id: "section-a", defaultOpen: true },
      { id: "section-b", defaultOpen: false },
    ]);
    expect(defaultOpenAccordionSectionIds(sections)).toEqual(["section-a"]);
  });

  it("resolves open state from stored ids or default ids", () => {
    expect(
      accordionOpenSectionIds({
        defaultOpenIds: ["a"],
        storedOpenIds: undefined,
      }),
    ).toEqual(["a"]);
    expect(
      isAccordionSectionOpen({
        defaultOpenIds: ["a"],
        sectionId: "b",
        storedOpenIds: ["b"],
      }),
    ).toBe(true);
  });

  it("maps keyboard navigation targets", () => {
    const sections = [
      { id: "one", defaultOpen: false },
      { id: "two", defaultOpen: false },
      { id: "three", defaultOpen: false },
    ];

    expect(
      nextAccordionSectionForKey({
        key: "ArrowDown",
        sectionId: "three",
        sections,
      })?.id,
    ).toBe("one");
    expect(
      nextAccordionSectionForKey({
        key: "ArrowUp",
        sectionId: "one",
        sections,
      })?.id,
    ).toBe("three");
    expect(
      nextAccordionSectionForKey({
        key: "End",
        sectionId: "one",
        sections,
      })?.id,
    ).toBe("three");
    expect(
      nextAccordionSectionForKey({
        key: "Tab",
        sectionId: "one",
        sections,
      }),
    ).toBeNull();
  });

  it("builds stable disclosure ids and rejects missing node ids", () => {
    expect(accordionTriggerId("layout-1", "section-1")).toContain("accordion-trigger");
    expect(accordionPanelId("layout-1", "section-1")).toContain("accordion-panel");
    expect(() => readRequiredAccordionNodeId("", "layout")).toThrow(
      "layout node is missing a stable id.",
    );
  });

  it("renders the shared layout and section shell", () => {
    const { container } = render(
      <AccordionLayoutShell
        options={{
          allowMultiple: true,
          label: "Lesson sections",
          variant: "borderless",
        }}
        footer={<button type="button">Add section</button>}
      >
        <p>Sections</p>
      </AccordionLayoutShell>,
    );

    expect(screen.getByRole("group").getAttribute("aria-label")).toBe("Lesson sections");
    expect(screen.getByRole("group").getAttribute("data-variant")).toBe("borderless");
    expect(screen.getByRole("group").getAttribute("data-scaffold-accordion-multiple")).toBe("true");
    expect(screen.getByText("Add section")).toBeInTheDocument();
    expect(container.querySelector(".sc-course-accordion__root")).not.toBeNull();

    cleanup();

    const section = render(
      <AccordionSectionFrame before={<span>before</span>} after={<span>after</span>}>
        <p>Section body</p>
      </AccordionSectionFrame>,
    );

    expect(screen.getByText("before")).toBeInTheDocument();
    expect(screen.getByText("after")).toBeInTheDocument();
    expect(screen.getByText("Section body")).toBeInTheDocument();
    expect(section.container.querySelector(".sc-course-accordion__section-frame")).not.toBeNull();
  });
});
