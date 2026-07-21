// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { MediaExpandButton } from "./MediaExpandButton";

vi.mock("@phosphor-icons/react", () => ({
  ArrowsOutSimpleIcon: () => <svg data-glyph="expand" />,
  PencilSimpleIcon: () => <svg data-glyph="edit" />,
}));

afterEach(cleanup);

describe("MediaExpandButton", () => {
  it("renders a standalone accessible expand button with its tooltip", async () => {
    const user = userEvent.setup();

    render(
      <MediaExpandButton aria-label="Expand annotated media" tooltipLabel="Open expanded view" />,
    );

    const button = screen.getByRole("button", { name: "Expand annotated media" });
    await user.hover(button);

    expect(await screen.findByRole("tooltip")).toHaveTextContent("Open expanded view");
  });

  it("calls consumer handlers without crossing the media interaction boundary", async () => {
    const user = userEvent.setup();
    const onBoundaryClick = vi.fn();
    const onBoundaryPointerDown = vi.fn();
    const onClick = vi.fn();
    const onPointerDown = vi.fn();

    render(
      <div onClick={onBoundaryClick} onPointerDown={onBoundaryPointerDown}>
        <MediaExpandButton
          aria-label="Expand media"
          tooltipLabel="Expand"
          onClick={onClick}
          onPointerDown={onPointerDown}
        />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Expand media" }));

    expect(onPointerDown).toHaveBeenCalledOnce();
    expect(onClick).toHaveBeenCalledOnce();
    expect(onBoundaryPointerDown).not.toHaveBeenCalled();
    expect(onBoundaryClick).not.toHaveBeenCalled();
  });

  it("does not render when the consumer hides it", () => {
    render(<MediaExpandButton aria-label="Expand media" tooltipLabel="Expand" hidden />);

    expect(screen.queryByRole("button", { name: "Expand media" })).toBeNull();
  });

  it("uses a pencil glyph for authoring editor affordances", () => {
    render(
      <MediaExpandButton
        aria-label="Edit annotated media"
        glyph="edit"
        tooltipLabel="Edit media"
      />,
    );

    const button = screen.getByRole("button", { name: "Edit annotated media" });
    expect(button.querySelector('[data-glyph="edit"]')).not.toBeNull();
    expect(button.querySelector('[data-glyph="expand"]')).toBeNull();
  });
});
