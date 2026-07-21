// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { MediaReplaceButton } from "./MediaReplaceButton";

vi.mock("@phosphor-icons/react", () => ({
  ArrowsClockwiseIcon: () => <svg data-glyph="replace" />,
}));

afterEach(cleanup);

describe("MediaReplaceButton", () => {
  it("uses the shared circular overlay treatment without visible button text", () => {
    render(<MediaReplaceButton aria-label="Replace cover image" />);

    const button = screen.getByRole("button", { name: "Replace cover image" });
    expect(button).toHaveClass("sc-icon-button", "sc-media-overlay-button");
    expect(button).toHaveTextContent("");
    expect(button.querySelector('[data-glyph="replace"]')).not.toBeNull();
  });

  it("describes the action as Replace image", async () => {
    const user = userEvent.setup();
    render(<MediaReplaceButton aria-label="Replace cover image" />);

    await user.hover(screen.getByRole("button", { name: "Replace cover image" }));

    expect(await screen.findByRole("tooltip")).toHaveTextContent("Replace image");
  });
});
