// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { Switch } from "./Switch";

describe("Switch", () => {
  it("reflects its visual contract through semantic classes", () => {
    render(<Switch aria-label="Show feedback" checked />);

    const toggle = screen.getByRole("switch", { name: "Show feedback" });

    expect(toggle.classList.contains("sc-switch")).toBe(true);
    expect(toggle.getAttribute("data-state")).toBe("checked");
    expect(toggle.querySelector(".sc-switch-thumb")).not.toBeNull();
  });

  it("preserves consumer class names", () => {
    render(<Switch aria-label="Enabled" className="custom-switch" />);

    const toggle = screen.getByRole("switch", { name: "Enabled" });

    expect(toggle.classList.contains("sc-switch")).toBe(true);
    expect(toggle.classList.contains("custom-switch")).toBe(true);
  });
});
