// @vitest-environment happy-dom

import { cleanup, render, waitFor } from "@testing-library/react";
import type { CSSProperties, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import * as DropdownMenu from "./DropdownMenu";
import { OverlayBoundary } from "../OverlayBoundary/OverlayBoundary";

const dropdownMenuMock = vi.hoisted(() => ({
  subContentProps: [] as Array<Record<string, unknown>>,
}));

vi.mock("@radix-ui/react-dropdown-menu", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@radix-ui/react-dropdown-menu")>();
  const React = await import("react");

  const SubContent = React.forwardRef<
    HTMLDivElement,
    {
      children?: ReactNode;
      className?: string;
      style?: CSSProperties;
      [key: string]: unknown;
    }
  >(function MockDropdownMenuSubContent({ className, style, ...props }, ref) {
    dropdownMenuMock.subContentProps.push({ className, style, ...props });

    return React.createElement("div", { ref });
  });

  return {
    ...actual,
    DropdownMenuSubContent: SubContent,
    SubContent,
  };
});

afterEach(() => {
  cleanup();
  dropdownMenuMock.subContentProps.length = 0;
  document.querySelectorAll("[data-test-dropdown-boundary]").forEach((element) => element.remove());
});

const subContentAliases = [
  ["SubContent", DropdownMenu.SubContent],
  ["DropdownMenuSubContent", DropdownMenu.DropdownMenuSubContent],
] as const;

describe("DropdownMenu submenu content", () => {
  it("exports both submenu names through the same owned wrapper", () => {
    expect(DropdownMenu.DropdownMenuSubContent).toBe(DropdownMenu.SubContent);
  });

  describe.each(subContentAliases)("%s", (_name, SubContent) => {
    it("uses contained boundary geometry and readiness defaults", async () => {
      const container = document.createElement("section");
      const collisionBoundary = document.createElement("div");
      container.dataset.testDropdownBoundary = "";
      container.append(collisionBoundary);
      document.body.append(container);

      render(
        <OverlayBoundary
          container={container}
          collisionBoundary={collisionBoundary}
          kind="contained"
        >
          <SubContent data-testid="submenu-content">Nested choices</SubContent>
        </OverlayBoundary>,
      );

      await waitFor(() => {
        expect(dropdownMenuMock.subContentProps.at(-1)?.collisionBoundary).toBe(collisionBoundary);
      });

      const props = dropdownMenuMock.subContentProps.at(-1);

      expect(props?.className).toContain("sc-overlay-positioned-content");
      expect(props?.style).toEqual(
        expect.objectContaining({
          "--sc-overlay-anchor-block-size": "var(--radix-dropdown-menu-trigger-height)",
          "--sc-overlay-anchor-inline-size": "var(--radix-dropdown-menu-trigger-width)",
          "--sc-overlay-available-block-size":
            "var(--radix-dropdown-menu-content-available-height)",
          "--sc-overlay-available-inline-size":
            "var(--radix-dropdown-menu-content-available-width)",
        }),
      );
    });
  });
});
