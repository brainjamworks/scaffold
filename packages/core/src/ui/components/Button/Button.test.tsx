// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { Button, buttonVariants } from "./Button";

describe("Button", () => {
  it("reflects its visual contract through data attributes", () => {
    render(
      <Button variant="secondary" size="sm">
        Save
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Save" });

    expect(button.classList.contains("sc-button")).toBe(true);
    expect(button.getAttribute("data-variant")).toBe("secondary");
    expect(button.getAttribute("data-size")).toBe("sm");
    expect(button.getAttribute("type")).toBe("button");
  });

  it("preserves explicit submit buttons", () => {
    render(<Button type="submit">Submit</Button>);

    expect(screen.getByRole("button", { name: "Submit" }).getAttribute("type")).toBe("submit");
  });

  it("supports the Radix Slot asChild pattern", () => {
    render(
      <Button asChild variant="ghost" size="lg">
        <a href="/example">Open</a>
      </Button>,
    );

    const link = screen.getByRole("link", { name: "Open" });

    expect(link.classList.contains("sc-button")).toBe(true);
    expect(link.getAttribute("data-variant")).toBe("ghost");
    expect(link.getAttribute("data-size")).toBe("lg");
    expect(link.getAttribute("type")).toBeNull();
  });

  it("keeps the exported variant helper available", () => {
    expect(buttonVariants({ variant: "primary", size: "md" })).toBe("sc-button");
  });
});
