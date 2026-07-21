// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import * as DropdownMenu from "./DropdownMenu/DropdownMenu";
import { OverlayBoundary } from "./OverlayBoundary/OverlayBoundary";
import * as SelectMenu from "./Select/SelectMenu";
import * as Tooltip from "./Tooltip/Tooltip";

afterEach(() => {
  cleanup();
  document
    .querySelectorAll("[data-test-boundary-container]")
    .forEach((element) => element.remove());
});

interface PortalFamilyCase {
  geometryVariables: {
    anchorBlock: string;
    anchorInline: string;
    availableBlock: string;
    availableInline: string;
  } | null;
  name: string;
  render: (testId: string) => ReactNode;
}

const portalFamilies: PortalFamilyCase[] = [
  {
    geometryVariables: {
      anchorBlock: "--radix-tooltip-trigger-height",
      anchorInline: "--radix-tooltip-trigger-width",
      availableBlock: "--radix-tooltip-content-available-height",
      availableInline: "--radix-tooltip-content-available-width",
    },
    name: "Tooltip",
    render: (testId) => (
      <Tooltip.Provider delayDuration={0}>
        <Tooltip.Root open>
          <Tooltip.Trigger>Tooltip trigger</Tooltip.Trigger>
          <Tooltip.Portal forceMount>
            <Tooltip.Content data-testid={testId}>Tooltip content</Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
    ),
  },
  {
    geometryVariables: {
      anchorBlock: "--radix-dropdown-menu-trigger-height",
      anchorInline: "--radix-dropdown-menu-trigger-width",
      availableBlock: "--radix-dropdown-menu-content-available-height",
      availableInline: "--radix-dropdown-menu-content-available-width",
    },
    name: "DropdownMenu",
    render: (testId) => (
      <DropdownMenu.Root open>
        <DropdownMenu.Trigger>Menu trigger</DropdownMenu.Trigger>
        <DropdownMenu.Portal forceMount>
          <DropdownMenu.Content data-testid={testId}>
            <DropdownMenu.Item>DropdownMenu content</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    ),
  },
  {
    geometryVariables: null,
    name: "SelectMenu",
    render: (testId) => (
      <SelectMenu.Root open value="one">
        <SelectMenu.Trigger aria-label="Selection trigger">
          <SelectMenu.Value />
        </SelectMenu.Trigger>
        <SelectMenu.Portal forceMount>
          <SelectMenu.Content data-testid={testId} position="popper">
            <SelectMenu.Viewport>
              <SelectMenu.Item value="one">
                <SelectMenu.ItemText>SelectMenu content</SelectMenu.ItemText>
              </SelectMenu.Item>
            </SelectMenu.Viewport>
          </SelectMenu.Content>
        </SelectMenu.Portal>
      </SelectMenu.Root>
    ),
  },
];

function createBoundaryContainer(): HTMLElement {
  const container = document.createElement("section");
  container.dataset.testBoundaryContainer = "";
  document.body.append(container);
  return container;
}

function FamilyContent({ family }: { family: PortalFamilyCase }) {
  return family.render(`${family.name}-content`);
}

describe.each(portalFamilies)("$name owned portal", (family) => {
  it("keeps the primitive body fallback when unscoped", () => {
    render(<FamilyContent family={family} />);

    expect(screen.getByTestId(`${family.name}-content`).closest("body")).toBe(document.body);
  });

  it("does not portal to the body while its boundary is pending", () => {
    render(
      <OverlayBoundary container={null} kind="viewport">
        <FamilyContent family={family} />
      </OverlayBoundary>,
    );

    expect(screen.queryByTestId(`${family.name}-content`)).toBeNull();
  });

  it("portals into the dedicated host when its boundary is ready", async () => {
    const container = createBoundaryContainer();

    render(
      <OverlayBoundary container={container} kind="viewport">
        <FamilyContent family={family} />
      </OverlayBoundary>,
      { container },
    );

    const content = await screen.findByTestId(`${family.name}-content`);
    const host = container.querySelector("[data-scaffold-overlay-host]");

    expect(host).not.toBeNull();
    expect(content.closest("[data-scaffold-overlay-host]")).toBe(host);

    if (family.geometryVariables === null) return;

    expect(content.style.getPropertyValue("--sc-overlay-available-inline-size")).toBe(
      `var(${family.geometryVariables.availableInline})`,
    );
    expect(content.style.getPropertyValue("--sc-overlay-available-block-size")).toBe(
      `var(${family.geometryVariables.availableBlock})`,
    );
    expect(content.style.getPropertyValue("--sc-overlay-anchor-inline-size")).toBe(
      `var(${family.geometryVariables.anchorInline})`,
    );
    expect(content.style.getPropertyValue("--sc-overlay-anchor-block-size")).toBe(
      `var(${family.geometryVariables.anchorBlock})`,
    );
    expect(content.classList.contains("sc-overlay-positioned-content")).toBe(true);
  });
});

