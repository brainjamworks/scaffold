// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { Checkbox } from "./Checkbox";

describe("Checkbox", () => {
  it("reflects its visual contract through semantic classes", () => {
    render(<Checkbox aria-label="Required" checked invalid />);

    const checkbox = screen.getByRole("checkbox", { name: "Required" });

    expect(checkbox.classList.contains("sc-checkbox")).toBe(true);
    expect(checkbox.getAttribute("aria-invalid")).toBe("true");
    expect(checkbox.getAttribute("data-state")).toBe("checked");
  });

  it("preserves consumer class names", () => {
    render(<Checkbox aria-label="Enabled" className="custom-checkbox" />);

    const checkbox = screen.getByRole("checkbox", { name: "Enabled" });

    expect(checkbox.classList.contains("sc-checkbox")).toBe(true);
    expect(checkbox.classList.contains("custom-checkbox")).toBe(true);
  });
});
