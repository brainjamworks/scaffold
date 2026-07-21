// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { IconButton, iconButtonVariants } from "./IconButton";

describe("IconButton", () => {
  it("reflects its visual contract through data attributes", () => {
    render(
      <IconButton aria-label="Close" variant="inline" size="sm">
        x
      </IconButton>,
    );

    const button = screen.getByRole("button", { name: "Close" });

    expect(button.classList.contains("sc-icon-button")).toBe(true);
    expect(button.getAttribute("data-variant")).toBe("inline");
    expect(button.getAttribute("data-size")).toBe("sm");
    expect(button.getAttribute("type")).toBe("button");
  });

  it("preserves explicit submit buttons", () => {
    render(
      <IconButton aria-label="Submit icon action" type="submit">
        x
      </IconButton>,
    );

    expect(screen.getByRole("button", { name: "Submit icon action" }).getAttribute("type")).toBe(
      "submit",
    );
  });

  it("keeps the exported variant helper available", () => {
    expect(iconButtonVariants({ variant: "ghost", size: "md" })).toBe("sc-icon-button");
  });
});