describe("SelectMenu.Content", () => {
  it("uses popper positioning when position is omitted", async () => {
    render(
      <SelectMenu.Root open value="one">
        <SelectMenu.Trigger aria-label="Default-position selection trigger">
          <SelectMenu.Value />
        </SelectMenu.Trigger>
        <SelectMenu.Portal forceMount>
          <SelectMenu.Content data-testid="default-position-select">
            <SelectMenu.Viewport>
              <SelectMenu.Item value="one">
                <SelectMenu.ItemText>Default-position choice</SelectMenu.ItemText>
              </SelectMenu.Item>
            </SelectMenu.Viewport>
          </SelectMenu.Content>
        </SelectMenu.Portal>
      </SelectMenu.Root>,
    );

    const content = await screen.findByTestId("default-position-select");

    await waitFor(() => expect(content.getAttribute("data-side")).toBe("bottom"));
  });

  it("preserves an explicit item-aligned positioning override", async () => {
    render(
      <SelectMenu.Root open value="one">
        <SelectMenu.Trigger aria-label="Item-aligned selection trigger">
          <SelectMenu.Value />
        </SelectMenu.Trigger>
        <SelectMenu.Portal forceMount>
          <SelectMenu.Content data-testid="item-aligned-select" position="item-aligned">
            <SelectMenu.Viewport>
              <SelectMenu.Item value="one">
                <SelectMenu.ItemText>Item-aligned choice</SelectMenu.ItemText>
              </SelectMenu.Item>
            </SelectMenu.Viewport>
          </SelectMenu.Content>
        </SelectMenu.Portal>
      </SelectMenu.Root>,
    );

    const content = await screen.findByTestId("item-aligned-select");

    expect(content.getAttribute("data-side")).toBeNull();
    expect(content.classList.contains("sc-overlay-positioned-content")).toBe(false);
  });
});

function NestedMenuExample({ container }: { container: HTMLElement }) {
  const [parentOpen, setParentOpen] = useState(false);
  const [childOpen, setChildOpen] = useState(false);

  return (
    <OverlayBoundary container={container} kind="viewport">
      <DropdownMenu.Root open={parentOpen} onOpenChange={setParentOpen}>
        <DropdownMenu.Trigger>Open parent menu</DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content aria-label="Parent menu">
            <DropdownMenu.Label>Parent choices</DropdownMenu.Label>
            <SelectMenu.Root
              open={childOpen}
              onOpenChange={setChildOpen}
              value="one"
              onValueChange={() => undefined}
            >
              <SelectMenu.Trigger aria-label="Open child select">
                <SelectMenu.Value />
              </SelectMenu.Trigger>
              <SelectMenu.Portal>
                <SelectMenu.Content position="popper">
                  <SelectMenu.Viewport>
                    <SelectMenu.Item value="one">
                      <SelectMenu.ItemText>First choice</SelectMenu.ItemText>
                    </SelectMenu.Item>
                    <SelectMenu.Item value="two">
                      <SelectMenu.ItemText>Second choice</SelectMenu.ItemText>
                    </SelectMenu.Item>
                  </SelectMenu.Viewport>
                </SelectMenu.Content>
              </SelectMenu.Portal>
            </SelectMenu.Root>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </OverlayBoundary>
  );
}

describe("nested owned primitives", () => {
  it("dismisses the topmost child first and restores focus to each trigger", async () => {
    const container = createBoundaryContainer();
    render(<NestedMenuExample container={container} />, { container });

    const parentTrigger = screen.getByRole("button", { name: "Open parent menu" });
    await userEvent.click(parentTrigger);

    const parentMenu = await screen.findByRole("menu");
    const childTrigger = screen.getByRole("combobox", { name: "Open child select" });
    await userEvent.click(childTrigger);

    expect(await screen.findByRole("listbox")).not.toBeNull();
    expect(parentMenu.closest("[data-scaffold-overlay-host]")).not.toBeNull();
    expect(screen.getByRole("listbox").closest("[data-scaffold-overlay-host]")).not.toBeNull();

    await userEvent.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("listbox")).toBeNull();
      expect(screen.getByRole("menu")).toBe(parentMenu);
      expect(document.activeElement).toBe(childTrigger);
    });

    await userEvent.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("menu")).toBeNull();
      expect(document.activeElement).toBe(parentTrigger);
    });
  });
});
