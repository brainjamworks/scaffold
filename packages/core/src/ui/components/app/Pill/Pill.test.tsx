// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { AppThemeProvider } from "@/theme/app/AppThemeProvider";

import { Pill } from "./Pill";

describe("Pill", () => {
  it("reflects its visual contract through data attributes", () => {
    const { container } = render(
      <AppThemeProvider appearance="light">
        <main>
          <Pill variant="success" size="sm" tabular case="upper">
            Saved
          </Pill>
        </main>
      </AppThemeProvider>,
    );

    const pill = screen.getByText("Saved");

    expect(pill.closest(".sc-app")).toBe(container.firstElementChild);
    expect(pill.classList.contains("sc-app-pill")).toBe(true);
    expect(pill.getAttribute("data-variant")).toBe("success");
    expect(pill.getAttribute("data-size")).toBe("sm");
    expect(pill.getAttribute("data-tabular")).toBe("true");
    expect(pill.getAttribute("data-case")).toBe("upper");
  });
});
