// @vitest-environment happy-dom

import { cleanup, render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { MediaWorkspace } from "./MediaWorkspace";

afterEach(cleanup);

describe("MediaWorkspace", () => {
  it("composes labelled canvas and management regions with an ordered list", () => {
    render(
      <MediaWorkspace.Root data-workspace-owner="test-media">
        <MediaWorkspace.Canvas aria-label="Annotation canvas">Canvas</MediaWorkspace.Canvas>
        <MediaWorkspace.Sidebar aria-label="Caption management">
          <MediaWorkspace.SidebarHeader
            title="Captions"
            description="Select a pin or row to edit its caption."
            count={2}
            countLabel="2 total annotations"
          />
          <MediaWorkspace.List aria-label="Annotation captions">
            <MediaWorkspace.Item>
              <MediaWorkspace.ItemHeader>
                <MediaWorkspace.ItemSelect aria-label="Select annotation 1 caption">
                  <MediaWorkspace.ItemNumber aria-hidden>1</MediaWorkspace.ItemNumber>
                  Annotation 1
                </MediaWorkspace.ItemSelect>
              </MediaWorkspace.ItemHeader>
            </MediaWorkspace.Item>
          </MediaWorkspace.List>
        </MediaWorkspace.Sidebar>
      </MediaWorkspace.Root>,
    );

    const canvas = screen.getByRole("region", { name: "Annotation canvas" });
    const sidebar = screen.getByRole("region", { name: "Caption management" });
    const list = screen.getByRole("list", { name: "Annotation captions" });

    expect(screen.getByText("Canvas")).toBe(canvas);
    expect(within(sidebar).getByRole("heading", { name: "Captions", level: 3 })).toBeVisible();
    expect(within(sidebar).getByText("Select a pin or row to edit its caption.")).toBeVisible();
    expect(within(sidebar).getByLabelText("2 total annotations")).toHaveTextContent("2");
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(
      within(list).getByRole("button", { name: "Select annotation 1 caption" }),
    ).toHaveAttribute("type", "button");
    expect(canvas.parentElement).toBe(sidebar.parentElement);
    expect(canvas.closest('[data-workspace-owner="test-media"]')).not.toBeNull();
  });

  it("projects selected state while preserving normal list item props", () => {
    render(
      <MediaWorkspace.Root>
        <MediaWorkspace.Canvas aria-label="Hotspot canvas" />
        <MediaWorkspace.Sidebar aria-label="Hotspot management">
          <MediaWorkspace.List aria-label="Hotspots">
            <MediaWorkspace.Item aria-label="Hotspot one" data-hotspot-id="hotspot-1" selected>
              Hotspot 1
            </MediaWorkspace.Item>
            <MediaWorkspace.Item aria-label="Hotspot two">Hotspot 2</MediaWorkspace.Item>
          </MediaWorkspace.List>
        </MediaWorkspace.Sidebar>
      </MediaWorkspace.Root>,
    );

    expect(screen.getByRole("listitem", { name: "Hotspot one" })).toHaveAttribute(
      "data-selected",
      "true",
    );
    expect(screen.getByRole("listitem", { name: "Hotspot one" })).toHaveAttribute(
      "data-hotspot-id",
      "hotspot-1",
    );
    expect(screen.getByRole("listitem", { name: "Hotspot two" })).toHaveAttribute(
      "data-selected",
      "false",
    );
  });

  it("renders a shared empty state without owning its copy", () => {
    render(
      <MediaWorkspace.Root>
        <MediaWorkspace.Canvas aria-label="Media canvas" />
        <MediaWorkspace.Sidebar aria-label="Media management">
          <MediaWorkspace.Empty>
            <strong>No regions yet</strong>
            <span>Draw a region on the image or add one from the toolbar.</span>
          </MediaWorkspace.Empty>
        </MediaWorkspace.Sidebar>
      </MediaWorkspace.Root>,
    );

    const sidebar = screen.getByRole("region", { name: "Media management" });
    expect(within(sidebar).getByText("No regions yet")).toBeVisible();
    expect(
      within(sidebar).getByText("Draw a region on the image or add one from the toolbar."),
    ).toBeVisible();
  });

  it("forwards canvas and ordered-list refs to their DOM elements", () => {
    const canvasRef = createRef<HTMLDivElement>();
    const listRef = createRef<HTMLOListElement>();

    render(
      <MediaWorkspace.Root>
        <MediaWorkspace.Canvas ref={canvasRef} aria-label="Media canvas" />
        <MediaWorkspace.Sidebar aria-label="Media management">
          <MediaWorkspace.List ref={listRef} aria-label="Media items" />
        </MediaWorkspace.Sidebar>
      </MediaWorkspace.Root>,
    );

    expect(canvasRef.current?.tagName).toBe("DIV");
    expect(listRef.current?.tagName).toBe("OL");
  });
});
