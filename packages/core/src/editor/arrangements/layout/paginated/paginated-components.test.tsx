// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  PaginatedLayoutShell,
  activePageIndex,
  nextPageForKey,
  normalizeActivePageId,
  paginatedPanelAttributes,
  readPaginatedPages,
  readRequiredPaginatedNodeId,
} from "./paginated-components";

describe("paginated layout shared components", () => {
  it("reads page summaries from layout sections", () => {
    const pages = readPaginatedPages({
      childCount: 2,
      child: (index: number) => ({
        attrs:
          index === 0
            ? { id: "page-a", label: "Overview" }
            : { id: "page-b", options: { label: "Practice" } },
      }),
    });

    expect(pages).toEqual([
      { id: "page-a", index: 0, label: "Overview" },
      { id: "page-b", index: 1, label: "Practice" },
    ]);
  });

  it("normalizes active pages and keyboard targets without wrapping", () => {
    const pages = [
      { id: "one", index: 0, label: "Page 1" },
      { id: "two", index: 1, label: "Page 2" },
      { id: "three", index: 2, label: "Page 3" },
    ];

    expect(normalizeActivePageId("two", pages)).toBe("two");
    expect(normalizeActivePageId("missing", pages)).toBe("one");
    expect(activePageIndex("three", pages)).toBe(2);
    expect(nextPageForKey({ key: "ArrowRight", pageId: "one", pages })?.id).toBe("two");
    expect(nextPageForKey({ key: "ArrowRight", pageId: "three", pages })).toBeNull();
    expect(nextPageForKey({ key: "Home", pageId: "three", pages })?.id).toBe("one");
    expect(nextPageForKey({ key: "End", pageId: "one", pages })?.id).toBe("three");
  });

  it("builds stable panel attributes", () => {
    expect(
      paginatedPanelAttributes({
        layoutId: "layout-1",
        pageId: "page-1",
        isActive: false,
      }),
    ).toMatchObject({
      role: "region",
      hidden: true,
      "data-state": "inactive",
    });
  });

  it("renders pager controls and activates pages", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();

    render(
      <PaginatedLayoutShell
        activeId="page-a"
        layoutId="layout-a"
        onActivate={onActivate}
        pages={[
          { id: "page-a", index: 0, label: "Page 1" },
          { id: "page-b", index: 1, label: "Page 2" },
        ]}
      >
        <p>Current page</p>
      </PaginatedLayoutShell>,
    );

    expect(screen.getByRole("navigation", { name: "Pages" })).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(onActivate).toHaveBeenCalledWith("page-b");
  });

  it("requires stable node ids", () => {
    expect(readRequiredPaginatedNodeId("layout-1", "layout")).toBe("layout-1");
    expect(() => readRequiredPaginatedNodeId("", "section")).toThrow(
      "section node is missing a stable id.",
    );
  });
});
