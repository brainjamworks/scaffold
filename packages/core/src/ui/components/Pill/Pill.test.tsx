// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { Pill } from "./Pill";

describe("Pill", () => {
  it("reflects its visual contract through data attributes", () => {
    render(
      <Pill variant="success" size="sm" tabular case="upper">
        Saved
      </Pill>,
    );

    const pill = screen.getByText("Saved");

    expect(pill.classList.contains("sc-pill")).toBe(true);
    expect(pill.getAttribute("data-variant")).toBe("success");
    expect(pill.getAttribute("data-size")).toBe("sm");
    expect(pill.getAttribute("data-tabular")).toBe("true");
    expect(pill.getAttribute("data-case")).toBe("upper");
  });
});
