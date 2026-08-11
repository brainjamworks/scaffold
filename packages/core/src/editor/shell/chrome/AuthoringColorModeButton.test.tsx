// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import { AuthoringColorModeButton } from "./AuthoringColorModeButton";

describe("AuthoringColorModeButton", () => {
  it("describes and invokes the next App colour mode", async () => {
    const onToggle = vi.fn();
    render(<AuthoringColorModeButton mode="light" onToggle={onToggle} />);

    const button = screen.getByRole("button", {
      name: "Switch authoring application to dark mode",
    });
    expect(button).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
