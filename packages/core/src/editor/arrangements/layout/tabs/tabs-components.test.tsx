// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  TabsItem,
  TabsList,
  TabsTrigger,
  nextTabForKey,
  normalizeActiveTabId,
  readRequiredTabsNodeId,
  readTabsOptions,
  readTabsSections,
  renderTabsVariant,
  tabPanelId,
  tabTriggerId,
  tabsGhostPresentation,
  tabsPanelAttributes,
} from "./tabs-components";

describe("tabs shared components", () => {
  it("reads persisted options and normalizes rendered variants", () => {
    expect(readTabsOptions({ variant: "pills", label: "Lesson tabs" })).toEqual({
      variant: "pills",
      label: "Lesson tabs",
    });
    expect(readTabsOptions({ variant: "unknown", label: "" })).toEqual({
      variant: "default",
      label: "Tabs",
    });
    expect(renderTabsVariant("underline")).toBe("default");
    expect(renderTabsVariant("pills")).toBe("pills");
  });

  it("reads section summaries from layout children", () => {
    const sections = readTabsSections({
      childCount: 2,
      child: (index: number) => ({
        attrs:
          index === 0
            ? { id: "tab-a", options: { label: "Overview" }, defaultOpen: true }
            : { id: "tab-b", label: "Practice" },
      }),
    });

    expect(sections).toEqual([
      { id: "tab-a", label: "Overview", defaultOpen: true },
      { id: "tab-b", label: "Practice", defaultOpen: false },
    ]);
  });

  it("normalizes active ids and keyboard navigation targets", () => {
    const sections = [
      { id: "one", label: "One", defaultOpen: false },
      { id: "two", label: "Two", defaultOpen: false },
      { id: "three", label: "Three", defaultOpen: false },
    ];

    expect(normalizeActiveTabId("two", sections)).toBe("two");
    expect(normalizeActiveTabId("missing", sections)).toBe("one");
    expect(nextTabForKey({ key: "ArrowRight", sectionId: "three", sections })?.id).toBe("one");
    expect(nextTabForKey({ key: "ArrowLeft", sectionId: "one", sections })?.id).toBe("three");
    expect(nextTabForKey({ key: "End", sectionId: "one", sections })?.id).toBe("three");
    expect(nextTabForKey({ key: "Tab", sectionId: "one", sections })).toBeNull();
  });

  it("builds stable tab ids, panel attributes, and ghost presentations", () => {
    expect(tabTriggerId("layout-1", "section-1")).toContain("tabs-trigger");
    expect(tabPanelId("layout-1", "section-1")).toContain("tabs-panel");
    expect(
      tabsPanelAttributes({
        layoutId: "layout-1",
        sectionId: "section-1",
        isActive: false,
      }),
    ).toMatchObject({
      role: "tabpanel",
      hidden: true,
      "data-state": "inactive",
    });
    expect(tabsGhostPresentation("default")).toBe("tab");
    expect(tabsGhostPresentation("pills")).toBe("tab-pills");
    expect(tabsGhostPresentation("underline")).toBe("tab-underline");
  });

  it("renders the shared list, item, and trigger shell", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    const onKeyDown = vi.fn();
    const section = { id: "tab-a", label: "Overview", defaultOpen: false };
    const { container } = render(
      <TabsList label="Lesson tabs" variant="pills">
        <TabsItem isActive={true}>
          <TabsTrigger
            layoutId="layout-a"
            section={section}
            isActive={true}
            onActivate={onActivate}
            onKeyDown={onKeyDown}
          />
        </TabsItem>
      </TabsList>,
    );

    const trigger = screen.getByRole("tab", { name: "Overview" });
    expect(screen.getByRole("tablist").getAttribute("aria-label")).toBe("Lesson tabs");
    expect(trigger.getAttribute("aria-selected")).toBe("true");
    expect(trigger.getAttribute("tabindex")).toBe("0");
    expect(container.querySelector(".sc-tabs__list")?.getAttribute("data-variant")).toBe("pills");
    expect(container.querySelector(".sc-tabs__item")?.getAttribute("data-state")).toBe("active");
    await user.click(trigger);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("throws when a required node id is missing", () => {
    expect(() => readRequiredTabsNodeId("", "section")).toThrow(
      "section node is missing a stable id.",
    );
  });
});
